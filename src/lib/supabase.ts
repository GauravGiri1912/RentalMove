import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseAdminClient: SupabaseClient | null = null;
let supabaseAnonClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return false;
  if (url.includes("your-project") || url.includes("placeholder")) return false;
  if (key.includes("your_") || key.includes("placeholder")) return false;

  return url.startsWith("https://") && key.length > 20;
}

/**
 * Server-side client using SUPABASE_SERVICE_ROLE_KEY (bypasses RLS for administrative backend queries).
 * Strictly server-side: enforces that it is never invoked in a browser/client-side context.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (typeof window !== "undefined") {
    throw new Error(
      "Security Violation: getSupabaseClient (service role) must NEVER be called client-side."
    );
  }

  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!supabaseAdminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
    supabaseAdminClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return supabaseAdminClient;
}

/**
 * Public client using NEXT_PUBLIC_SUPABASE_ANON_KEY for client-side or scoped queries.
 */
export function getSupabaseAnonClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey || anonKey.length < 20) {
    return null;
  }

  if (!supabaseAnonClient) {
    supabaseAnonClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }

  return supabaseAnonClient;
}
