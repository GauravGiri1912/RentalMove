/**
 * eval-privacy.ts — how well are personal items covered by the privacy scan?
 *
 *   npx tsx --env-file=.env scripts/eval-privacy.ts <dir>   (dir has letter.jpg + truth.json)
 *
 * The test photo is a real seed room with a fictional letter drawn in at a known box
 * (truth.json), plus a portrait crop of it (truth_portrait.json); both uploaded to
 * rentalmove-tests/ocr. Runs the app's own vision-model path (scanWithModel: detect →
 * long-side correction → snap to text pixels) and reports how much of the letter the hidden
 * areas cover and how much of the frame they hide. ≈1 Groq call per run.
 */

import fs from "fs";
import path from "path";
import { getVisionProvider, GroqVisionProvider } from "../src/lib/vision";
import { mergeBoxes, type Box } from "../src/lib/privacy";
import { scanWithModel } from "../src/lib/privacy-node";

const dir = process.argv[2];
const RUNS = 2;
const truth = JSON.parse(fs.readFileSync(path.join(dir, "truth.json"), "utf8"));
const cloud = process.env.CLOUDINARY_CLOUD_NAME;
const url = `https://res.cloudinary.com/${cloud}/image/upload/c_limit,w_1024/q_auto/rentalmove-tests/ocr/letter.jpg`;

/** Fraction of `target` covered by the union of `boxes` (grid sampling). */
function coverage(target: Box, boxes: Box[]): number {
  let hit = 0, n = 0;
  for (let i = 0; i < 60; i++) for (let j = 0; j < 60; j++) {
    const x = target[0] + ((i + 0.5) / 60) * (target[2] - target[0]), y = target[1] + ((j + 0.5) / 60) * (target[3] - target[1]);
    n++; if (boxes.some((b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3])) hit++;
  }
  return hit / n;
}
const frameShare = (boxes: Box[]) => coverage([0, 0, 1, 1], boxes);

async function main() {
  if (!(getVisionProvider() instanceof GroqVisionProvider)) throw new Error("Needs GROQ_API_KEY");
  for (const [name, truthFile] of [["letter", "truth.json"], ["letter_portrait", "truth_portrait.json"]] as const) {
    const t = JSON.parse(fs.readFileSync(path.join(dir, truthFile), "utf8"));
    const u = `https://res.cloudinary.com/${cloud}/image/upload/c_limit,w_1024,h_1024/q_auto/rentalmove-tests/ocr/${name}.jpg`;
    for (let r = 1; r <= RUNS; r++) {
      // Exactly the app's path: detect → correct for the long-side convention → snap to pixels.
      const items = await scanWithModel(u, fs.readFileSync(path.join(dir, `${name}.jpg`)), { width: t.w, height: t.h });
      const boxes = mergeBoxes(items.map((i) => i.bbox), 0.01);
      console.log(`${name} run ${r}: ${items.map((i) => `${i.label}${i.snapped ? "" : "*"} [${i.bbox.map((v) => v.toFixed(2)).join(",")}]`).join("; ") || "none"}`);
      console.log(`        letter covered ${(coverage(t.paper, boxes) * 100).toFixed(0)}% | frame hidden ${(frameShare(boxes) * 100).toFixed(0)}%   (* = kept model box, not snapped)`);
    }
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
