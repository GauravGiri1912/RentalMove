/**
 * middleware.ts — Next.js Edge Middleware for auth session refresh & route protection.
 *
 * Responsibilities:
 * 1. Refresh Supabase Auth JWT tokens on every request (keeps sessions alive)
 * 2. Protect auth-required routes — redirect unauthenticated users to /login
 * 3. Redirect already-authenticated users away from /login and /signup
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Routes that require authentication */
const PROTECTED_ROUTES = [
  "/capture",
  "/review",
  "/timeline",
  "/rooms",
  "/compare",
  "/search",
  "/report",
  "/properties",
];

/** Routes that should redirect authenticated users to the dashboard */
const AUTH_ROUTES = ["/login", "/signup"];

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({
    request: req,
  });

  // Build a Supabase client that can refresh the session cookie in middleware
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Write refreshed cookies back to the response
        cookiesToSet.forEach(({ name, value, options }) => {
          req.cookies.set(name, value);
        });
        res = NextResponse.next({ request: req });
        cookiesToSet.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
        });
      },
    },
  });

  // IMPORTANT: Always call getUser() (not getSession()) to validate the JWT
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = req.nextUrl;

  // Redirect authenticated users away from auth pages
  if (user && AUTH_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Redirect unauthenticated users away from protected pages
  if (!user && PROTECTED_ROUTES.some((r) => pathname.startsWith(r))) {
    const redirectUrl = new URL("/login", req.url);
    redirectUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml
     * - public assets
     * - api routes (handled per-route)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
