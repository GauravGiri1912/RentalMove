/**
 * clean-demo-data.mjs — removes test junk and fabricated review data from the demo dataset.
 *
 *   node scripts/clean-demo-data.mjs          # dry run: prints what WOULD change
 *   node scripts/clean-demo-data.mjs --apply  # performs the changes
 *
 * Keeps ONLY the canonical demo set (property prop-381, its 3 inspections, assets
 * asset-01..08, the 2 demo users, the demo share link) and:
 *   - deletes every other inspection / asset / observation / comparison / share link / property
 *   - deletes the hand-written comparison ("comp-381-kitchen-01") produced by an old seed fallback
 *   - resets the review state of the remaining AI findings to "pending" and removes reviewer
 *     notes/stamps: no human reviewed them, so the data must not claim otherwise
 *   - deletes rooms nothing references (duplicates)
 * Applies the same cleanup to data/rentalmove-store.json.
 *
 * Regenerate the AI findings themselves with:  npx tsx scripts/seed-demo-assets.ts
 */

import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

const CANONICAL = {
  property: "prop-381",
  inspections: ["insp-2024-move-in", "insp-2025-periodic", "insp-2026-move-out"],
  assets: ["asset-01", "asset-02", "asset-03", "asset-04", "asset-05", "asset-06", "asset-07", "asset-08"],
  shareToken: "demo-token-9842f1a",
  users: ["user-tenant-1", "user-owner-1"],
};

function loadEnv() {
  const env = { ...process.env };
  for (const name of [".env.local", ".env"]) {
    if (!fs.existsSync(name)) continue;
    const parsed = {};
    for (const line of fs.readFileSync(name, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) parsed[m[1]] = m[2].replace(/^["']|["']$/g, ""); // last duplicate wins, like dotenv
    }
    for (const [k, v] of Object.entries(parsed)) if (env[k] === undefined) env[k] = v;
  }
  return env;
}

const say = (msg) => console.log(`${APPLY ? "" : "[dry-run] "}${msg}`);

async function cleanSupabase(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return console.log("Supabase not configured; skipping.");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const del = async (table, col, ids, label) => {
    if (ids.length === 0) return;
    say(`delete ${ids.length} ${label}`);
    if (APPLY) {
      const { error } = await db.from(table).delete().in(col, ids);
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  };
  const all = async (table, cols) => {
    const { data, error } = await db.from(table).select(cols);
    if (error) throw new Error(`${table}: ${error.message}`);
    return data;
  };

  console.log("\n== Supabase ==");
  await del("comparisons", "id", (await all("comparisons", "id")).map((r) => r.id), "comparison(s) (all are fabricated or test data)");

  const assets = await all("assets", "id,room_id");
  await del("assets", "id", assets.filter((a) => !CANONICAL.assets.includes(a.id)).map((a) => a.id), "non-canonical asset(s)");

  const inspections = await all("inspections", "id");
  await del("inspections", "id", inspections.filter((i) => !CANONICAL.inspections.includes(i.id)).map((i) => i.id), "test inspection(s)");

  const props = await all("properties", "id");
  await del("properties", "id", props.filter((p) => p.id !== CANONICAL.property).map((p) => p.id), "test property/properties");

  const links = await all("share_links", "token");
  await del("share_links", "token", links.filter((l) => l.token !== CANONICAL.shareToken).map((l) => l.token), "test share link(s)");

  // Observations that belong to non-canonical assets are already removed by cascade; also drop
  // any stragglers, then reset review state on the rest.
  // Seed findings have ids like "obs-asset-01-1"; anything else on a canonical asset was left by tests.
  const isSeedObs = (o) => /^obs-asset-\d+-\d+$/.test(o.id) && CANONICAL.assets.includes(o.asset_id);
  const obs = await all("observations", "id,asset_id");
  await del("observations", "id", obs.filter((o) => !isSeedObs(o)).map((o) => o.id), "test/orphan observation(s)");
  say("reset review state of remaining AI findings to pending (clear reviewer notes/stamps)");
  if (APPLY) {
    const { error } = await db
      .from("observations")
      .update({ review_status: "pending", reviewer_note: null, reviewed_by: null, reviewed_at: null, edited_from: null })
      .in("asset_id", CANONICAL.assets);
    if (error) throw new Error(`observations reset: ${error.message}`);
  }

  // Rooms nothing references
  const rooms = await all("rooms", "id,property_id");
  const usedRooms = new Set(assets.filter((a) => CANONICAL.assets.includes(a.id)).map((a) => a.room_id));
  const unused = rooms.filter((r) => r.property_id === CANONICAL.property && !usedRooms.has(r.id));
  // Keep one room per category the demo uses; only remove exact duplicates of a used room's name.
  const usedNames = new Set(rooms.filter((r) => usedRooms.has(r.id)).map((r) => r.id.replace(/^room-/, "").replace(/-room$/, "")));
  const dupes = unused.filter((r) => usedNames.has(r.id.replace(/^room-/, "").replace(/-room$/, "")));
  await del("rooms", "id", dupes.map((r) => r.id), "duplicate room(s)");

  const { count } = await db.from("assets").select("*", { count: "exact", head: true });
  console.log(`assets remaining: ${count}`);
}

function cleanLocalStore() {
  const file = "data/rentalmove-store.json";
  if (!fs.existsSync(file)) return;
  console.log("\n== data/rentalmove-store.json ==");
  const s = JSON.parse(fs.readFileSync(file, "utf8"));
  const before = { assets: s.assets.length, inspections: s.inspections.length, comparisons: s.comparisons.length };

  s.comparisons = [];
  s.assets = s.assets.filter((a) => CANONICAL.assets.includes(a.id));
  s.inspections = s.inspections.filter((i) => CANONICAL.inspections.includes(i.id));
  s.properties = s.properties.filter((p) => p.id === CANONICAL.property);
  s.share_links = s.share_links.filter((l) => l.token === CANONICAL.shareToken);
  s.observations = s.observations
    .filter((o) => /^obs-asset-\d+-\d+$/.test(o.id) && CANONICAL.assets.includes(o.asset_id))
    .map((o) => ({ ...o, review_status: "pending", reviewer_note: null, reviewed_by: null, reviewed_at: null, edited_from: null }));

  say(`assets ${before.assets}->${s.assets.length}, inspections ${before.inspections}->${s.inspections.length}, comparisons ${before.comparisons}->0, observations reset to pending`);
  if (APPLY) fs.writeFileSync(file, JSON.stringify(s, null, 2), "utf8");
}

const env = loadEnv();
console.log(APPLY ? "APPLYING changes" : "DRY RUN (add --apply to change anything)");
await cleanSupabase(env);
cleanLocalStore();
console.log(APPLY ? "\nDone." : "\nNothing was changed. Re-run with --apply.");
