// Per-finding insights computed from the current view: real-world size, growth trend,
// everyday-wear context, repair status, and per-room photo coverage. Pure reads — pages
// call these while rendering.

import type { Observation } from "./view-types";
import { getAsset, getAssessment, getAssets, getCalibration, getCoverage, getInspection, getMeasure, getRoom, getWorkOrder, reportPair } from "./view";
import { certaintyOf, type Certainty } from "./certainty";
import { findingSize, trend, type Size, type TrendKind } from "./measure";
import { monthsBetween, wearContext, type WearContext } from "./wear";
import { coverageFor, type CoverageResult } from "./coverage";
import { photoTimeCheck, type TimeCheck } from "./phototime";
import type { Asset } from "./view-types";

/** Capture time in the file vs the visit and upload. Null until the photo's EXIF was read. */
export function photoTimeOf(a: Asset): TimeCheck | null {
  if (a.exif === undefined) return null;
  return photoTimeCheck(a.exif, getInspection(a.inspection_id)?.captured_at, a.uploaded_at);
}

/** "Not sure" bucket membership and the reasons for it. */
export function certaintyFor(o: Observation): Certainty {
  return certaintyOf(o, getMeasure(o.id), getAssessment(o.asset_id)?.unsure.includes(o.id));
}

/** Null when the photo was judged normally; otherwise why the model could not judge it. */
export function photoAbstain(a: Asset): string | null {
  const x = getAssessment(a.id);
  if (x && !x.can_assess) return x.note ?? "The vision model could not judge this photo";
  if (a.image_quality && a.image_quality !== "ok") return { blurry: "The photo is blurry", too_dark: "The photo is too dark", not_a_room: "The photo does not show a room" }[a.image_quality] ?? "The photo could not be judged";
  return null;
}

/** Size in cm, when the finding's photo has a scale reference. */
export function sizeOf(o: Observation): Size | null {
  const a = getAsset(o.asset_id);
  const cal = a && getCalibration(a.id);
  if (!a || !cal) return null;
  return findingSize(o.bbox, a.width, a.height, { line: cal.line, cm: cal.cm, reference: cal.reference }, getMeasure(o.id)?.extent);
}

export interface Trend { kind: TrendKind; ratio: number | null; since: "move_in" | "previous" }

/**
 * Affected area now vs the previous visit at the same spot. "new" when nothing differed there
 * before; null when the finding has not been measured (e.g. it is on the move-in photo).
 */
export function trendOf(o: Observation): Trend | null {
  const m = getMeasure(o.id);
  if (!m) return null;
  const t = trend(m.extent_prior, m.extent);
  if (!t) return null;
  const base = reportPair().baseline;
  const prior = m.prior_asset_id ? getAssets().find((a) => a.id === m.prior_asset_id) : undefined;
  return { ...t, since: prior && base && prior.inspection_id !== base.id ? "previous" : "move_in" };
}

export function trendLabel(t: Trend): string {
  const when = t.since === "previous" ? "since the last visit" : "since move-in";
  if (t.kind === "new") return `New ${when}`;
  if (t.kind === "grew") return `Grew ×${t.ratio!.toFixed(1)} ${when}`;
  if (t.kind === "shrank") return `Smaller ${when}`;
  return `About the same ${when}`;
}

/** Everyday-wear context for the time between move-in and this finding's photo. */
export function wearOf(o: Observation): WearContext {
  const a = getAsset(o.asset_id);
  const base = reportPair().baseline;
  const insp = a ? getInspection(a.inspection_id) : undefined;
  const months = base && insp && insp.id !== base.id ? monthsBetween(base.captured_at, insp.captured_at) : null;
  const t = trendOf(o);
  return wearContext({
    category: o.category,
    sub_area: o.sub_area,
    months,
    long_cm: sizeOf(o)?.long_cm ?? null,
    trend_ratio: t?.kind === "grew" ? t.ratio : null,
    pre_existing: o.pre_existing,
  });
}

export const workOrderOf = (o: Observation) => getWorkOrder(o.id);

/**
 * What a room's photos from one inspection show vs its checklist. Null when no photo of that
 * room/inspection has coverage data yet (not analysed, or analysed before coverage existed).
 */
export function roomCoverage(roomId: string, inspectionId: string): CoverageResult | null {
  const photos = getAssets().filter((a) => a.room_id === roomId && a.inspection_id === inspectionId);
  const lists = photos.map((a) => getCoverage(a.id)).filter((x): x is string[] => !!x);
  if (!lists.length) return null;
  const r = coverageFor(getRoom(roomId).category, lists.flat());
  return r.total ? r : null;
}
