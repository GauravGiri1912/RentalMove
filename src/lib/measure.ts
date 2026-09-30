/**
 * measure.ts — real-world size from a scale reference drawn on the photo.
 *
 * A person draws a line across something of known size (a door, a switch plate, a tile) and
 * says how long it is. Anything on the SAME surface can then be sized from pixels. Results
 * are approximate by nature (perspective, distance) and always shown with "≈".
 */

import type { BBox } from "./pixel";

export interface ScaleRef { line: [number, number, number, number]; cm: number; reference: string }

/** Common references with their typical sizes (cm). */
export const REFERENCES: { id: string; label: string; cm: number | null }[] = [
  { id: "door", label: "Interior door width", cm: 80 },
  { id: "switch", label: "Light switch / socket plate", cm: 8.6 },
  { id: "tile30", label: "30 cm tile", cm: 30 },
  { id: "tile60", label: "60 cm tile", cm: 60 },
  { id: "a4", label: "A4 sheet (long side)", cm: 29.7 },
  { id: "custom", label: "Something I measured", cm: null },
];

export function cmPerPixel(ref: ScaleRef, imgW: number, imgH: number): number | null {
  const [x1, y1, x2, y2] = ref.line;
  const px = Math.hypot((x2 - x1) * imgW, (y2 - y1) * imgH);
  return px > 2 && ref.cm > 0 ? ref.cm / px : null;
}

export interface Size { long_cm: number; area_cm2: number | null }

/** Longest side of the finding box and, if measured, the affected area — in cm / cm². */
export function findingSize(bbox: BBox, imgW: number, imgH: number, ref: ScaleRef | undefined, extent?: number | null): Size | null {
  if (!ref) return null;
  const k = cmPerPixel(ref, imgW, imgH);
  if (!k) return null;
  const longPx = Math.max((bbox[2] - bbox[0]) * imgW, (bbox[3] - bbox[1]) * imgH);
  const area = extent != null && extent > 0 ? extent * imgW * imgH * k * k : null;
  return { long_cm: longPx * k, area_cm2: area };
}

export function fmtLength(cm: number): string {
  if (cm >= 100) return `≈ ${(cm / 100).toFixed(1)} m`;
  if (cm >= 10) return `≈ ${Math.round(cm)} cm`;
  return `≈ ${cm.toFixed(1)} cm`;
}

export function fmtArea(cm2: number): string {
  if (cm2 >= 10000) return `≈ ${(cm2 / 10000).toFixed(2)} m²`;
  return `≈ ${cm2 >= 10 ? Math.round(cm2) : cm2.toFixed(1)} cm²`;
}

export type TrendKind = "new" | "grew" | "shrank" | "stable";

/**
 * Change in affected area at the same spot between two visits (fractions of the frame).
 * Null when there is nothing measurable either time.
 */
export function trend(before: number | null | undefined, now: number | null | undefined): { kind: TrendKind; ratio: number | null } | null {
  if (now == null || before == null) return null;
  const MIN = 2e-5; // ~10 px at 800×600 — below this there is nothing to compare
  if (now < MIN && before < MIN) return null;
  if (before < MIN) return { kind: "new", ratio: null };
  const ratio = now / before;
  if (ratio >= 1.25) return { kind: "grew", ratio };
  if (ratio <= 0.8) return { kind: "shrank", ratio };
  return { kind: "stable", ratio };
}
