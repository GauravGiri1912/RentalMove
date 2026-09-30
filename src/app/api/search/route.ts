import { NextRequest, NextResponse } from "next/server";
import { buildCloudinarySearchExpression, filterByCaptureDate } from "@/lib/search";
import { getDatabase } from "@/lib/db";
import { getMediaProvider } from "@/lib/media";
import {
  getAuthenticatedUserOrThrow,
  canUserAccessProperty,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth";
import { SearchFilterSchema } from "@/lib/schemas";
import { rateLimit } from "@/lib/rate-limit";


/**
 * GET /api/search
 * Searches Cloudinary structured metadata.
 * Requires authentication and property access authorization.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUserOrThrow(req);
    const { searchParams } = new URL(req.url);

    // Require property_id — no more hardcoded prop-381 fallback
    const propertyId = searchParams.get("property_id");
    if (!propertyId) {
      return NextResponse.json(
        { error: "property_id query parameter is required" },
        { status: 400 }
      );
    }

    // Verify user can access this property
    const authorized = await canUserAccessProperty(user, propertyId);
    if (!authorized) {
      return forbiddenResponse("You do not have access to search media for this property.");
    }

    const filterInput: Record<string, string> = {};

    const room = searchParams.get("room")?.trim();
    if (room) filterInput.room = room;

    const inspectionType = searchParams.get("inspection_type")?.trim();
    if (inspectionType) filterInput.inspection_type = inspectionType;

    const issueCategory = searchParams.get("issue_category")?.trim();
    if (issueCategory) filterInput.issue_category = issueCategory;

    const reviewStatus = searchParams.get("review_status")?.trim();
    if (reviewStatus) filterInput.review_status = reviewStatus;

    const dateFrom = searchParams.get("date_from")?.trim();
    if (dateFrom) filterInput.date_from = dateFrom;

    const dateTo = searchParams.get("date_to")?.trim();
    if (dateTo) filterInput.date_to = dateTo;

    const freeText = searchParams.get("free_text")?.trim();
    if (freeText) filterInput.free_text = freeText;

    // Validate with Zod before passing to search
    const parsedFilter = SearchFilterSchema.safeParse(filterInput);
    if (!parsedFilter.success) {
      return NextResponse.json(
        { error: "Invalid search parameters", details: parsedFilter.error.format() },
        { status: 400 }
      );
    }

    const { expression, validatedFilter } = buildCloudinarySearchExpression(
      parsedFilter.data as Record<string, string>,
      propertyId
    );

    const media = getMediaProvider();
    const searchResult = await media.search(expression);

    // Dates come from the database (when the photo was captured), not Cloudinary's upload time.
    let resources = searchResult.resources;
    if (validatedFilter.date_from || validatedFilter.date_to) {
      const db = getDatabase();
      const inspections = await db.getInspections(propertyId);
      const assets = await db.getAssetsForInspections(inspections.map((i) => i.id));
      const captured = new Map<string, string>();
      for (const a of assets) {
        if (a.cloudinary_public_id) captured.set(a.cloudinary_public_id, a.captured_at);
      }
      resources = filterByCaptureDate(resources, captured, validatedFilter);
    }

    return NextResponse.json({
      expression,
      filter: validatedFilter,
      total_count: resources.length,
      resources,
      is_mock: media.isMock(),
    });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    console.error("Search API error:", err);
    return NextResponse.json(
      { error: "Search query failed", message: err?.message || String(err) },
      { status: 400 }
    );
  }
}
