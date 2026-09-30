/**
 * certainty.ts — the "Not sure" bucket.
 *
 * Instead of presenting every model output as a finding, a finding goes to "Not sure" when
 * the evidence for it is weak. Chosen from measurements (scripts/eval-unsure.ts, staged
 * ground truth, 15 later-visit findings):
 *   - pixels did not change at that spot compared with move-in → 4 of 4 such findings were
 *     false, although the model gave them 85–95% confidence
 *   - model confidence alone did not separate true from false, so it only acts as a floor
 *   - pixel-only changes the model did not describe were 5 of 5 real, so they are NOT
 *     "not sure": the location is certain, only the description is missing
 *   - the vision model's own "unsure" flag (new analyses) is honoured
 * A finding already matched to an earlier photo (pre-existing) is expected to show no new
 * change, so the pixel signal does not apply to it. Nothing is deleted: "Not sure" items
 * still need a human decision; they are just not presented as confident findings.
 */

export const UNSURE_BELOW_CONFIDENCE = 0.6;
/** Changed-pixel extent at the spot below this (fraction of frame) = "nothing changed here". */
export const NO_CHANGE_EXTENT = 2e-5;
const PIXEL_ONLY = /found by pixel comparison\. Not described by the vision model/i;

export interface Certainty { unsure: boolean; pixel_only: boolean; reasons: string[] }

export function certaintyOf(
  o: { confidence: number; description?: string; pre_existing?: boolean },
  measure: { extent: number } | undefined,
  modelUnsure: boolean | null | undefined,
): Certainty {
  const pixelOnly = PIXEL_ONLY.test(o.description ?? "");
  const reasons: string[] = [];
  if (!pixelOnly) {
    if (modelUnsure) reasons.push("The vision model said it was unsure");
    if (measure && !o.pre_existing && measure.extent < NO_CHANGE_EXTENT) reasons.push("No pixel change at this spot compared with move-in");
    if (o.confidence < UNSURE_BELOW_CONFIDENCE) reasons.push(`Low model confidence (${Math.round(o.confidence * 100)}%)`);
  }
  return { unsure: reasons.length > 0, pixel_only: pixelOnly, reasons };
}
