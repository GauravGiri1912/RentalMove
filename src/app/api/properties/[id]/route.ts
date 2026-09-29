import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import {
  getAuthenticatedUserOrThrow,
  canUserAccessProperty,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth";

/**
 * GET /api/properties/[id]
 * Returns property details including rooms and inspections.
 * Requires authentication and access authorization.
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
      return forbiddenResponse("You do not have authorization to view this property.");
    }

    const db = getDatabase();
    const [property, rooms, inspections] = await Promise.all([
      db.getProperty(id),
      db.getRooms(id),
      db.getInspections(id),
    ]);
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    return NextResponse.json({ property, rooms, inspections });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    return NextResponse.json(
      { error: "Failed to fetch property", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
