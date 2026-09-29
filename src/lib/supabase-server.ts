/**
 * supabase-server.ts
 * Server-side Supabase client factory using @supabase/ssr.
 * Creates a Supabase client that reads/writes auth cookies via Next.js cookies()
 * so JWT sessions are automatically handled server-side.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createAdminClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Server component / Route handler client.
 * Uses the authenticated user's JWT (from cookies), respects RLS.
 */
export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // setAll can fail in Server Components (read-only context), safe to ignore
        }
      },
    },
  });
}

/**
 * Admin client that bypasses RLS.
 * ONLY for server-side operations that need elevated access (e.g., user profile creation).
 * NEVER expose this to the browser.
 */
export function createSupabaseAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("Admin client must never be used client-side.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createAdminClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Get the currently authenticated user (server-side).
 * Returns null if unauthenticated.
 */
export async function getServerUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
}
