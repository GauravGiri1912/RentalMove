/**
 * auth.ts — Server-side authentication & authorization helpers.
 *
 * SECURITY CONTRACT:
 * - All session resolution is done via Supabase JWT (httpOnly cookies, managed by @supabase/ssr).
 * - The user's custom profile (role, property assignments) is fetched from the `users` table
 *   using the Supabase Auth UID as the primary key — NOT a client-supplied ID.
 * - No plaintext user IDs are stored or read from cookies.
 * - `getAuthenticatedUserOrThrow` ALWAYS throws if no valid JWT session exists.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createSupabaseAdminClient } from "./supabase-server";
import { User } from "./schemas";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Resolve Supabase Auth user from JWT cookies on a NextRequest.
 * Used in API Route Handlers (which receive NextRequest, not Next.js cookies()).
 */
export async function getSessionUser(req: NextRequest): Promise<User | null> {
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll() {
        // Route handlers can't set cookies via this path — that's handled by middleware
      },
    },
  });

  const {
    data: { user: authUser },
    error,
  } = await supabase.auth.getUser();

  if (error || !authUser) return null;

  return fetchUserProfile(authUser.id);
}

/**
 * Fetch the user's profile from the `users` table by their Supabase Auth UID.
 * The Auth UID is UUID-based and comes from a validated JWT — it cannot be spoofed.
 */
export async function fetchUserProfile(authUid: string): Promise<User | null> {
  const admin = createSupabaseAdminClient();

  const { data: user, error } = await admin
    .from("users")
    .select("*")
    .eq("id", authUid)
    .maybeSingle();

  if (error || !user) return null;

  let assigned_property_id: string | undefined;
  let owned_properties: string[] = [];

  if (user.role === "tenant") {
    const { data: assignments } = await admin
      .from("property_tenants")
      .select("property_id")
      .eq("tenant_id", authUid);
    if (assignments && assignments.length > 0) {
      assigned_property_id = assignments[0].property_id;
    }
  } else if (user.role === "owner") {
    const { data: props } = await admin
      .from("properties")
      .select("id")
      .eq("owner_id", authUid);
    if (props) {
      owned_properties = props.map((p: any) => p.id);
    }
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    assigned_property_id,
    owned_properties,
    created_at: user.created_at,
  };
}

/**
 * Throws if the request has no valid JWT session. Use in all protected API routes.
 */
export async function getAuthenticatedUserOrThrow(req: NextRequest): Promise<User> {
  const user = await getSessionUser(req);
  if (!user) {
    throw Object.assign(new Error("Authentication required. Please log in."), {
      statusCode: 401,
    });
  }
  return user;
}

/**
 * Check if a user can access a specific property.
 * - Owners: must be the property's owner_id
 * - Tenants: must have a property_tenants assignment
 */
export async function canUserAccessProperty(
  user: User,
  propertyId: string
): Promise<boolean> {
  if (user.role === "owner") {
    return (user.owned_properties || []).includes(propertyId);
  }
  if (user.role === "tenant") {
    return user.assigned_property_id === propertyId;
  }
  return false;
}

export function unauthorizedResponse(
  message = "Unauthorized: Authentication required"
): NextResponse {
  return NextResponse.json({ error: "Unauthorized", message }, { status: 401 });
}

export function forbiddenResponse(
  message = "Forbidden: You do not have permission to access this resource"
): NextResponse {
  return NextResponse.json({ error: "Forbidden", message }, { status: 403 });
}
