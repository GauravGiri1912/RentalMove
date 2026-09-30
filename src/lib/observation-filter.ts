/**
 * observation-filter.ts — post-filters for vision-model output.
 *
 * Vision models asked to "describe the room" tend to invent findings: whole-photo boxes,
 * "no visible damage" written up as a finding, near-duplicates, low-confidence guesses.
 * Everything the model returns passes through here before it can be stored or shown.
 * Pure functions, no I/O — fully unit-tested in tests/observation-filter.test.ts.
 */

import type { ObservationItem } from "./schemas";

export const MIN_CONFIDENCE = 0.5;
export const MAX_BOX_AREA = 0.7; // a box covering most of the photo localises nothing
export const MIN_BOX_AREA = 0.0004; // ~2% x 2% of the frame; smaller is noise
export const MAX_OBSERVATIONS_PER_PHOTO = 5;
const DUPLICATE_IOU = 0.5;

/** Statements of absence / condition praise are not findings. */
const NEGATIVE_FINDING =
  /\b(no (visible |apparent |obvious |significant )?(damage|defects?|issues?|scratch(es)?|stains?|cracks?|dents?|marks?|wear|irregularit(y|ies)|problems?|signs?)|without (any )?(visible )?(damage|defects?|marks?)|in (good|excellent|clean|fine) condition|pristine|undamaged|unblemished|appears? (clean|fine|normal|intact)|nothing (unusual|notable))\b/i;

/** Placeholder text from older versions of the pipeline; never a real finding. */
const PLACEHOLDER = /ai analysis unavailable|manual review required/i;

export type DropReason =
  | "image_quality"
  | "low_confidence"
  | "box_too_large"
  | "box_too_small"
  | "invalid_box"
  | "negative_statement"
  | "placeholder"
  | "duplicate"
  | "over_limit";

export interface FilterOutcome {
  kept: ObservationItem[];
  dropped: Array<{ observation: ObservationItem; reason: DropReason }>;
}

function area(b: [number, number, number, number]): number {
  return Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
}

export function iou(a: [number, number, number, number], b: [number, number, number, number]): number {
  const ix1 = Math.max(a[0], b[0]);
  const iy1 = Math.max(a[1], b[1]);
  const ix2 = Math.min(a[2], b[2]);
  const iy2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  const union = area(a) + area(b) - inter;
  return union <= 0 ? 0 : inter / union;
}

export function filterObservations(
  observations: ObservationItem[],
  imageQuality: string = "ok"
): FilterOutcome {
  const dropped: FilterOutcome["dropped"] = [];

  // A photo the model itself calls blurry / dark / not a room can't support findings.
  if (imageQuality !== "ok") {
    return {
      kept: [],
      dropped: observations.map((observation) => ({ observation, reason: "image_quality" as const })),
    };
  }

  const candidates: ObservationItem[] = [];
  for (const obs of observations) {
    const [x1, y1, x2, y2] = obs.bbox;
    if (PLACEHOLDER.test(obs.description)) {
      dropped.push({ observation: obs, reason: "placeholder" });
    } else if (NEGATIVE_FINDING.test(obs.description)) {
      dropped.push({ observation: obs, reason: "negative_statement" });
    } else if (obs.confidence < MIN_CONFIDENCE) {
      dropped.push({ observation: obs, reason: "low_confidence" });
    } else if (x2 <= x1 || y2 <= y1) {
      dropped.push({ observation: obs, reason: "invalid_box" });
    } else if (area(obs.bbox) > MAX_BOX_AREA) {
      dropped.push({ observation: obs, reason: "box_too_large" });
    } else if (area(obs.bbox) < MIN_BOX_AREA) {
      dropped.push({ observation: obs, reason: "box_too_small" });
    } else {
      candidates.push(obs);
    }
  }

  // Highest confidence first so duplicates resolve in favour of the strongest.
  candidates.sort((a, b) => b.confidence - a.confidence);

  const kept: ObservationItem[] = [];
  for (const obs of candidates) {
    if (kept.some((k) => k.category === obs.category && iou(k.bbox, obs.bbox) >= DUPLICATE_IOU)) {
      dropped.push({ observation: obs, reason: "duplicate" });
    } else if (kept.length >= MAX_OBSERVATIONS_PER_PHOTO) {
      dropped.push({ observation: obs, reason: "over_limit" });
    } else {
      kept.push(obs);
    }
  }

  return { kept, dropped };
}

// ---------------------------------------------------------------------------
// Comparison changes
// ---------------------------------------------------------------------------

/** "No change" / "consistent with baseline" written up as a change. */
const NO_CHANGE =
  /\b(no (visible |apparent |noticeable |significant )?(change|changes|difference|differences|variation|variations)|unchanged|identical|the same|same as|consistent with (the )?(baseline|prior|previous)|remains?|no new)\b/i;

export interface ChangeLike {
  description: string;
  confidence: number;
}

export function filterComparisonChanges<T extends ChangeLike>(changes: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of [...changes].sort((a, b) => b.confidence - a.confidence)) {
    if (c.confidence < MIN_CONFIDENCE) continue;
    if (!c.description || PLACEHOLDER.test(c.description) || NO_CHANGE.test(c.description)) continue;
    const key = c.description.toLowerCase().replace(/[^a-z0-9 ]/g, "").slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out.slice(0, MAX_OBSERVATIONS_PER_PHOTO * 2);
}
