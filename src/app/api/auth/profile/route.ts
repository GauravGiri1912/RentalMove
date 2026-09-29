/**
 * POST /api/auth/profile
 * Creates a user profile in the `users` table after Supabase Auth signup.
 *
 * Security: Only creates profiles for the currently authenticated user.
 * The user ID is derived from the validated JWT — NOT from the request body.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { z } from "zod";

const ProfileCreateSchema = z.object({
  name: z.string().min(1).max(100),
  role: z.enum(["tenant", "owner"]),
});

export async function POST(req: NextRequest) {
  try {
    // Validate the JWT and get the auth user
    const user = await getSessionUser(req);
    if (!user) {
      // If the session isn't available yet (e.g., email not confirmed),
      // fall back to reading the user ID from the request body but ONLY
      // after the Supabase auth token is verified. This handles the signup flow
      // where the user's session might not yet be fully established.
      const body = await req.json();
      const parsed = ProfileCreateSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid data" }, { status: 400 });
      }

      // We need the auth user ID — extract it from the JWT token in the cookie
      const { createServerClient } = await import("@supabase/ssr");
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return req.cookies.getAll();
            },
            setAll() {},
          },
        }
      );

      const { data: { user: authUser }, error } = await supabase.auth.getUser();
      if (error || !authUser) {
        return NextResponse.json(
          { error: "Not authenticated" },
          { status: 401 }
        );
      }

      const admin = createSupabaseAdminClient();

      // Check if profile already exists
      const { data: existing } = await admin
        .from("users")
        .select("id")
        .eq("id", authUser.id)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ success: true, message: "Profile already exists" });
      }

      const { data, error: insertError } = await admin
        .from("users")
        .insert({
          id: authUser.id,
          name: parsed.data.name,
          email: authUser.email,
          role: parsed.data.role,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        console.error("[Profile] Create error:", insertError);
        return NextResponse.json(
          { error: "Failed to create profile", details: insertError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, user: data }, { status: 201 });
    }

    // If user already has a profile (getSessionUser succeeded), just return it
    return NextResponse.json({ success: true, user }, { status: 200 });
  } catch (err: any) {
    console.error("[Profile] Unexpected error:", err);
    return NextResponse.json(
      { error: "Profile creation failed", message: err?.message },
      { status: 500 }
    );
  }
}
