/**
 * compare.ts — one before/after comparison, end to end:
 * vision model (what changed, new vs worsened) → pixel engine (where, aligned) → store → log.
 * Used by POST /api/comparisons and by scripts.
 */

import { getDatabase } from "./db";
import { getVisionProvider } from "./vision";
import { changeMap, regionsInCurrentFrame, ground, describeRegion } from "./pixel-node";
import { regionBox, type BBox } from "./pixel";
import { pixelUrl } from "./grounding";
import { appendEvent, type ActorRole } from "./events";
import type { Asset, Comparison, ComparisonResult } from "./schemas";

/** Pixel regions the model did not describe that are surfaced as their own items. */
const MAX_PIXEL_ONLY = 3;

export async function runComparison(opts: {
  propertyId: string;
  prior: Asset;
  current: Asset;
  roomId?: string;
  roomName?: string;
  tiled?: boolean;
  actor?: { id: string | null; name: string; role: ActorRole };
}): Promise<{ comparison: Comparison; result: ComparisonResult }> {
  const { propertyId, prior, current } = opts;
  const vision = getVisionProvider();
  const priorRef = prior.cloudinary_public_id || prior.secure_url;
  const currentRef = current.cloudinary_public_id || current.secure_url;

  const result = await vision.compareImages({
    priorUrl: priorRef,
    currentUrl: currentRef,
    room: opts.roomName || prior.room_guess || "room",
    tiled: Boolean(opts.tiled),
  });

  // Snap the model's approximate boxes onto regions whose pixels actually changed, and add
  // real changes the model did not describe as their own items.
  let changes = result.changes;
  const caveats = [...(result.caveats || [])];
  try {
    const map = await changeMap(pixelUrl(priorRef), pixelUrl(currentRef));
    const regions = regionsInCurrentFrame(map);
    const used = new Set<number>();
    const groundedChanges: typeof changes = [];
    for (const c of [...changes].sort((x, y) => y.confidence - x.confidence)) {
      const g = ground((c.bbox ?? regionBox(c.region)) as BBox, regions);
      if (!g) { groundedChanges.push({ ...c, grounded: false }); continue; }
      const idx = regions.indexOf(g.box);
      if (used.has(idx)) continue; // same change described twice
      used.add(idx);
      groundedChanges.push({ ...c, bbox: g.box, region: describeRegion(g.box), grounded: true });
    }
    changes = groundedChanges;
    const extra = regions
      .map((r, i) => ({ r, i }))
      .filter(({ i }) => !used.has(i))
      .sort((x, y) => (y.r[2] - y.r[0]) * (y.r[3] - y.r[1]) - (x.r[2] - x.r[0]) * (x.r[3] - x.r[1]))
      .slice(0, MAX_PIXEL_ONLY)
      .map(({ r }) => ({
        description: "Pixel change not described by the vision model — check this area manually.",
        confidence: 0.5,
        region: describeRegion(r),
        kind: "pixel" as const,
        bbox: r,
        grounded: true,
      }));
    changes = [...changes, ...extra];
    caveats.push(
      `Pixel check after alignment (shift ${(map.alignment.dx * 100).toFixed(1)}% / ${(map.alignment.dy * 100).toFixed(1)}%, zoom ×${map.alignment.scale.toFixed(3)}): ${(map.changedPct * 100).toFixed(2)}% of the frame changed.`
    );
  } catch (err) {
    console.warn("[Compare] Pixel grounding skipped:", err);
  }
  result.changes = changes;
  result.caveats = caveats;

  const described = changes.filter((c) => c.kind !== "pixel");
  const confidence = described.length ? Number((described.reduce((s, c) => s + c.confidence, 0) / described.length).toFixed(2)) : undefined;

  const comparison = await getDatabase().createComparison({
    property_id: propertyId,
    room_id: opts.roomId || prior.room_id,
    prior_asset_id: prior.id,
    current_asset_id: current.id,
    summary: result.summary,
    changes: result.changes,
    caveats: result.caveats,
    confidence,
    review_required: true,
    model_version: vision.name,
  });

  await appendEvent({
    property_id: propertyId,
    type: "pipeline",
    resource_id: current.id,
    actor_id: opts.actor?.id ?? null,
    actor_name: opts.actor?.name ?? "RentalMove",
    actor_role: opts.actor?.role ?? "system",
    payload: {
      stage: "compare",
      label: `${opts.roomName || "Room"} compared`,
      detail: `${described.length} change(s) described · ${changes.filter((c) => c.grounded).length} grounded on pixels`,
    },
  }).catch(() => {});

  return { comparison, result };
}
