/**
 * sync-tags.ts — makes every Cloudinary asset's managed tags (issue:*, review:*, plain issue
 * category) match the database. Run after cleaning or editing data outside the app.
 *
 *   npx tsx scripts/sync-tags.ts
 *
 * Needs Cloudinary credentials only (no vision-model calls).
 */
import { getDatabase } from "../src/lib/db";
import { getMediaProvider } from "../src/lib/media";
import { computeManagedTags } from "../src/lib/tags";

async function main() {
  const db = getDatabase();
  const media = getMediaProvider();
  if (media.isMock()) throw new Error("Cloudinary is not configured; nothing to sync.");

  let synced = 0;
  const properties = await db.listProperties();
  for (const property of properties) {
    for (const inspection of await db.getInspections(property.id)) {
      for (const asset of await db.getAssets(inspection.id)) {
        if (!asset.cloudinary_public_id) continue;
        const observations = await db.getObservations(asset.id);
        const desired = computeManagedTags(observations);
        try {
          const { added, removed } = await media.syncManagedTags(asset.cloudinary_public_id, desired);
          console.log(
            `${asset.cloudinary_public_id}\n   tags: ${desired.join(", ")}` +
              (added.length || removed.length ? `\n   +[${added.join(", ")}] -[${removed.join(", ")}]` : "  (already in sync)")
          );
          synced++;
        } catch (err: any) {
          console.warn(`   ! ${asset.cloudinary_public_id}: ${err?.error?.message || err?.message || err}`);
        }
      }
    }
  }
  console.log(`\nSynced ${synced} asset(s).`);
}

main().catch((err) => {
  console.error("sync-tags failed:", err?.message || err);
  process.exit(1);
});
