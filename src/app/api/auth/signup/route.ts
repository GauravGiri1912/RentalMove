/**
 * POST /api/auth/signup
 *
 * Creates an account through Supabase's normal sign-up, so Supabase sends its confirmation email and the
 * account stays UNCONFIRMED until the person clicks the link. Nothing here pre-confirms an address:
 * that is what makes "this account controls this email" mean anything.
 *
 * No role is accepted. What an account may do follows from the property it creates or the invitation it
 * accepts (see lib/auth.ts), never from anything chosen here.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { z } from "zod";
import { authRateLimit } from "@/lib/rate-limit";
import { mayShowConfirmLink } from "@/lib/dev-confirm";

const SignupSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(100),
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
  })
  .passthrough(); // a legacy client may still send "role"; it is ignored

export async function POST(req: NextRequest) {
  const rl = await authRateLimit(req);
  if (!rl.success) return rl.response;

  try {
    const parsed = SignupSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid registration data", details: parsed.error.format() }, { status: 400 });
    }

    const { name, password } = parsed.data;
    const email = parsed.data.email.trim().toLowerCase();

    const { data: existing } = await createSupabaseAdminClient().from("users").select("id").eq("email", email).maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists. Please log in." }, { status: 409 });
    }

    // Supabase's own sign-up: it creates the user unconfirmed and emails the confirmation link.
    const origin = req.nextUrl.origin;
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data, error } = await anon.auth.signUp({
      email,
      password,
      options: { data: { name: name.trim() }, emailRedirectTo: `${origin}/login?confirmed=1` },
    });

    if (error) {
      const tooMany = /rate|limit|seconds/i.test(error.message);
      if (tooMany && !mayShowConfirmLink()) {
        return NextResponse.json({ error: "Too many confirmation emails have been sent from this site in the last hour. Please try again shortly." }, { status: 429 });
      }
      if (tooMany) {
        // Development only (see lib/dev-confirm.ts): the email quota is exhausted, so the link is shown on screen.
        // Fallback (Option B): Supabase built-in email quota exceeded.
        // Generate the confirmation link via admin API without using Supabase's rate-limited email sender.
        const admin = createSupabaseAdminClient();
        const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
          type: "signup",
          email,
          password,
          options: { data: { name: name.trim() }, redirectTo: `${origin}/login?confirmed=1` },
        });

        if (linkErr) {
          if (/already/i.test(linkErr.message)) {
            return NextResponse.json({ error: "An account with this email already exists. Please log in." }, { status: 409 });
          }
          return NextResponse.json({ error: linkErr.message || "Could not create the account" }, { status: 400 });
        }

        const userId = linkData?.user?.id;
        if (userId) {
          await admin.from("users").upsert({
            id: userId,
            name: name.trim(),
            email,
            role: "tenant",
            created_at: new Date().toISOString(),
          });
        }

        const confirmUrl = linkData?.properties?.action_link ?? null;
        return NextResponse.json({
          success: true,
          needsConfirmation: true,
          email,
          confirmUrl,
          message: "Check your email to confirm your address, then log in.",
          userId: userId ?? null,
        });
      }

      return NextResponse.json(
        { error: error.message || "Could not create the account" },
        { status: 400 },
      );
    }

    // Already confirmed only if the project has confirmations switched off.
    const needsConfirmation = !data.user?.email_confirmed_at;
    if (data.user?.id) {
      await createSupabaseAdminClient().from("users").upsert({
        id: data.user.id,
        name: name.trim(),
        email,
        role: "tenant",
        created_at: new Date().toISOString(),
      });
    }
    return NextResponse.json({
      success: true,
      needsConfirmation,
      email,
      message: needsConfirmation ? "Check your email to confirm your address, then log in." : "Account created. You can now log in.",
      userId: data.user?.id ?? null,
    });
  } catch (err: any) {
    console.error("Signup error:", err);
    return NextResponse.json({ error: "Signup failed", message: err?.message || String(err) }, { status: 500 });
  }
}
