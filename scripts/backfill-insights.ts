/**
 * backfill-insights.ts — adds measurements and room coverage to photos analysed before
 * those features existed. Idempotent: skips what already has events.
 *
 *   npx tsx --env-file=.env scripts/backfill-insights.ts [--no-vlm]
 *
 *  1. measure  — changed-pixel extent per finding now and at the previous visit (pixels only, free)
 *  2. coverage — which room areas each photo shows (one small vision call per photo)
 */

import { getDatabase } from "../src/lib/db";
import { deriveCoverage, deriveMeasures, listEvents, appendEvent } from "../src/lib/events";
import { measureObservations } from "../src/lib/measure-node";
import { getVisionProvider, GroqVisionProvider } from "../src/lib/vision";
import { getMediaProvider } from "../src/lib/media";

const noVlm = process.argv.includes("--no-vlm");

async function main() {
  const db = getDatabase();
  for (const p of await db.listProperties()) {
    const events = await listEvents(p.id);
    const measured = deriveMeasures(events);
    const covered = deriveCoverage(events);
    const inspections = await db.getInspections(p.id);
    const assets = (await db.getAssetsForInspections(inspections.map((i) => i.id))).filter((a) => (a.resource_type ?? "image") === "image" && a.analysis_status === "done");
    console.log(`${p.id}: ${assets.length} analysed photos`);

    for (const a of assets) {
      const obs = (await db.getObservations(a.id)).filter((o) => !measured[o.id]);
      if (obs.length) {
        const r = await measureObservations(p.id, a, obs.map((o) => ({ id: o.id, bbox: o.bbox })));
        console.log(`  measure ${a.id}: ${r.length ? r.map((x) => `${x.observation_id} ${(x.extent * 1e4).toFixed(1)}‱ (before ${((x.extent_prior ?? 0) * 1e4).toFixed(1)}‱)`).join(", ") : "no earlier photo — skipped"}`);
      }
      if (!noVlm && !covered[a.id]) {
        const vision = getVisionProvider();
        if (!(vision instanceof GroqVisionProvider)) { console.log("  coverage: no Groq key — skipped"); continue; }
        try {
          const areas = await vision.detectVisibleAreas(getMediaProvider().vlmCopy(a.cloudinary_public_id || a.secure_url));
          await appendEvent({ property_id: p.id, type: "coverage", resource_id: a.id, actor_id: null, actor_name: "RentalMove", actor_role: "system", payload: { areas } });
          console.log(`  coverage ${a.id}: ${areas.join(", ") || "(none)"}`);
        } catch (err: any) {
          console.warn(`  coverage ${a.id} failed: ${err?.message ?? err}`);
        }
      }
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
