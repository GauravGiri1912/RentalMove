/**
 * wear.ts — neutral "is this typical of everyday use?" guidance for a finding.
 *
 * Deposit disputes usually turn on whether something is normal wear for the time lived in.
 * This gives CONTEXT, never a verdict: what is commonly seen after N months, or that
 * something is less common and deserves a closer look. It never assigns cause, fault or cost
 * (see lib/copy.ts), and the UI always shows WEAR_DISCLAIMER next to it.
 */

export type WearLevel = "typical" | "review" | "unknown";
export interface WearContext { level: WearLevel; text: string }

export const WEAR_DISCLAIMER = "Guidance about everyday use only — not a finding of cause or responsibility.";

export function monthsBetween(fromIso: string, toIso: string): number {
  return Math.max(0, (new Date(toIso).getTime() - new Date(fromIso).getTime()) / (30.44 * 864e5));
}

export function wearContext(input: {
  category: string;
  sub_area?: string;
  months: number | null;
  long_cm?: number | null;
  trend_ratio?: number | null;
  pre_existing?: boolean;
}): WearContext {
  const { category, months, long_cm, trend_ratio, pre_existing } = input;
  const area = (input.sub_area ?? "").toLowerCase();
  const m = months != null ? Math.max(0, Math.round(months)) : null;
  const span = m != null ? `${m} month${m === 1 ? "" : "s"}` : "the time between visits";

  if (pre_existing && (trend_ratio == null || trend_ratio < 1.25)) {
    return { level: "typical", text: "Already recorded at an earlier visit and not noticeably larger now." };
  }
  switch (category) {
    case "mark":
      if (long_cm != null && long_cm > 25) return { level: "review", text: `Larger (${Math.round(long_cm)} cm) than the light scuffing usually seen from everyday use — worth a closer look.` };
      if (m != null && m >= 6) return { level: "typical", text: `Light scuffs${/skirting|baseboard|door|wall/.test(area) ? " on walls, doors and skirting" : ""} are commonly seen after ${span} of everyday use.` };
      return { level: "unknown", text: "Light marks are common, but the time between visits is short." };
    case "scratch":
      if (long_cm != null && long_cm > 15) return { level: "review", text: `Longer (${Math.round(long_cm)} cm) than the fine surface scratches usually seen from everyday use — worth a closer look.` };
      if (m != null && m >= 12) return { level: "typical", text: `Fine surface scratches${/floor/.test(area) ? " on floors" : /cabinet|door/.test(area) ? " on cabinet fronts" : ""} commonly appear with everyday use over ${span}.` };
      return { level: "review", text: `Scratches after only ${span} are less common from everyday use — worth a closer look.` };
    case "stain":
      if (trend_ratio != null && trend_ratio >= 1.5) return { level: "review", text: `Grew noticeably since the previous visit (×${trend_ratio.toFixed(1)}) — may point to ongoing moisture; ventilation is a common factor.` };
      if (/grout|shower|tile|bath|sink|threshold/.test(area)) return { level: "typical", text: "Grout discolouration in wet areas is common and usually moisture-related; ventilation strongly affects it." };
      return { level: "unknown", text: "Stains vary widely in origin; a person should look at this one." };
    case "dent":
      if (long_cm != null && long_cm <= 3) return { level: "typical", text: "Small dents and fixing holes are common where items were hung or furniture stood." };
      return { level: "review", text: "Dents and chips are not typically produced by everyday use; a person should assess the cause." };
    case "crack":
      return { level: "review", text: "Cracks are not typically produced by everyday use and can have structural or settling causes — a person should assess them." };
    default:
      return { level: "unknown", text: "No general guidance for this kind of finding." };
  }
}
