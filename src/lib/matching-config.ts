/**
 * matching-config.ts — Centralized, configurable thresholds for cross-visit finding matching.
 *
 * Evidence Grounding Rationale:
 * 1. SAME_SPOT_IOU (Intersection-over-Union):
 *    Measures spatial area overlap of bounding boxes.
 *    Default 0.20 allows for minor perspective, tilt, and cropping shifts when taking photos
 *    of the same room across different inspection visits.
 *
 * 2. SAME_SPOT_DIST (Normalized Euclidean distance between box centroids):
 *    Default 0.08 (~8% of image dimension) matches small pinpoint defects (e.g. nail holes,
 *    small grout stains, superficial chips) where IoU overlap can be near zero because tiny
 *    boxes rarely overlap when the camera angle varies even slightly.
 */

export interface MatchingConfig {
  /** Minimum bounding-box IoU (0..1) required to consider two findings at the same spot. */
  sameSpotIou: number;
  /** Maximum normalized distance (0..1) between box centers to consider findings at the same spot. */
  sameSpotDist: number;
}

export const DEFAULT_MATCHING_CONFIG: MatchingConfig = {
  sameSpotIou: 0.2,
  sameSpotDist: 0.08,
};

let currentConfig: MatchingConfig = { ...DEFAULT_MATCHING_CONFIG };

export function getMatchingConfig(): MatchingConfig {
  return currentConfig;
}

export function setMatchingConfig(config: Partial<MatchingConfig>): void {
  currentConfig = { ...currentConfig, ...config };
}

export function resetMatchingConfig(): void {
  currentConfig = { ...DEFAULT_MATCHING_CONFIG };
}

/** Normalized Euclidean distance between centroids of [x1, y1, x2, y2]. */
export function centreDist(
  a: [number, number, number, number],
  b: [number, number, number, number]
): number {
  const ax = (a[0] + a[2]) / 2;
  const ay = (a[1] + a[3]) / 2;
  const bx = (b[0] + b[2]) / 2;
  const by = (b[1] + b[3]) / 2;
  return Math.hypot(ax - bx, ay - by);
}

/** Intersection over Union of two [x1, y1, x2, y2] bounding boxes. */
export function iou(
  a: [number, number, number, number],
  b: [number, number, number, number]
): number {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]);
  const y2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (!inter) return 0;
  const areaA = (a[2] - a[0]) * (a[3] - a[1]);
  const areaB = (b[2] - b[0]) * (b[3] - b[1]);
  return inter / (areaA + areaB - inter);
}

/** Evaluates whether two findings represent the same physical spot. */
export function isSameSpot(
  bboxA: [number, number, number, number],
  bboxB: [number, number, number, number],
  config = getMatchingConfig()
): boolean {
  if (iou(bboxA, bboxB) >= config.sameSpotIou) return true;
  if (centreDist(bboxA, bboxB) <= config.sameSpotDist) return true;
  return false;
}
