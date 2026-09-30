/**
 * eval-unsure.ts — does the "Not sure" rule separate real findings from false ones?
 *
 *   npx tsx --env-file=.env scripts/eval-unsure.ts
 *
 * Every finding on a staged later-visit photo is labelled TRUE if it overlaps a staged change
 * in seed/ground-truth.json (centre inside the change box grown by 5% of the frame, or any
 * overlap), otherwise FALSE. Prints each finding's signals and the precision of the
 * "sure" and "not sure" buckets under lib/certainty.ts.
 */

import fs from "fs";
import path from "path";
import { getDatabase } from "../src/lib/db";
import { deriveMeasures, listEvents } from "../src/lib/events";
import { certaintyOf } from "../src/lib/certainty";
import { markPreExisting } from "../src/lib/snapshot";

const GT = JSON.parse(fs.readFileSync(path.join(process.cwd(), "seed/ground-truth.json"), "utf8"));
type Box = [number, number, number, number];
const hit = (o: Box, g: Box) => {
  const cx = (o[0] + o[2]) / 2, cy = (o[1] + o[3]) / 2, m = 0.05;
  const inside = cx >= g[0] - m && cx <= g[2] + m && cy >= g[1] - m && cy <= g[3] + m;
  const overlap = o[0] < g[2] && g[0] < o[2] && o[1] < g[3] && g[1] < o[3];
  return inside || overlap;
};

async function main() {
  const db = getDatabase();
  const insps = await db.getInspections("prop-381");
  const assets = await db.getAssetsForInspections(insps.map((i) => i.id));
  const measures = deriveMeasures(await listEvents("prop-381"));
  const pre = new Map(markPreExisting(insps, assets, await db.getObservationsForAssets(assets.map((a) => a.id))).map((o) => [o.id, o.pre_existing]));
  const rows: { truth: boolean; unsure: boolean; why: string[] }[] = [];
  for (const a of assets) {
    const year = a.cloudinary_public_id.match(/(20\d\d)/)?.[1];
    const pair = GT.pairs.find((p: any) => p.current.startsWith(`${year}/`) && a.cloudinary_public_id.includes(`/${p.room}/`));
    if (!pair) continue; // move-in photos: no ground truth for "change"
    for (const o of await db.getObservations(a.id)) {
      const truth = pair.changes.some((c: any) => hit(o.bbox as Box, c.bbox));
      const c = certaintyOf({ confidence: o.confidence, description: o.description, pre_existing: pre.get(o.id) }, measures[o.id], null);
      rows.push({ truth, unsure: c.unsure, why: c.reasons });
      console.log(`${truth ? "TRUE " : "FALSE"}  ${c.unsure ? "not sure" : "sure    "}  conf ${o.confidence.toFixed(2)}  extent ${((measures[o.id]?.extent ?? NaN) * 1e4).toFixed(1).padStart(5)}‱  ${a.id} ${o.category.padEnd(7)} ${pre.get(o.id) ? "[pre-existing] " : ""}${c.pixel_only ? "[pixel-only] " : ""}${c.reasons.join("; ")}`);
    }
  }
  const sure = rows.filter((r) => !r.unsure), unsure = rows.filter((r) => r.unsure);
  const prec = (x: typeof rows) => (x.length ? `${x.filter((r) => r.truth).length}/${x.length} true` : "empty");
  console.log(`\nall findings: ${prec(rows)}\nsure bucket: ${prec(sure)}\nnot-sure bucket: ${prec(unsure)}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
