import { NextRequest, NextResponse } from "next/server";
import { buildCloudinarySearchExpression } from "@/lib/search";
import { getMediaProvider } from "@/lib/media";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
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

    const propertyId = searchParams.get("property_id") || "prop-381";

    const { expression, validatedFilter } = buildCloudinarySearchExpression(
      filterInput,
      propertyId
    );

    const media = getMediaProvider();
    const searchResult = await media.search(expression);

    return NextResponse.json({
      expression,
      filter: validatedFilter,
      total_count: searchResult.total_count,
      resources: searchResult.resources,
      is_mock: media.isMock(),
    });
  } catch (err: any) {
    console.error("Search API error:", err);
    return NextResponse.json(
      { error: "Search query failed", message: err?.message || String(err) },
      { status: 400 }
    );
  }
}
