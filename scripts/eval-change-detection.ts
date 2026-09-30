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
 *
 * Writes docs/eval/change-detection.json and prints a summary table.
 */

import fs from "fs";
import path from "path";
import sharp from "sharp";
import { changeMap, regionsInCurrentFrame } from "../src/lib/pixel-node";
import { ground, iou, type BBox } from "../src/lib/pixel";

const ROOT = process.cwd();
const GT = JSON.parse(fs.readFileSync(path.join(ROOT, "seed/ground-truth.json"), "utf8"));
const useVlm = process.argv.includes("--vlm");

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
        const a = await vision.analyzeImage({ imageUrl: dataUrl, roomHint: p.room });
        for (const g of p.changes) {
          const same = a.observations.filter((o: any) => o.category === g.category || true);
          const raw = Math.max(0, ...same.map((o: any) => iou(g.bbox, o.bbox)));
          const grounded = Math.max(0, ...same.map((o: any) => {
            const gr = ground(o.bbox, regions);
            return gr ? iou(g.bbox, gr.box) : iou(g.bbox, o.bbox);
          }));
          vlmRows.push({ pair: name, change: g.label, modelBoxIou: +raw.toFixed(3), groundedIou: +grounded.toFixed(3), modelFindings: a.observations.length });
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
    summary.vlm = {
      meanModelBoxIou: +(vlmRows.reduce((a, r) => a + r.modelBoxIou, 0) / vlmRows.length).toFixed(3),
      meanGroundedIou: +(vlmRows.reduce((a, r) => a + r.groundedIou, 0) / vlmRows.length).toFixed(3),
    };
  }

  console.table(rows.map((r) => ({ ...r, meanIou: +r.meanIou.toFixed(2), alignScore: +(r.alignScore ?? 0).toFixed(2) })));
  if (vlmRows.length) console.table(vlmRows);
  console.log(JSON.stringify(summary, null, 2));

  const out = path.join(ROOT, "docs/eval/change-detection.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ generated_at: new Date().toISOString(), summary, rows, vlm: vlmRows }, null, 2));
  console.log(`Wrote ${path.relative(ROOT, out)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
