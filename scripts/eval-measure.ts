/**
 * eval-measure.ts — checks the size/trend and repair-verification measurements.
 *
 * Uses seed/ground-truth.json (staged changes with exact boxes). No API calls.
 *   1. Trend: for every staged change, affected area now vs the same spot in the prior photo.
 *      A staged change was not there before, so it should read as "new" or "grew".
 *      Unchanged control boxes (same size, shifted to empty wall/floor) should read "stable" or nothing.
 *   2. Repair check: a simulated handheld re-shot of the clean 2024 photo stands in for a
 *      repair photo of each 2026 finding ("reduced" expected); a re-shot of the 2026 photo
 *      itself ("unchanged"); a different room ("unclear").
 *
 *   npx tsx scripts/eval-measure.ts
 */

import fs from "fs";
import path from "path";
import sharp from "sharp";
import { loadGray } from "../src/lib/pixel-node";
import { measureBoxes, verifyRepair } from "../src/lib/measure-node";
import { trend } from "../src/lib/measure";
import type { BBox } from "../src/lib/pixel";

const ROOT = process.cwd();
const IMG = (p: string) => fs.readFileSync(path.join(ROOT, "seed/images", p));
const GT = JSON.parse(fs.readFileSync(path.join(ROOT, "seed/ground-truth.json"), "utf8"));

/** Zoom 4% and shift: a re-capture from roughly the same spot (as in eval-change-detection). */
async function reshot(buf: Buffer): Promise<Buffer> {
  const m = await sharp(buf).metadata();
  const W = m.width!, H = m.height!;
  const zw = Math.round(W * 1.04), zh = Math.round(H * 1.04);
  return sharp(buf).resize(zw, zh).extract({ left: Math.round(W * 0.03), top: Math.round(H * 0.025), width: W, height: H }).modulate({ brightness: 1.03 }).jpeg({ quality: 88 }).toBuffer();
}

async function main() {
  console.log("TREND — staged changes (expect new/grew)");
  for (const p of GT.pairs) {
    if (!p.changes.length) continue;
    const cur = await loadGray(IMG(p.current));
    const pri = await loadGray(IMG(p.prior), cur.w, cur.h);
    const m = measureBoxes(pri, cur, null, p.changes.map((c: any) => c.bbox as BBox));
    p.changes.forEach((c: any, i: number) => {
      const t = trend(m[i].extent_prior, m[i].extent);
      console.log(`  ${p.current.padEnd(36)} ${c.label.padEnd(30)} now ${(m[i].extent * 1e4).toFixed(1).padStart(6)}‱  before ${((m[i].extent_prior ?? 0) * 1e4).toFixed(1).padStart(6)}‱  → ${t ? t.kind + (t.ratio ? ` ×${t.ratio.toFixed(2)}` : "") : "—"}`);
    });
  }

  console.log("\nTREND — bathroom stain across visits (2025 → 2026)");
  {
    const stain26 = GT.pairs.find((p: any) => p.current.includes("2026/bathroom")).changes.find((c: any) => c.category === "stain");
    const cur = await loadGray(IMG("2026/bathroom/shower-tile-03.jpg"));
    const prev = await loadGray(IMG("2025/bathroom/shower-tile-02.jpg"), cur.w, cur.h);
    const base = await loadGray(IMG("2024/bathroom/shower-tile-01.jpg"), cur.w, cur.h);
    const [m] = measureBoxes(base, cur, prev, [stain26.bbox]);
    const t = trend(m.extent_prior, m.extent);
    console.log(`  now ${(m.extent * 1e4).toFixed(1)}‱  2025 ${((m.extent_prior ?? 0) * 1e4).toFixed(1)}‱  → ${t?.kind} ${t?.ratio ? `×${t.ratio.toFixed(2)}` : ""}`);
  }

  console.log("\nTREND — unchanged control spots (no staged change; expect stable or none)");
  {
    const p = GT.pairs.find((x: any) => x.current.includes("2025/kitchen"));
    const cur = await loadGray(IMG(p.current));
    const base = await loadGray(IMG(p.prior), cur.w, cur.h);
    const boxes: BBox[] = [[0.1, 0.1, 0.2, 0.2], [0.4, 0.4, 0.5, 0.5], [0.7, 0.6, 0.85, 0.75], [0.2, 0.7, 0.3, 0.85]];
    // 2025 kitchen had no staged change: measure it as "previous" and a re-shot of it as "current".
    const again = await loadGray(await reshot(IMG(p.current)), cur.w, cur.h);
    const m = measureBoxes(base, again, cur, boxes);
    m.forEach((r, i) => {
      const t = trend(r.extent_prior, r.extent);
      console.log(`  box ${JSON.stringify(boxes[i])} now ${(r.extent * 1e4).toFixed(1)}‱ before ${((r.extent_prior ?? 0) * 1e4).toFixed(1)}‱ → ${t ? t.kind + (t.ratio ? ` ×${t.ratio.toFixed(2)}` : "") : "—"}`);
    });
  }

  console.log("\nREPAIR CHECK");
  for (const p of GT.pairs.filter((x: any) => x.current.startsWith("2026"))) {
    for (const c of p.changes) {
      const ok = await verifyRepair(IMG(p.prior), IMG(p.current), await reshot(IMG(p.prior)), c.bbox);
      const same = await verifyRepair(IMG(p.prior), IMG(p.current), await reshot(IMG(p.current)), c.bbox);
      const other = GT.pairs.find((x: any) => x.room !== p.room && x.current.startsWith("2026"));
      const wrong = await verifyRepair(IMG(p.prior), IMG(p.current), IMG(other.current), c.bbox);
      const r = (x: any) => `${x.verdict} ${(x.extent_after / Math.max(1e-9, x.extent_before)).toFixed(2)}`;
      console.log(`  ${p.room.padEnd(12)} ${c.label.padEnd(30)} before ${(ok.extent_before * 1e4).toFixed(1)}‱  repaired: ${r(ok)} (view ${ok.view_match.toFixed(2)})  not-repaired: ${r(same)}  other-room: ${wrong.verdict} (view ${wrong.view_match.toFixed(2)})`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
