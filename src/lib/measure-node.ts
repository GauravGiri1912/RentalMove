/**
 * measure-node.ts — pixel measurements for saved findings (server only).
 *
 * "Affected area" of a finding = pixels at that spot that differ from the room's move-in
 * (baseline) photo, using the same aligned, exposure-matched diff as change detection.
 * Measured for the current photo and for the previous visit at the SAME physical spot, so
 * the ratio is a growth trend (e.g. grout discolouration spreading). Pure pixel work — no
 * model calls — so it can be backfilled for free.
 *
 * Measured on seed/ground-truth.json by scripts/eval-measure.ts.
 */

import { appendEvent } from "./events";
import { align, diff, fromCurrentFrame, warp, type BBox, type Gray } from "./pixel";
import { loadGray } from "./pixel-node";
import { earlierAssetsFor, pixelUrl } from "./grounding";
import type { Asset, Observation } from "./schemas";

const round = (v: number) => Number(v.toFixed(6));
const srcOf = (a: Asset) => pixelUrl(a.cloudinary_public_id || a.secure_url);

interface Heat { heat: Float32Array; threshold: number; w: number; h: number; t: { dx: number; dy: number; scale: number }; margin: number }

/** Aligns `mov` onto `base` and returns the change heat map in the base frame (as changeMap does). */
export function changeHeat(base: Gray, mov: Gray): Heat {
  const a = align(base, mov);
  const moved = Math.abs(a.dx) > 0.01 || Math.abs(a.dy) > 0.01 || Math.abs(a.scale - 1) > 1e-6;
  const margin = moved ? Math.ceil(Math.max(Math.abs(a.dx), Math.abs(a.dy)) + base.w * Math.abs(1 - a.scale)) + 3 : 0;
  const d = diff(base, moved ? warp(mov, a) : mov, { margin, smooth: moved });
  return { heat: d.heat, threshold: d.threshold, w: base.w, h: base.h, t: { dx: a.dx / base.w, dy: a.dy / base.h, scale: a.scale }, margin };
}

/** Fraction of the frame inside `box` (base frame) whose change exceeds the threshold. */
export function changedIn(h: Heat, box: BBox): number {
  const m = h.margin;
  const x1 = Math.max(m, Math.floor(box[0] * h.w)), y1 = Math.max(m, Math.floor(box[1] * h.h));
  const x2 = Math.min(h.w - m, Math.ceil(box[2] * h.w)), y2 = Math.min(h.h - m, Math.ceil(box[3] * h.h));
  let n = 0;
  for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) if (h.heat[y * h.w + x] > h.threshold) n++;
  return n / (h.w * h.h);
}

/**
 * Pure core. Boxes are in the CURRENT photo's frame. `previous` is the visit before the
 * current one when that is not the baseline itself (otherwise the prior extent is 0:
 * the baseline does not differ from itself).
 */
export function measureBoxes(baseline: Gray, current: Gray, previous: Gray | null, boxes: BBox[]) {
  const hc = changeHeat(baseline, current);
  const hp = previous ? changeHeat(baseline, previous) : null;
  return boxes.map((box) => {
    const inBase = fromCurrentFrame(box, hc.t);
    return {
      extent: round(changedIn(hc, inBase)),
      extent_prior: round(hp ? changedIn(hp, inBase) : 0),
      long_side: round(Math.max(box[2] - box[0], box[3] - box[1])),
      bbox_area: round((box[2] - box[0]) * (box[3] - box[1])),
    };
  });
}

export interface MeasureResult { observation_id: string; extent: number; extent_prior: number | null; long_side: number; bbox_area: number }

/** Measures saved findings of `asset` and records a `measure` event for each. */
export async function measureObservations(propertyId: string, asset: Asset, observations: Pick<Observation, "id" | "bbox">[]): Promise<MeasureResult[]> {
  if (!observations.length) return [];
  const { baseline, previous } = await earlierAssetsFor(asset);
  if (!baseline) return []; // the move-in photo itself: nothing to measure against
  const current = await loadGray(srcOf(asset));
  const base = await loadGray(srcOf(baseline), current.w, current.h);
  const prevAsset = previous && previous.id !== baseline.id ? previous : null;
  const prev = prevAsset ? await loadGray(srcOf(prevAsset), current.w, current.h) : null;
  const measured = measureBoxes(base, current, prev, observations.map((o) => o.bbox as BBox));
  const out: MeasureResult[] = [];
  for (let i = 0; i < observations.length; i++) {
    const r = { observation_id: observations[i].id, ...measured[i] };
    out.push(r);
    await appendEvent({
      property_id: propertyId, type: "measure", resource_id: r.observation_id, actor_id: null, actor_name: "RentalMove", actor_role: "system",
      payload: { extent: r.extent, extent_prior: r.extent_prior, long_side: r.long_side, bbox_area: r.bbox_area, baseline_asset_id: baseline.id, prior_asset_id: (prevAsset ?? baseline).id },
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Repair verification
// ---------------------------------------------------------------------------

export interface RepairCheck {
  /** Correlation of the finding photo and the repair photo outside the finding, after alignment. */
  view_match: number;
  same_view: boolean;
  extent_before: number;
  extent_after: number;
  /** Change between the finding photo and the repair photo at the finding's spot. */
  spot_changed: number;
  verdict: "reduced" | "unchanged" | "unclear";
}

/** Same view when the aligned photos correlate at least this well outside the finding. */
const SAME_VIEW = 0.5;
/** Below this there was nothing measurable to repair (≈10 px at 800×600). */
const MIN_EXTENT = 2e-5;

/**
 * Checks a repair photo: is it the same view as the finding photo, and is the change from
 * the baseline at the finding's spot gone? `box` is in the finding photo's frame.
 */
export async function verifyRepair(baselinePhoto: string | Buffer, findingPhoto: string | Buffer, repairPhoto: string | Buffer, box: BBox): Promise<RepairCheck> {
  const finding = await loadGray(findingPhoto);
  const base = await loadGray(baselinePhoto, finding.w, finding.h);
  const repair = await loadGray(repairPhoto, finding.w, finding.h);
  const r = align(finding, repair);
  const view_match = correlationOutside(finding, warp(repair, r), box);
  const hf = changeHeat(base, finding);
  const hr = changeHeat(base, repair);
  const inBase = fromCurrentFrame(box, hf.t);
  const extent_before = changedIn(hf, inBase);
  const extent_after = changedIn(hr, inBase);
  // Thin features (hairline cracks, chips) can blur below threshold in a re-shot photo, so
  // "no longer differs from baseline" alone is not enough: the spot must also have visibly
  // changed between the finding photo and the repair photo.
  const spot_changed = changedIn(changeHeat(finding, repair), box);
  const same_view = view_match >= SAME_VIEW;
  const verdict: RepairCheck["verdict"] =
    !same_view || extent_before < MIN_EXTENT ? "unclear" :
    extent_after <= extent_before * 0.5 && spot_changed >= extent_before * 0.3 ? "reduced" : "unchanged";
  return { view_match: round(view_match), same_view, extent_before: round(extent_before), extent_after: round(extent_after), spot_changed: round(spot_changed), verdict };
}

function correlationOutside(a: Gray, b: Gray, box: BBox): number {
  const x1 = box[0] * a.w, y1 = box[1] * a.h, x2 = box[2] * a.w, y2 = box[3] * a.h;
  const m = Math.round(a.w * 0.06); // ignore borders the warp leaves empty
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let y = m; y < a.h - m; y += 2)
    for (let x = m; x < a.w - m; x += 2) {
      if (x >= x1 && x < x2 && y >= y1 && y < y2) continue;
      const u = a.data[y * a.w + x], v = b.data[y * a.w + x];
      n++; sa += u; sb += v; saa += u * u; sbb += v * v; sab += u * v;
    }
  if (n < 50) return 0;
  const cov = sab / n - (sa / n) * (sb / n);
  const va = saa / n - (sa / n) ** 2, vb = sbb / n - (sb / n) ** 2;
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0;
}
