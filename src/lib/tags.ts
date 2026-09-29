/**
 * tags.ts — the tag vocabulary RentalMove maintains on Cloudinary assets.
 *
 * Tags are what the Cloudinary Search API filters on, so they must be written for EVERY asset
 * (seeded or freshly uploaded) after analysis and after each human review.
 *
 *   room:<room>  insp:<type>          written at upload time (signed upload params)
 *   <issue>      issue:<issue>        one per non-rejected observation category ("scratch", "issue:scratch")
 *   issue:none                        no non-rejected observations
 *   review:<status>                   one per review status present ("review:pending", ...)
 */

export const ISSUE_CATEGORIES = ["scratch", "stain", "crack", "dent", "mark", "other"] as const;
export const REVIEW_STATUSES = ["pending", "accepted", "rejected", "edited"] as const;

export interface TaggableObservation {
  category: string;
  review_status: string;
}

/** Tags that this module owns (and therefore may add or remove). */
export function isManagedTag(tag: string): boolean {
  return (
    (ISSUE_CATEGORIES as readonly string[]).includes(tag) ||
    tag.startsWith("issue:") ||
    tag.startsWith("review:")
  );
}

/** Desired managed tags for an asset given its observations. Rejected findings are not "issues". */
export function computeManagedTags(observations: TaggableObservation[]): string[] {
  const tags = new Set<string>();
  const active = observations.filter((o) => o.review_status !== "rejected");

  if (active.length === 0) {
    tags.add("issue:none");
  }
  for (const o of active) {
    tags.add(o.category);
    tags.add(`issue:${o.category}`);
  }
  for (const o of observations) {
    tags.add(`review:${o.review_status}`);
  }
  return [...tags].sort();
}

export function diffTags(current: string[], desired: string[]): { add: string[]; remove: string[] } {
  const cur = new Set(current);
  const want = new Set(desired);
  return {
    add: desired.filter((t) => !cur.has(t)),
    remove: current.filter((t) => isManagedTag(t) && !want.has(t)),
  };
}
