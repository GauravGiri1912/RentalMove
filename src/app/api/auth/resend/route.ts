import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authRateLimit } from "@/lib/rate-limit";

const Body = z.object({ email: z.string().email() });

/**
 * POST /api/auth/resend — sends the confirmation email again.
 *
 * The reply never says whether the address has an account or is already confirmed: that would let anyone
 * test which emails are registered here. It never returns a link either: a link handed to whoever asks would
 * let them confirm (or sign in to) an address that is not theirs.
 */
export async function POST(req: NextRequest) {
  const rl = await authRateLimit(req);
  if (!rl.success) return rl.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the email address you signed up with." }, { status: 400 });

  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error } = await anon.auth.resend({
    type: "signup",
    email: parsed.data.email.trim().toLowerCase(),
    options: { emailRedirectTo: `${req.nextUrl.origin}/login?confirmed=1` },
  });

  if (error && /rate|limit|seconds/i.test(error.message)) {
    return NextResponse.json({ error: "Please wait a little before asking for another email." }, { status: 429 });
  }
  return NextResponse.json({ ok: true, message: "If that address needs confirming, a new link is on its way." });
}
