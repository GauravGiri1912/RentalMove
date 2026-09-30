/**
 * POST /api/auth/signup
 * Securely creates a user account in Supabase Auth with pre-confirmed email (email_confirm: true),
 * and provisions the user profile in the `users` table and default property assignment.
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { z } from "zod";
import { authRateLimit } from "@/lib/rate-limit";

const SignupSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["tenant", "owner"]),
});

export async function POST(req: NextRequest) {
  const rl = authRateLimit(req);
  if (!rl.success) return rl.response;

  try {
    const body = await req.json();
    const parsed = SignupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid registration data", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { name, email, password, role } = parsed.data;
    const cleanEmail = email.trim().toLowerCase();
    const admin = createSupabaseAdminClient();

    // 1. Check if user already exists
    const { data: existingUser } = await admin
      .from("users")
      .select("id")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists. Please log in." },
        { status: 409 }
      );
    }

    // 2. Create in Supabase Auth with email_confirm: true (no email rate limits or wait times)
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: { name: name.trim(), role },
    });

    if (authError) {
      return NextResponse.json(
        { error: authError.message || "Failed to create account" },
        { status: 400 }
      );
    }

    const authUserId = authData.user.id;

    // 3. Insert profile into users table
    const { error: profileError } = await admin.from("users").insert({
      id: authUserId,
      name: name.trim(),
      email: cleanEmail,
      role,
      created_at: new Date().toISOString(),
    });

    if (profileError) {
      console.warn("Could not insert user profile row:", profileError);
    }

    // 4. Default property assignment:
    // If tenant, assign to default demo property 'prop-381'
    if (role === "tenant") {
      await admin.from("property_tenants").insert({
        id: `assign-${authUserId.slice(0, 8)}`,
        property_id: "prop-381",
        tenant_id: authUserId,
        created_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      success: true,
      message: "Account created successfully! You can now log in.",
      userId: authUserId,
    });
  } catch (err: any) {
    console.error("Signup error:", err);
    return NextResponse.json(
      { error: "Signup failed", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
