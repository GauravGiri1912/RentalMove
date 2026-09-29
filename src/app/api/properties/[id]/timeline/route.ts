import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import {
  getAuthenticatedUserOrThrow,
  canUserAccessProperty,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth";

/**
 * GET /api/properties/[id]/timeline
 * Returns the full property timeline (inspections + assets + observations).
 * Requires authentication and property access authorization.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const user = await getAuthenticatedUserOrThrow(req);
    const authorized = await canUserAccessProperty(user, id);
    if (!authorized) {
      return forbiddenResponse("You do not have authorization to view this property's timeline.");
    }

    const db = getDatabase();
    const timeline = await db.getTimeline(id);
    return NextResponse.json(timeline);
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    return NextResponse.json(
      { error: "Failed to fetch property timeline", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
