/**
 * eval-change-detection.ts — measures how well RentalMove localises changes.
 *
 * Uses seed/ground-truth.json (staged changes with exact boxes). For every pair it runs the
 * pixel engine twice: on the capture as-is, and on a simulated handheld re-shot (5% zoom +
 * shift), which is what real move-out photos look like. Optionally (--vlm) it also asks the
 * vision model for findings and reports box accuracy before and after pixel grounding.
 *
 *   npx tsx scripts/eval-change-detection.ts          # pixel engine only (no API calls)
 *   npx tsx scripts/eval-change-detection.ts --vlm    # + Groq vision model (uses API quota)
 *   npx tsx scripts/eval-change-detection.ts --vlm --runs 5   # repeat the model part, report mean + range
 *
 * Writes docs/eval/change-detection.json and prints a summary table.
 */

import fs from "fs";
import path from "path";
import sharp from "sharp";
import { changeMap, regionsInCurrentFrame } from "../src/lib/pixel-node";
import { ground, iou, type BBox } from "../src/lib/pixel";
import { fromLongSide } from "../src/lib/vision";

const ROOT = process.cwd();
const GT = JSON.parse(fs.readFileSync(path.join(ROOT, "seed/ground-truth.json"), "utf8"));
const useVlm = process.argv.includes("--vlm");
/** --runs N repeats the vision-model part N times (the pixel part is deterministic). */
const RUNS = Math.max(1, Number(process.argv[process.argv.indexOf("--runs") + 1]) || 1);
/** A staged change counts as found when the best box overlaps it with IoU ≥ this. */
const FOUND_IOU = 0.1;
/** Differences smaller than this count as "equal". */
const EQUAL_TOL = 0.01;

const centreIn = (g: BBox, r: BBox) => {
  const cx = (g[0] + g[2]) / 2, cy = (g[1] + g[3]) / 2;
  return cx >= r[0] && cx <= r[2] && cy >= r[1] && cy <= r[3];
};
const overlaps = (a: BBox, b: BBox) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

async function handheld(buf: Buffer): Promise<Buffer> {
  // Zoom 5% and shift ~44 px / 30 px: a typical re-capture from roughly the same spot.
  return sharp(buf).resize(1260, 941).extract({ left: 44, top: 30, width: 1200, height: 896 }).jpeg({ quality: 88 }).toBuffer();
}

/** Maps a box from the captured frame into the extra simulated re-shot's frame (same transform as handheld()). */
function toHandheld(b: BBox): BBox {
  const fx = (x: number) => (x * 1260 - 44) / 1200, fy = (y: number) => (y * 941 - 30) / 896;
  return [fx(b[0]), fy(b[1]), fx(b[2]), fy(b[3])];
}

interface Row { pair: string; condition: string; changes: number; detected: number; meanIou: number; falseRegions: number; ms: number; alignScore?: number }

async function main() {
  const rows: Row[] = [];
  const vlmRows: any[] = [];
  let vision: any = null;
  if (useVlm) {
    const { getVisionProvider } = await import("../src/lib/vision");
    vision = getVisionProvider();
  }

  for (const p of GT.pairs) {
    const prior = fs.readFileSync(path.join(ROOT, "seed/images", p.prior));
    const current = fs.readFileSync(path.join(ROOT, "seed/images", p.current));
    const name = `${p.room} ${p.current.slice(0, 4)}`;
    for (const condition of ["as captured", "handheld re-shot"] as const) {
      const cur = condition === "as captured" ? current : await handheld(current);
      const t0 = Date.now();
      const m = await changeMap(prior, cur);
      const ms = Date.now() - t0;
      // Compare in the current photo's frame (where boxes are drawn); ground truth is in the
      // captured frame, so move it into the re-shot frame for the second condition.
      const regions = regionsInCurrentFrame(m) as BBox[];
      const gts = p.changes.map((c: any) => (condition === "as captured" ? c.bbox : toHandheld(c.bbox)) as BBox);
      const detected = gts.filter((g: BBox) => regions.some((r) => centreIn(g, r) || iou(g, r) > 0.1)).length;
      const ious = gts.map((g: BBox) => Math.max(0, ...regions.map((r) => iou(g, r))));
      const falseRegions = regions.filter((r) => !gts.some((g: BBox) => overlaps(g, r))).length;
      rows.push({ pair: name, condition, changes: gts.length, detected, meanIou: ious.length ? ious.reduce((a: number, b: number) => a + b, 0) / ious.length : 1, falseRegions, ms, alignScore: m.alignment.score });

      if (vision && condition === "as captured" && gts.length) {
        const dataUrl = "data:image/jpeg;base64," + current.toString("base64");
        const meta = await sharp(current).metadata();
        for (let run = 1; run <= RUNS; run++) {
          // Raw model answer (no size passed, so no correction inside analyzeImage).
          const a = await vision.analyzeImage({ imageUrl: dataUrl, roomHint: p.room });
          const boxes = a.observations.map((o: any) => o.bbox as BBox);
          // Same answer with the long-side correction (lib/vision.ts fromLongSide).
          const fixed = a.observations.map((o: any) => (o.box_space === "fraction" ? fromLongSide(o.bbox, meta.width!, meta.height!) : o.bbox) as BBox);
          const best = (list: BBox[], g: BBox, snap: boolean) => Math.max(0, ...list.map((b) => { const gr = snap ? ground(b, regions) : null; return gr ? iou(g, gr.box) : iou(g, b); }));
          for (const g of p.changes) {
            vlmRows.push({
              run, pair: name, change: g.label, modelFindings: a.observations.length,
              raw: +best(boxes, g.bbox, false).toFixed(3), fixed: +best(fixed, g.bbox, false).toFixed(3),
              grounded: +best(boxes, g.bbox, true).toFixed(3), groundedFixed: +best(fixed, g.bbox, true).toFixed(3),
            });
          }
        }
      }
    }
  }

  const sum = (f: (r: Row) => number, cond: string) => rows.filter((r) => r.condition === cond).reduce((a, r) => a + f(r), 0);
  const summary: Record<string, any> = {};
  for (const cond of ["as captured", "handheld re-shot"]) {
    const n = sum((r) => r.changes, cond);
    summary[cond] = {
      recall: +(sum((r) => r.detected, cond) / n).toFixed(3),
      meanIou: +(rows.filter((r) => r.condition === cond && r.changes).reduce((a, r) => a + r.meanIou * r.changes, 0) / n).toFixed(3),
      falseRegions: sum((r) => r.falseRegions, cond),
      falseRegionsOnNoChangePair: rows.filter((r) => r.condition === cond && r.changes === 0).reduce((a, r) => a + r.falseRegions, 0),
      meanMs: Math.round(sum((r) => r.ms, cond) / rows.filter((r) => r.condition === cond).length),
    };
  }
  if (vlmRows.length) {
    const runs = [...new Set(vlmRows.map((r) => r.run))];
    const perRun = (key: string) => runs.map((run) => { const rs = vlmRows.filter((r) => r.run === run); return rs.reduce((a, r) => a + r[key], 0) / rs.length; });
    const foundPerRun = (key: string) => runs.map((run) => vlmRows.filter((r) => r.run === run && r[key] >= FOUND_IOU).length);
    const stat = (xs: number[], d = 3) => ({ mean: +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(d), min: +Math.min(...xs).toFixed(d), max: +Math.max(...xs).toFixed(d) });
    const compare = (before: string, after: string) => {
      let improved = 0, equal = 0, worse = 0;
      for (const r of vlmRows) { const d = r[after] - r[before]; if (d > EQUAL_TOL) improved++; else if (d < -EQUAL_TOL) worse++; else equal++; }
      return { improved, equal, worse, of: vlmRows.length };
    };
    const findingsPerRun = runs.map((run) => { const seen = new Set<string>(); let n = 0; for (const r of vlmRows.filter((x) => x.run === run)) if (!seen.has(r.pair)) { seen.add(r.pair); n += r.modelFindings; } return n; });
    summary.vlm = {
      runs: runs.length, changes: vlmRows.length / runs.length, found_iou: FOUND_IOU,
      meanIou: { raw: stat(perRun("raw")), corrected: stat(perRun("fixed")), grounded: stat(perRun("grounded")), groundedCorrected: stat(perRun("groundedFixed")) },
      changesFound: { raw: stat(foundPerRun("raw"), 1), corrected: stat(foundPerRun("fixed"), 1), grounded: stat(foundPerRun("grounded"), 1), groundedCorrected: stat(foundPerRun("groundedFixed"), 1) },
      modelFindingsPerRun: stat(findingsPerRun, 1),
      afterCorrection: { modelBoxes: compare("raw", "fixed"), afterGrounding: compare("grounded", "groundedFixed") },
      identicalRuns: runs.length > 1 && runs.every((run) => JSON.stringify(vlmRows.filter((r) => r.run === run).map(({ run: _r, ...x }) => x)) === JSON.stringify(vlmRows.filter((r) => r.run === runs[0]).map(({ run: _r, ...x }) => x))),
    };
  }

  console.table(rows.map((r) => ({ ...r, meanIou: +r.meanIou.toFixed(2), alignScore: +(r.alignScore ?? 0).toFixed(2) })));
  if (vlmRows.length) console.table(vlmRows.filter((r) => r.run === 1));
  console.log(JSON.stringify(summary, null, 2));

  const out = path.join(ROOT, "docs/eval/change-detection.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ generated_at: new Date().toISOString(), summary, rows, vlm: vlmRows }, null, 2));
  console.log(`Wrote ${path.relative(ROOT, out)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
