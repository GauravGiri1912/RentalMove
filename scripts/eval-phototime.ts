/**
 * eval-phototime.ts — photo-time check through real Cloudinary EXIF extraction.
 *
 *   npx tsx --env-file=.env scripts/eval-phototime.ts <dir-with-match.jpg,old.jpg,edited.jpg>
 *
 * Uploads each test JPEG to rentalmove-tests/exif (overwriting the same public ids on reruns),
 * reads it back with the same fetchFingerprint() the pipeline uses, and checks the verdict
 * against a visit dated 2026-06-01.
 */

import path from "path";
import { v2 as cloudinary } from "cloudinary";
import { ensureCloudinaryConfig } from "../src/lib/media";
import { fetchFingerprint } from "../src/lib/fingerprint";
import { photoTimeCheck } from "../src/lib/phototime";

const dir = process.argv[2];
const VISIT = "2026-06-01T09:00:00Z";
const CASES: [string, "ok" | "warn"][] = [["match", "ok"], ["old", "warn"], ["edited", "warn"]];

async function main() {
  ensureCloudinaryConfig();
  let pass = 0;
  for (const [name, expected] of CASES) {
    const up = await cloudinary.uploader.upload(path.join(dir, `${name}.jpg`), { folder: "rentalmove-tests/exif", public_id: name, overwrite: true, tags: "rentalmove-test" });
    const fp = await fetchFingerprint(up.public_id);
    const c = photoTimeCheck(fp.exif, VISIT, up.created_at);
    const ok = c.level === expected;
    if (ok) pass++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(7)} exif=${JSON.stringify(fp.exif)} → ${c.level}: ${c.label}`);
  }
  const seed = await fetchFingerprint("properties/prop-381/insp-2026-move-out/bathroom/shower-tile-03").catch(() => null);
  if (seed) console.log(`seed   → ${photoTimeCheck(seed.exif, VISIT, null).label}`);
  console.log(`\n${pass}/${CASES.length} as expected`);
  process.exit(pass === CASES.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
