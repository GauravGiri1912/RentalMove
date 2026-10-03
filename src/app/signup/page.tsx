"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Building2, KeyRound, Loader2, MailCheck, UserPlus } from "lucide-react";
import { AuthFrame } from "@/components/auth-frame";

export default function SignupPage() {
  return <Suspense fallback={null}><Signup /></Suspense>;
}

/**
 * Creating an account here means managing a property. A tenant never signs up on their own: they arrive on
 * /join/<token> from their landlord's invitation, and this page is reached from there with that link kept in
 * `redirectTo`, so after confirming their email they land back on the invitation.
 */
function Signup() {
  const params = useSearchParams();
  const raw = params.get("redirectTo") || "/";
  const redirectTo = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  const joining = redirectTo.startsWith("/join/");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [confirmUrl, setConfirmUrl] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // No role is sent: what you can do follows from the property you create or the invitation you accept.
      const r = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || b.message || "Sign-up failed");
      setSent(b.email || email.trim().toLowerCase());
      if (b.confirmUrl) setConfirmUrl(b.confirmUrl);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setResent(false);
    try {
      const res = await fetch("/api/auth/resend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: sent }) });
      const b = await res.json().catch(() => ({}));
      if (b?.confirmUrl) setConfirmUrl(b.confirmUrl);
    } catch {}
    setResent(true);
  }

  if (sent) {
    return (
      <AuthFrame title={<>Confirm your <em>email</em>.</>} lede="One step left before you can sign in.">
        <div className="card p-5" data-testid="signup-sent">
          <MailCheck className="mb-2 size-6 text-ok" />
          <div className="text-[15px] font-semibold">We sent a link to {sent}</div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
            Click it to confirm the address, then sign in. Until it is confirmed the account cannot be used — that is how RentalMove knows the address belongs to you.
          </p>
          {confirmUrl && (
            <div className="mt-3 rounded-lg border border-primary/20 bg-primary/[.05] p-3 text-[12.5px]" data-testid="signup-direct-confirm-banner">
              <span className="font-semibold text-primary">Direct confirmation link:</span>
              <p className="mt-0.5 text-ink-2">Since Supabase email delivery is rate-limited, you can confirm directly with this verified link:</p>
              <a href={confirmUrl} className="btn-primary mt-2 inline-flex h-9 items-center px-4 text-[12px]" data-testid="direct-confirm-btn">
                Confirm email now &rarr;
              </a>
            </div>
          )}
          <p className="mt-2 text-[12.5px] text-ink-3">Nothing in your inbox? Check spam, then ask for another link.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={joining ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : "/login"} className="btn-primary h-10" data-testid="signup-to-login">Go to sign in</Link>
            <button onClick={resend} className="btn-outline h-10" data-testid="signup-resend">{resent ? "Link sent again" : "Send the link again"}</button>
          </div>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title={joining ? <>Accept your <em>invitation</em>.</> : <>Manage a <em>property</em>.</>}
      lede={joining ? "Create your account, confirm your email, and you are back at the invitation." : "This creates an owner account for the home you manage. Tenants do not sign up here."}
    >
      <form onSubmit={submit} className="space-y-3">
        <label className="block"><span className="eyebrow">Name</span><input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className="input mt-1 h-10" placeholder="Your name" autoComplete="name" data-testid="signup-name" /></label>
        <label className="block"><span className="eyebrow">Email</span><input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input mt-1 h-10" placeholder="you@example.com" data-testid="signup-email" /></label>
        <label className="block"><span className="eyebrow">Password</span><input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input mt-1 h-10" placeholder="At least 8 characters" data-testid="signup-password" /></label>
        {error && <p className="rounded-lg bg-danger/[.07] px-3 py-2 text-[12.5px] text-danger" data-testid="signup-error">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary h-10 w-full" data-testid="signup-submit">{busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />} Create account</button>
        <p className="text-[11.5px] leading-relaxed text-ink-3" data-testid="signup-roles-note">
          You are not asked whether you are an owner or a tenant. Add a property and you manage it; open your landlord&apos;s invitation and you join as their tenant. We confirm your email address, but RentalMove does not check who owns the building.
        </p>
      </form>

      {!joining && (
        <div className="mt-5 rounded-xl border border-dashed border-line p-4 text-[12.5px]" data-testid="signup-tenant-note">
          <div className="flex items-center gap-1.5 font-semibold"><KeyRound className="size-3.5" /> Are you a tenant?</div>
          <p className="mt-1 text-ink-3">Do not sign up here. Your landlord sends you an invitation link — open it and it adds you to their property. Recording a home on your own, with no landlord account, is the <Link href="/kit" className="underline">free move-in kit</Link>.</p>
        </div>
      )}

      <p className="mt-6 text-center text-[13px] text-ink-3">Already have an account? <Link href={joining ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : "/login"} className="font-medium text-ink underline-offset-4 hover:underline">Sign in</Link></p>
      {!joining && <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[12px] text-ink-3"><Building2 className="size-3.5" /> One account manages up to 3 properties.</p>}
    </AuthFrame>
  );
}
