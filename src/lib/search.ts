import { SearchFilter, SearchFilterSchema } from "./schemas";

/**
 * Builds a validated, safe Cloudinary Search API expression string.
 * Hard rule: The LLM/user input NEVER generates raw expression syntax.
 * Only sanitized, whitelisted fields are concatenated.
 */
export function buildCloudinarySearchExpression(
  filterInput: unknown,
  propertyId = "prop-381"
): { expression: string; validatedFilter: SearchFilter } {
  const filter = SearchFilterSchema.parse(filterInput);
  const clauses: string[] = [];

  // Constrain to property hierarchy via public_id prefix
  const safePropId = propertyId
    .replace(/--+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .replace(/^-+|-+$/g, "");
  clauses.push(`public_id:properties/${safePropId}*`);

  if (filter.room) {
    clauses.push(`tags:${filter.room}`);
  }

  if (filter.inspection_type) {
    clauses.push(`tags:${filter.inspection_type}`);
  }

  if (filter.issue_category && filter.issue_category !== "none") {
    clauses.push(`tags:${filter.issue_category}`);
  }

  if (filter.review_status) {
    // Tag values containing ":" must be quoted or Cloudinary rejects the query.
    clauses.push(`tags:"review:${filter.review_status}"`);
  }

  // Date filters are NOT part of the Cloudinary expression: Cloudinary's created_at is the
  // upload time, not when the inspection photo was taken. They are applied to the stored
  // capture date by filterByCaptureDate() after the search.

  if (filter.free_text) {
    const sanitizedText = filter.free_text.replace(/[^a-zA-Z0-9_-]/g, "").trim();
    if (sanitizedText) {
      clauses.push(`tags:${sanitizedText}*`);
    }
  }

  return {
    expression: clauses.join(" AND "),
    validatedFilter: filter,
  };
}

/**
 * Keeps only resources whose stored capture date falls in [date_from, date_to] (inclusive,
 * whole days). Resources with no known capture date are excluded when a date filter is set,
 * because their date cannot be established.
 */
export function filterByCaptureDate<T extends { public_id: string }>(
  resources: T[],
  capturedAtByPublicId: Map<string, string>,
  filter: Pick<SearchFilter, "date_from" | "date_to">
): T[] {
  if (!filter.date_from && !filter.date_to) return resources;
  const from = filter.date_from ? Date.parse(`${filter.date_from}T00:00:00.000Z`) : -Infinity;
  const to = filter.date_to ? Date.parse(`${filter.date_to}T23:59:59.999Z`) : Infinity;
  return resources.filter((r) => {
    const captured = capturedAtByPublicId.get(r.public_id);
    if (!captured) return false;
    const t = Date.parse(captured);
    return Number.isFinite(t) && t >= from && t <= to;
  });
}
