import { NextRequest, NextResponse } from "next/server";
import { getVisionProvider } from "@/lib/vision";
import { buildCloudinarySearchExpression } from "@/lib/search";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = body?.query;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query string is required" },
        { status: 400 }
      );
    }

    const vision = getVisionProvider();
    const filter = await vision.parseSearchQuery(query);
    const propertyId = body?.property_id || "prop-381";

    const { expression, validatedFilter } = buildCloudinarySearchExpression(
      filter,
      propertyId
    );

    return NextResponse.json({
      query,
      filter: validatedFilter,
      expression,
    });
  } catch (err: any) {
    console.error("NL search error:", err);
    return NextResponse.json(
      { error: "Failed to parse search query", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
