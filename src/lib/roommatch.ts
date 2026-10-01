/**
 * roommatch.ts — does a photo really show the room it was filed under?
 *
 * Compared with the earliest photo of that room using two signals (pure scoring here; the
 * pixel work is in roommatch-node.ts). Measured by scripts/eval-roommatch.ts on this
 * property: same room 0.989–0.999 view / 2–12 bits; phone photos of other rooms filed as the
 * living room 0.03–0.34 / 24–36; every photo vs a different room ≤0.21 / 30–42. The demo's
 * "same room" photos are simulated re-shots, so real retakes will score lower — hence a
 * middle "unclear" band that asks a person instead of guessing.
 */

export type MatchVerdict = "first" | "match" | "unclear" | "mismatch" | "confirmed";

export const MATCH_VIEW = 0.6;
export const MISMATCH_VIEW = 0.4;
export const MATCH_PHASH = 14;
export const MISMATCH_PHASH = 20;

export function decideMatch(view: number | null, phashBits: number | null): { verdict: Exclude<MatchVerdict, "first" | "confirmed">; reason: string } {
  const v = view ?? null, p = phashBits ?? null;
  if ((v != null && v >= MATCH_VIEW) || (p != null && p <= MATCH_PHASH)) {
    return { verdict: "match", reason: "Lines up with earlier photos of this room." };
  }
  if (v != null && v < MISMATCH_VIEW && (p == null || p >= MISMATCH_PHASH)) {
    return { verdict: "mismatch", reason: "Does not line up with earlier photos of this room — a different room or a different home?" };
  }
  return { verdict: "unclear", reason: "Only partly similar to earlier photos of this room (a different angle?). Please confirm it is this room." };
}

/** Comparisons and the report only use photos that are not (unconfirmed) mismatches. */
export const usableForComparison = (v: MatchVerdict | undefined) => v !== "mismatch";

export const MATCH_LABEL: Record<MatchVerdict, string> = {
  first: "First photo of this room",
  match: "Matches this room",
  unclear: "Check: is this the room?",
  mismatch: "Doesn't match this room",
  confirmed: "Confirmed as this room",
};

/** Server/UI shared choice of the photo that represents a room at a visit (see view.ts assetFor). */
export function pickPrimary<T extends { id: string }>(photos: T[], match: Record<string, { verdict: MatchVerdict; view: number | null }>): T | undefined {
  const usable = photos.filter((a) => match[a.id]?.verdict !== "mismatch");
  const rank = (id: string) => {
    const m = match[id];
    return m?.verdict === "confirmed" ? 2 : m?.verdict === "first" ? 1.5 : m ? m.view ?? 0 : 0.5;
  };
  return usable.length <= 1 ? usable[0] : [...usable].sort((a, b) => rank(b.id) - rank(a.id))[0];
}
