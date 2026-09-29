import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "./db";
import { User } from "./schemas";

export async function getSessionUser(req: NextRequest): Promise<User | null> {
  const db = getDatabase();
  const userId = req.cookies.get("rentalmove_session_user_id")?.value;

  if (userId) {
    const user = await db.getUser(userId);
    if (user) return user;
  }

  // Also support Authorization header Bearer token if user provides Supabase JWT or user ID
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    const user = await db.getUser(token);
    if (user) return user;
  }

  return null;
}

export async function getAuthenticatedUserOrThrow(req: NextRequest): Promise<User> {
  const user = await getSessionUser(req);
  if (!user) {
    throw new Error("Authentication required. Please log in.");
  }
  return user;
}

export async function canUserAccessProperty(user: User, propertyId: string): Promise<boolean> {
  const db = getDatabase();
  const property = await db.getProperty(propertyId);
  if (!property) return false;

  if (user.role === "owner") {
    // Owner must own this property
    return property.owner_id === user.id || (user.owned_properties || []).includes(propertyId);
  }

  if (user.role === "tenant") {
    // Tenant must be assigned to this property
    if (user.assigned_property_id === propertyId) return true;
    const userWithAssignments = await db.getUser(user.id);
    return userWithAssignments?.assigned_property_id === propertyId;
  }

  return false;
}

export function unauthorizedResponse(message = "Unauthorized: Authentication required"): NextResponse {
  return NextResponse.json({ error: "Unauthorized", message }, { status: 401 });
}

export function forbiddenResponse(message = "Forbidden: You do not have permission to access this resource"): NextResponse {
  return NextResponse.json({ error: "Forbidden", message }, { status: 403 });
}
