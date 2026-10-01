/**
 * backfill-roommatch.ts — runs the room-match check on photos that have not had one.
 *   npx tsx --env-file=.env scripts/backfill-roommatch.ts
 * Pixels only (no model calls). Photos are processed oldest first, so each room's first
 * photo becomes its reference.
 */
import { getDatabase } from "../src/lib/db";
import { deriveRoomMatch, listEvents } from "../src/lib/events";
import { checkRoomMatch } from "../src/lib/roommatch-node";

async function main() {
  const db = getDatabase();
  for (const p of await db.listProperties()) {
    const insps = (await db.getInspections(p.id)).sort((a, b) => a.captured_at.localeCompare(b.captured_at));
    const order = new Map(insps.map((i, k) => [i.id, k]));
    const done = deriveRoomMatch(await listEvents(p.id, ["roommatch"]));
    const assets = (await db.getAssetsForInspections(insps.map((i) => i.id)))
      .filter((a) => (a.resource_type ?? "image") === "image" && !done[a.id])
      .sort((a, b) => (order.get(a.inspection_id)! - order.get(b.inspection_id)!) || a.created_at.localeCompare(b.created_at));
    for (const a of assets) {
      const r = await checkRoomMatch(a, p.id);
      console.log(`${p.id} ${a.id.padEnd(24)} ${a.room_id.padEnd(17)} → ${r?.verdict} (view ${r?.view ?? "—"}, hash ${r?.phash ?? "—"})`);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
