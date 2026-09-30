/**
 * grounding.ts — combines the vision model (WHAT) with the pixel engine (WHERE).
 *
 * Measured on seed/ground-truth.json (scripts/eval-change-detection.ts): the model's own
 * boxes overlap the real change with mean IoU ≈ 0.07; snapped onto pixel-change regions
 * ≈ 0.33. Pixel regions the model did not describe are surfaced as their own review item,
 * so a real change is never silently dropped.
 */

import { getDatabase } from "./db";
import { named } from "./cloudinary-urls";
import { changeMap, regionsInCurrentFrame, ground, describeRegion, type ChangeMap } from "./pixel-node";
import type { Asset, ObservationItem } from "./schemas";
import type { BBox } from "./pixel";

/** Rendition used for pixel analysis: bounded size, decodable everywhere. */
export const pixelUrl = (publicIdOrUrl: string) => named(publicIdOrUrl, "rm_pixel");

export async function propertyIdForInspection(inspectionId: string): Promise<string | null> {
  const db = getDatabase();
  for (const p of await db.listProperties()) {
    if ((await db.getInspections(p.id)).some((i) => i.id === inspectionId)) return p.id;
  }
  return null;
}

/**
 * The photo a new capture should be compared with: the same room's move-in photo if there
 * is one captured earlier, otherwise its most recent earlier photo.
 */
export async function priorAssetFor(asset: Asset): Promise<Asset | null> {
  return (await earlierAssetsFor(asset)).baseline;
}

/**
 * Earlier photos of the same room: `baseline` (move-in if any, else the most recent earlier)
 * and `previous` (the most recent earlier photo, which may be the baseline).
 */
export async function earlierAssetsFor(asset: Asset): Promise<{ baseline: Asset | null; previous: Asset | null }> {
  const none = { baseline: null, previous: null };
  const db = getDatabase();
  const propertyId = await propertyIdForInspection(asset.inspection_id);
  if (!propertyId) return none;
  const inspections = await db.getInspections(propertyId);
  const current = inspections.find((i) => i.id === asset.inspection_id);
  if (!current) return none;
  const earlier = inspections
    .filter((i) => new Date(i.captured_at).getTime() < new Date(current.captured_at).getTime())
    .sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  const candidates: { asset: Asset; type: string; at: string }[] = [];
  for (const insp of earlier) {
    for (const a of await db.getAssets(insp.id, asset.room_id)) {
      if (a.id !== asset.id && (a.resource_type ?? "image") === "image") candidates.push({ asset: a, type: insp.type, at: insp.captured_at });
    }
  }
  if (!candidates.length) return none;
  const previous = candidates[candidates.length - 1].asset;
  return { baseline: (candidates.find((c) => c.type === "move_in") ?? candidates[candidates.length - 1]).asset, previous };
}

export interface GroundingResult {
  observations: (ObservationItem & { grounded: boolean })[];
  /** Pixel-change regions no finding explained, as review items. */
  unexplained: ObservationItem[];
  map: ChangeMap;
  prior: Asset;
}

/** Snaps findings onto changed pixels relative to `prior`. Returns null if there is no prior. */
export async function groundFindings(asset: Asset, findings: ObservationItem[]): Promise<GroundingResult | null> {
  const prior = await priorAssetFor(asset);
  if (!prior) return null;
  const map = await changeMap(pixelUrl(prior.cloudinary_public_id || prior.secure_url), pixelUrl(asset.cloudinary_public_id || asset.secure_url));
  const regions = regionsInCurrentFrame(map);
  const used = new Set<number>();
  // Strongest findings claim regions first; a weaker finding that snaps onto a region
  // already claimed describes the same change twice and is dropped as a duplicate.
  const ordered = [...findings].sort((x, y) => y.confidence - x.confidence);
  const observations: (ObservationItem & { grounded: boolean })[] = [];
  for (const f of ordered) {
    const g = ground(f.bbox as BBox, regions);
    if (!g) { observations.push({ ...f, grounded: false }); continue; }
    const idx = regions.indexOf(g.box);
    if (used.has(idx)) continue;
    used.add(idx);
    observations.push({ ...f, bbox: g.box, grounded: true });
  }
  const unexplained: ObservationItem[] = regions
    .filter((_, i) => !used.has(i))
    .map((r) => ({
      category: "other" as const,
      sub_area: describeRegion(r),
      description: "Visible change in this area since the previous inspection, found by pixel comparison. Not described by the vision model — check manually.",
      confidence: 0.55,
      bbox: r,
    }));
  return { observations, unexplained, map, prior };
}
