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

  // Constrain to property folder hierarchy
  // e.g. folder:properties/prop-381/*
  const safePropId = propertyId
    .replace(/--+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .replace(/^-+|-+$/g, "");
  clauses.push(`folder:properties/${safePropId}/*`);

  if (filter.room) {
    clauses.push(`metadata.room=${filter.room}`);
  }

  if (filter.inspection_type) {
    clauses.push(`metadata.inspection_type=${filter.inspection_type}`);
  }

  if (filter.issue_category) {
    clauses.push(`metadata.issue_category=${filter.issue_category}`);
  }

  if (filter.review_status) {
    clauses.push(`metadata.review_status=${filter.review_status}`);
  }

  if (filter.date_from) {
    clauses.push(`metadata.capture_date>=${filter.date_from}`);
  }

  if (filter.date_to) {
    clauses.push(`metadata.capture_date<=${filter.date_to}`);
  }

  if (filter.free_text) {
    // Sanitize free text to alphanumeric and basic characters
    const sanitizedText = filter.free_text.replace(/[^a-zA-Z0-9_\s-]/g, "").trim();
    if (sanitizedText) {
      clauses.push(`(tags:${sanitizedText}* OR ${sanitizedText}*)`);
    }
  }

  return {
    expression: clauses.join(" AND "),
    validatedFilter: filter,
  };
}
