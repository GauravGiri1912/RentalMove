/**
 * push-local-events.ts — after applying supabase/migrations/0003_studio_events.sql, copies
 * events recorded in the local fallback file (data/rentalmove-events.json) into Supabase
 * rm_events, then verifies the copy. Idempotent: upserts by event id, so it can be re-run
 * (e.g. if the local server wrote more events before it was restarted).
 *
 *   npx tsx --env-file=.env scripts/push-local-events.ts
 *
 * Events are sent in file order (= the order they were written), so the table's insertion
 * sequence (seq) preserves replay order even where timestamps tie.
 */

import fs from "fs";
import path from "path";
import { getSupabaseClient, isSupabaseConfigured } from "../src/lib/supabase";
import { listEvents, type PropertyEvent } from "../src/lib/events";

async function main() {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured");
  const file = process.env.RENTALMOVE_EVENTS_PATH || path.join(process.cwd(), "data", "rentalmove-events.json");
  if (!fs.existsSync(file)) { console.log("No local events file — nothing to push."); return; }
  const events: PropertyEvent[] = JSON.parse(fs.readFileSync(file, "utf8"));
  const sb = getSupabaseClient()!;

  const probe = await sb.from("rm_events").select("id, seq").limit(1);
  if (probe.error) {
    throw new Error(/seq/.test(probe.error.message)
      ? `rm_events exists but has no "seq" column — run the updated supabase/migrations/0003_studio_events.sql again (it is safe to re-run).`
      : `rm_events not reachable (${probe.error.message}). Apply supabase/migrations/0003_studio_events.sql first.`);
  }

  // Only events not already there, in file order (re-runs add just the new ones, at the end).
  const existing = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("rm_events").select("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    (data ?? []).forEach((r: any) => existing.add(r.id));
    if (!data || data.length < 1000) break;
  }
  const todo = events.filter((e) => !existing.has(e.id));
  console.log(`Local events: ${events.length} · already in Supabase: ${existing.size} · to copy: ${todo.length}`);
  for (let i = 0; i < todo.length; i += 100) {
    const chunk = todo.slice(i, i + 100);
    const { error } = await sb.from("rm_events").insert(chunk);
    if (error) throw new Error(`Insert failed at ${i}: ${error.message}`);
    console.log(`  copied ${Math.min(i + 100, todo.length)} / ${todo.length}`);
  }

  // Verify: same events, same replay order, per property.
  let ok = true;
  for (const pid of [...new Set(events.map((e) => e.property_id))]) {
    const local = events.filter((e) => e.property_id === pid).map((e) => e.id);
    const remote = (await listEvents(pid)).map((e) => e.id);
    const sameSet = local.length === remote.length && local.every((id) => remote.includes(id));
    const sameOrder = sameSet && local.every((id, i) => remote[i] === id);
    console.log(`  ${pid}: local ${local.length}, Supabase ${remote.length} · same events: ${sameSet ? "yes" : "NO"} · same order: ${sameOrder ? "yes" : "NO"}`);
    ok &&= sameSet && sameOrder;
  }
  console.log(ok ? "Done. Restart the server; the sidebar should show “Event log: supabase”." : "Verification failed — see above.");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
