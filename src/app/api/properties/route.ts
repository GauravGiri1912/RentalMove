import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { PropertyCreateSchema } from "@/lib/schemas";
import {
  getAuthenticatedUserOrThrow,
  canCreateProperty,
  invalidateAuthCaches,
  getSessionUser,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

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
 * Creates a new property; whoever creates it becomes its owner. Not available to someone who is a tenant.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUserOrThrow(req);

    const allowed = canCreateProperty(user);
    if (!allowed.ok) return forbiddenResponse(allowed.reason);
    const rl = await rateLimit(req, { limit: 10, windowMs: 3_600_000, prefix: "property-create" });
    if (!rl.success) return rl.response;

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
    // Keep the legacy label in step (best effort) and make the new role visible immediately.
    try { await createSupabaseAdminClient().from("users").update({ role: "owner" }).eq("id", user.id); } catch {}
    invalidateAuthCaches();

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
