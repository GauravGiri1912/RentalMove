/**
 * backfill-fingerprints.ts — reads the capture time (EXIF), camera, faces and perceptual hash
 * of photos that were never fingerprinted, and records it as `fingerprint` events.
 *
 *   npx tsx --env-file=.env scripts/backfill-fingerprints.ts --dry   # list what it would do
 *   npx tsx --env-file=.env scripts/backfill-fingerprints.ts         # do it
 *
 * Cloudinary only (one Admin API call per photo); no model calls. Idempotent: photos that
 * already have a reading are skipped. Move-in kits are skipped (they are read on upload).
 */

import { getDatabase } from "../src/lib/db";
import { deriveFingerprints, listEvents } from "../src/lib/events";
import { fingerprintAsset } from "../src/lib/fingerprint";

const dry = process.argv.includes("--dry");

async function main() {
  const db = getDatabase();
  let todo = 0, done = 0, flagged = 0;
  for (const p of await db.listProperties()) {
    if (p.id.startsWith("kit-")) continue;
    const fps = deriveFingerprints(await listEvents(p.id, ["fingerprint"]));
    const insps = await db.getInspections(p.id);
    const assets = (await db.getAssetsForInspections(insps.map((i) => i.id))).filter((a) => (a.resource_type ?? "image") === "image" && a.cloudinary_public_id && !("exif" in (fps[a.id] ?? {})));
    console.log(`${p.id}: ${assets.length} photo(s) without a reading`);
    for (const a of assets) {
      todo++;
      const label = `${a.id.padEnd(26)} ${a.cloudinary_public_id.split("/").slice(-3).join("/")}`;
      if (dry) { console.log(`  would read  ${label}`); continue; }
      const fp = await fingerprintAsset(p.id, a.id, a.cloudinary_public_id, a.sha256);
      if (!fp) { console.log(`  FAILED      ${label}`); continue; }
      done++;
      if (fp.reused_of) flagged++;
      console.log(`  read        ${label} | capture time: ${fp.exif?.taken_at ?? "none in file"} | faces ${fp.faces} | ${fp.reused_of ? `FLAGGED as re-use of ${fp.reused_of} (hash ${fp.distance} bits, pixels ${fp.mad})` : "not a re-use"}`);
    }
  }
  console.log(dry ? `\n${todo} photo(s) would be read.` : `\n${done}/${todo} read, ${flagged} flagged as possible re-use.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
