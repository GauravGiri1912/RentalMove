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
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Short-lived caches. Every Supabase round trip costs ~0.25 s; without these each API
// request paid ~4 of them just to learn who the caller is.
//  - Verified sessions: 30 s, keyed by a hash of the auth cookies/header (a revoked
//    session keeps working for at most 30 s).
//  - Profiles (role, property assignments): 60 s, keyed by auth uid.
// ---------------------------------------------------------------------------
const SESSION_TTL_MS = 30_000;
const PROFILE_TTL_MS = 60_000;
const sessionCache = new Map<string, { user: User; exp: number }>();
const profileCache = new Map<string, { user: User | null; exp: number }>();

function sessionKey(req: NextRequest): string | null {
  const cookies = req.cookies.getAll().filter((c) => c.name.startsWith("sb-")).map((c) => `${c.name}=${c.value}`).join(";");
  const header = req.headers.get("authorization") || "";
  if (!cookies && !header) return null;
  return crypto.createHash("sha256").update(`${cookies}|${header}`).digest("hex");
}

/** Drops cached profiles (e.g. after a role or assignment change). */
export function invalidateAuthCaches() {
  sessionCache.clear();
  profileCache.clear();
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Resolve Supabase Auth user from JWT cookies on a NextRequest.
 * Used in API Route Handlers (which receive NextRequest, not Next.js cookies()).
 */
export async function getSessionUser(req: NextRequest): Promise<User | null> {
  const key = sessionKey(req);
  if (!key) return null;
  const hit = sessionCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.user;
  const user = await resolveSessionUser(req);
  if (user) {
    if (sessionCache.size > 500) sessionCache.clear();
    sessionCache.set(key, { user, exp: Date.now() + SESSION_TTL_MS });
  }
  return user;
}

/**
 * Resolve Supabase Auth user in Next.js Server Components / layouts using cookies().
 */
export async function getServerSessionUser(): Promise<User | null> {
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;

    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    });

    const { data: { user: authUser }, error } = await supabase.auth.getUser();
    if (authUser && !error) {
      return fetchUserProfile(authUser.id, authUser.email);
    }

    const sbAccessToken = cookieStore.get("sb-access-token")?.value;
    if (sbAccessToken) {
      const { data: { user: fallbackUser }, error: fallbackErr } = await supabase.auth.getUser(sbAccessToken);
      if (fallbackUser && !fallbackErr) {
        return fetchUserProfile(fallbackUser.id, fallbackUser.email);
      }
    }
  } catch {}
  return null;
}

async function resolveSessionUser(req: NextRequest): Promise<User | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll() {
        // Route handlers can't set cookies via this path — that's handled by middleware
      },
    },
  });

  // 1. Check Authorization: Bearer <token> header first
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const bearerToken = authHeader.substring(7).trim();
    if (bearerToken) {
      try {
        const { data: { user: authUser }, error } = await supabase.auth.getUser(bearerToken);
        if (authUser && !error) {
          return fetchUserProfile(authUser.id, authUser.email);
        }
      } catch {}
    }
  }

  // 2. Check SSR cookies via supabase.auth.getUser()
  try {
    const { data: { user: authUser }, error } = await supabase.auth.getUser();
    if (authUser && !error) {
      return fetchUserProfile(authUser.id, authUser.email);
    }
  } catch {}

  // 3. Check fallback cookie sb-access-token if present
  const sbAccessToken = req.cookies.get("sb-access-token")?.value;
  if (sbAccessToken) {
    try {
      const { data: { user: authUser }, error } = await supabase.auth.getUser(sbAccessToken);
      if (authUser && !error) {
        return fetchUserProfile(authUser.id, authUser.email);
      }
    } catch {}
  }

  // 4. Fallback to getClaims() if available
  try {
    const { data } = await supabase.auth.getClaims();
    if (data?.claims?.sub) {
      return fetchUserProfile(data.claims.sub, data.claims.email as string | undefined);
    }
  } catch {}

  return null;
}

/**
 * Fetch the user's profile from the `users` table by their Supabase Auth UID or email.
 * Supports seeded demo users (whose DB ID is user-tenant-1 / user-owner-1) and
 * dynamically registered auth users.
 */
export async function fetchUserProfile(
  authUid: string,
  email?: string | null
): Promise<User | null> {
  const hit = profileCache.get(authUid);
  if (hit && hit.exp > Date.now()) return hit.user;
  const user = await loadUserProfile(authUid, email);
  profileCache.set(authUid, { user, exp: Date.now() + PROFILE_TTL_MS });
  return user;
}

async function loadUserProfile(authUid: string, email?: string | null): Promise<User | null> {
  const admin = createSupabaseAdminClient();

  // 1. Try finding by authUid in `users`
  let user: any = null;
  const { data: userById } = await admin
    .from("users")
    .select("*")
    .eq("id", authUid)
    .maybeSingle();

  if (userById) {
    user = userById;
  } else if (email) {
    // 2. Fall back to matching by email (e.g. seeded demo users)
    const { data: userByEmail } = await admin
      .from("users")
      .select("*")
      .eq("email", email)
      .maybeSingle();
    user = userByEmail;
  }

  // 3. If user is in auth.users but not in users table yet, auto-provision profile
  if (!user) {
    try {
      const { data: authData } = await admin.auth.admin.getUserById(authUid);
      if (authData?.user) {
        const meta = authData.user.user_metadata || {};
        const newUser = {
          id: authUid,
          name: meta.name || authData.user.email?.split("@")[0] || "User",
          email: authData.user.email || email || "",
          role: meta.role === "owner" ? "owner" : "tenant",
          created_at: new Date().toISOString(),
        };
        const { data: created } = await admin
          .from("users")
          .insert(newUser)
          .select()
          .maybeSingle();
        user = created || newUser;
      }
    } catch (err) {
      console.warn("Could not auto-provision user profile:", err);
    }
  }

  if (!user) return null;

  // Run property lookups using the resolved user.id
  const [assignmentsRes, propsRes] = await Promise.all([
    admin.from("property_tenants").select("property_id").eq("tenant_id", user.id),
    admin.from("properties").select("id").eq("owner_id", user.id),
  ]);

  // The role comes from the person's relationship to properties, not from the label stored on the account
  // (which anyone could choose at signup): whoever owns a property is an owner; everyone else is a tenant.
  // One account is either an owner or a tenant, so owner powers can never apply to a property someone only rents.
  const owned_properties: string[] = (propsRes.data ?? []).map((p: any) => p.id);
  const role: "owner" | "tenant" = owned_properties.length > 0 ? "owner" : "tenant";
  const assigned_property_id: string | undefined = role === "tenant" ? assignmentsRes.data?.[0]?.property_id : undefined;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role,
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

/** Anyone signed in may start a property (and so becomes its owner), unless they are already a tenant somewhere. */
export const MAX_OWNED_PROPERTIES = 3;
export function canCreateProperty(user: User): { ok: true } | { ok: false; reason: string } {
  if (user.role === "tenant" && user.assigned_property_id) return { ok: false, reason: "This account is a tenant of a property. Use a different account to manage a property of your own." };
  if ((user.owned_properties ?? []).length >= MAX_OWNED_PROPERTIES) return { ok: false, reason: `An account can manage up to ${MAX_OWNED_PROPERTIES} properties.` };
  return { ok: true };
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
