/**
 * GET /api/auth/session — Returns the current authenticated user from JWT.
 * DELETE /api/auth/session — Signs out the user.
 *
 * NOTE: The old POST endpoint (demo persona switcher) has been REMOVED.
 * Login is now handled via Supabase Auth at /login.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createServerClient } from "@supabase/ssr";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  // Reading the session happens on every page load; it gets a generous limit of its own.
  // Credential endpoints (sign-in / sign-up) keep the strict auth limit.
  const rl = rateLimit(req, { limit: 120, windowMs: 60_000, prefix: "session" });
  if (!rl.success) return rl.response;

  try {
    const user = await getSessionUser(req);

    if (!user) {
      return NextResponse.json({ authenticated: false, user: null });
    }

    return NextResponse.json({ authenticated: true, user });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to get session", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const res = NextResponse.json({ success: true, message: "Signed out" });

    // Sign out via Supabase SSR client wired to write cookie changes directly to response
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
          cookies: {
            getAll() {
              return req.cookies.getAll();
            },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value, options }) => {
                res.cookies.set(name, value, options);
              });
            },
          },
        }
      );

      await supabase.auth.signOut();
    }

    // Explicitly clear all Supabase auth cookies present on request, including chunked tokens
    for (const cookie of req.cookies.getAll()) {
      if (cookie.name.startsWith("sb-") || cookie.name.includes("auth-token")) {
        res.cookies.delete(cookie.name);
      }
    }

    return res;
  } catch (err: any) {
    return NextResponse.json(
      { error: "Signout failed", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
