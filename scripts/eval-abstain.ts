/**
 * eval-abstain.ts — does the vision model abstain on photos it cannot judge?
 *
 *   npx tsx --env-file=.env scripts/eval-abstain.ts
 *
 * Runs the real analysis prompt (≈3 Groq calls) on one staged bathroom photo as-is and on two
 * degraded Cloudinary renditions of it (very dark, heavily blurred). Expected: findings with
 * can_assess true on the original; no findings and can_assess false (or image_quality not
 * "ok") on the degraded ones.
 */

import { getVisionProvider } from "../src/lib/vision";

const cloud = process.env.CLOUDINARY_CLOUD_NAME;
const ID = "properties/prop-381/insp-2026-move-out/bathroom/shower-tile-03";
const url = (t: string) => `https://res.cloudinary.com/${cloud}/image/upload/${t}c_limit,w_1024/q_auto/${ID}.jpg`;
const CASES: [string, string, boolean][] = [
  ["original", url(""), true],
  ["very dark", url("e_brightness:-92/"), false],
  ["heavily blurred", url("e_blur:2000/"), false],
];

async function main() {
  const vision = getVisionProvider();
  let pass = 0;
  for (const [name, u, judgeable] of CASES) {
    const r = await vision.analyzeImage({ imageUrl: u, roomHint: "bathroom" });
    const abstained = r.can_assess === false || r.image_quality !== "ok";
    const ok = judgeable ? !abstained && r.observations.length > 0 : abstained && r.observations.length === 0;
    if (ok) pass++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(16)} quality=${r.image_quality} can_assess=${r.can_assess} note=${JSON.stringify(r.assess_note ?? null)} findings=${r.observations.length} unsure=${r.observations.filter((o) => o.unsure).length}`);
  }
  console.log(`\n${pass}/${CASES.length} as expected`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
