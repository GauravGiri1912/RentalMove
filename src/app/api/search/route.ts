import { NextRequest, NextResponse } from "next/server";
import { buildCloudinarySearchExpression } from "@/lib/search";
import { getMediaProvider } from "@/lib/media";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filterInput: Record<string, string> = {};

    if (searchParams.get("room")) filterInput.room = searchParams.get("room")!;
    if (searchParams.get("inspection_type"))
      filterInput.inspection_type = searchParams.get("inspection_type")!;
    if (searchParams.get("issue_category"))
      filterInput.issue_category = searchParams.get("issue_category")!;
    if (searchParams.get("review_status"))
      filterInput.review_status = searchParams.get("review_status")!;
    if (searchParams.get("date_from")) filterInput.date_from = searchParams.get("date_from")!;
    if (searchParams.get("date_to")) filterInput.date_to = searchParams.get("date_to")!;
    if (searchParams.get("free_text")) filterInput.free_text = searchParams.get("free_text")!;

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
