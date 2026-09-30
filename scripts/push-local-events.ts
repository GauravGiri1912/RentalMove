/**
 * push-local-events.ts — after applying supabase/migrations/0003_studio_events.sql, copies
 * events recorded in the local fallback file (data/rentalmove-events.json) into Supabase
 * rm_events. Idempotent: upserts by event id.
 *
 *   npx tsx scripts/push-local-events.ts
 */

import fs from "fs";
import path from "path";
import { getSupabaseClient, isSupabaseConfigured } from "../src/lib/supabase";

async function main() {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured");
  const file = process.env.RENTALMOVE_EVENTS_PATH || path.join(process.cwd(), "data", "rentalmove-events.json");
  if (!fs.existsSync(file)) { console.log("No local events file — nothing to push."); return; }
  const events = JSON.parse(fs.readFileSync(file, "utf8"));
  const sb = getSupabaseClient()!;
  const probe = await sb.from("rm_events").select("id").limit(1);
  if (probe.error) throw new Error(`rm_events not reachable (${probe.error.message}). Apply supabase/migrations/0003_studio_events.sql first.`);
  for (let i = 0; i < events.length; i += 200) {
    const chunk = events.slice(i, i + 200);
    const { error } = await sb.from("rm_events").upsert(chunk, { onConflict: "id" });
    if (error) throw new Error(`Upsert failed at ${i}: ${error.message}`);
    console.log(`Pushed ${Math.min(i + 200, events.length)} / ${events.length}`);
  }
  console.log("Done. The app now reads events from Supabase (sidebar shows “Event log: supabase”).");
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
