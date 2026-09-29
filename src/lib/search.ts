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

  if (filter.date_from) {
    clauses.push(`created_at>=${filter.date_from}`);
  }

  if (filter.date_to) {
    clauses.push(`created_at<=${filter.date_to}`);
  }

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
