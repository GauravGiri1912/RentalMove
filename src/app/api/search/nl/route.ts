import { NextRequest, NextResponse } from "next/server";
import { getVisionProvider } from "@/lib/vision";
import { buildCloudinarySearchExpression } from "@/lib/search";
import {
  getAuthenticatedUserOrThrow,
  canUserAccessProperty,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth";
import { z } from "zod";

const NLSearchSchema = z.object({
  query: z.string().min(1).max(500),
  property_id: z.string().min(1),
});

/**
 * POST /api/search/nl
 * Parses a natural language query into a structured search filter.
 * Requires authentication and property access authorization.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUserOrThrow(req);

    const body = await req.json();
    const parsed = NLSearchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { query, property_id } = parsed.data;

    // Verify user can access this property
    const authorized = await canUserAccessProperty(user, property_id);
    if (!authorized) {
      return forbiddenResponse("You do not have access to search media for this property.");
    }

    const vision = getVisionProvider();
    const filter = await vision.parseSearchQuery(query);

    const { expression, validatedFilter } = buildCloudinarySearchExpression(
      filter,
      property_id
    );

    return NextResponse.json({
      query,
      filter: validatedFilter,
      expression,
    });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    console.error("NL search error:", err);
    return NextResponse.json(
      { error: "Failed to parse search query", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
