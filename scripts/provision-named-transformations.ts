/**
 * provision-named-transformations.ts — registers every fixed rendition RentalMove uses as a
 * Cloudinary NAMED transformation, allowed under Strict Transformations.
 *
 *   npx tsx scripts/provision-named-transformations.ts
 *
 * Why: with Strict Transformations enabled (Cloudinary Console → Settings → Security), the
 * CDN only renders (a) named transformations marked "allowed for strict" and (b) signed URLs.
 * Anyone could otherwise edit a delivery URL — e.g. add e_gen_remove — and spend your credits.
 * Fixed renditions use these names (t_rm_*); dynamic recipes are signed server-side.
 * After running this, set NEXT_PUBLIC_CLOUDINARY_NAMED=1 so the app emits t_rm_* URLs.
 */

import { v2 as cloudinary } from "cloudinary";
import { isCloudinaryConfigured } from "../src/lib/media";
import { NAMED_TRANSFORMATIONS } from "../src/lib/cloudinary-urls";

async function main() {
  if (!isCloudinaryConfigured()) throw new Error("Cloudinary credentials missing");
  const existing = new Set<string>();
  let cursor: string | undefined;
  do {
    const r: any = await cloudinary.api.transformations({ named: true, max_results: 100, next_cursor: cursor });
    for (const t of r.transformations ?? []) existing.add(String(t.name).replace(/^t_/, ""));
    cursor = r.next_cursor;
  } while (cursor);

  for (const [name, transformation] of Object.entries(NAMED_TRANSFORMATIONS)) {
    if (existing.has(name)) {
      await cloudinary.api.update_transformation(name, { unsafe_update: transformation, allowed_for_strict: true } as any);
      console.log(`updated  t_${name.padEnd(12)} ${transformation}`);
    } else {
      await cloudinary.api.create_transformation(name, transformation);
      await cloudinary.api.update_transformation(name, { allowed_for_strict: true } as any);
      console.log(`created  t_${name.padEnd(12)} ${transformation}`);
    }
  }
  console.log("\nNext: set NEXT_PUBLIC_CLOUDINARY_NAMED=1, then enable Strict Transformations in the Cloudinary Console.");
}

main().catch((e) => { console.error(e?.error?.message || e?.message || e); process.exit(1); });
