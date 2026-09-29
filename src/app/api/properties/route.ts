import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { PropertyCreateSchema } from "@/lib/schemas";
import {
  getAuthenticatedUserOrThrow,
  getSessionUser,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth";

/**
 * GET /api/properties
 * Returns only the properties the authenticated user can access.
 * - Owners see their own properties
 * - Tenants see their assigned property
 * Unauthenticated requests receive 401.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) return unauthorizedResponse();

    const db = getDatabase();
    const properties = await db.listProperties(user.id, user.role);
    return NextResponse.json({ properties });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to list properties", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/properties
 * Creates a new property. Only owners are authorized.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUserOrThrow(req);

    if (user.role !== "owner") {
      return forbiddenResponse("Only property owners can create properties.");
    }

    const body = await req.json();
    const parsed = PropertyCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid property data", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const db = getDatabase();
    const propertyData = {
      ...parsed.data,
      owner_id: user.id, // Always use the authenticated user's ID
    };

    const property = await db.createProperty(propertyData);
    const rooms = await db.getRooms(property.id);

    return NextResponse.json({ property, rooms }, { status: 201 });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    console.error("Property creation error:", err);
    return NextResponse.json(
      { error: "Failed to create property", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
