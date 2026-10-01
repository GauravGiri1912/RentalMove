/**
 * eval-roommatch.ts — can we tell a photo of the right room from a wrong one?
 *
 *   npx tsx --env-file=.env scripts/eval-roommatch.ts
 *
 * Signals per (photo, reference = earliest photo of the room it was filed under):
 *   view   correlation of the two photos after alignment (as in the repair check)
 *   phash  Cloudinary perceptual-hash distance (bits of 64)
 * Groups: SAME = later demo photos vs their own room's move-in photo; WRONG-REAL = phone
 * photos filed under a room they do not show; HARD = every demo photo vs the move-in photo
 * of a different room (a look-alike decoy). No API calls beyond Cloudinary delivery.
 */

import { getDatabase } from "../src/lib/db";
import { deriveFingerprints, listEvents } from "../src/lib/events";
import { hamming } from "../src/lib/fingerprint";
import { loadGray } from "../src/lib/pixel-node";
import { pixelUrl } from "../src/lib/grounding";
import { viewMatch } from "../src/lib/measure-node";

async function main() {
  const db = getDatabase();
  const insps = (await db.getInspections("prop-381")).sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  const assets = await db.getAssetsForInspections(insps.map((i) => i.id));
  const fp = deriveFingerprints(await listEvents("prop-381"));
  const when = new Map(insps.map((i) => [i.id, i.captured_at]));
  const byRoom = new Map<string, typeof assets>();
  for (const a of [...assets].sort((x, y) => (when.get(x.inspection_id) ?? "").localeCompare(when.get(y.inspection_id) ?? "") || x.created_at.localeCompare(y.created_at)))
    byRoom.set(a.room_id, [...(byRoom.get(a.room_id) ?? []), a]);
  const ref = new Map([...byRoom].map(([room, list]) => [room, list[0]]));
  const gray = new Map<string, Awaited<ReturnType<typeof loadGray>>>();
  const g = async (a: (typeof assets)[0]) => { if (!gray.has(a.id)) gray.set(a.id, await loadGray(pixelUrl(a.cloudinary_public_id))); return gray.get(a.id)!; };
  const seed = (a: (typeof assets)[0]) => /^asset-\d\d$/.test(a.id);

  const rows: { group: string; label: string; view: number; phash: number }[] = [];
  const score = async (group: string, a: (typeof assets)[0], r: (typeof assets)[0]) => {
    const gr = await g(r), ga = await g(a);
    const view = viewMatch(gr, ga);
    const ph = fp[a.id]?.phash && fp[r.id]?.phash ? hamming(fp[a.id].phash, fp[r.id].phash) : NaN;
    rows.push({ group, label: `${a.id.slice(0, 16).padEnd(16)} ${a.room_id.padEnd(17)} vs ${r.id}`, view, phash: ph });
  };
  for (const a of assets) {
    const r = ref.get(a.room_id)!;
    if (a.id === r.id) continue;
    await score(seed(a) ? "SAME" : "WRONG-REAL", a, r);
  }
  for (const a of assets.filter(seed)) for (const [room, r] of ref) if (room !== a.room_id) await score("HARD", a, r);

  for (const grp of ["SAME", "WRONG-REAL", "HARD"]) {
    const list = rows.filter((x) => x.group === grp);
    console.log(`\n${grp} (${list.length})`);
    for (const x of list.slice(0, 12)) console.log(`  ${x.label}  view ${x.view.toFixed(3)}  phash ${Number.isNaN(x.phash) ? "—" : x.phash}`);
    const v = list.map((x) => x.view);
    console.log(`  view range ${Math.min(...v).toFixed(3)} … ${Math.max(...v).toFixed(3)}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
