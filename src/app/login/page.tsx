"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff, KeyRound, Loader2, UserRound, Building2 } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { AuthFrame } from "@/components/auth-frame";

const DEMO_PASSWORD = "DemoPassword123!";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <Login />
    </Suspense>
  );
}

function Login() {
  const params = useSearchParams();
  const redirectTo = params.get("redirectTo") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set when Supabase refuses the sign-in because the address was never confirmed.
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null);
  const [confirmUrl, setConfirmUrl] = useState<string | null>(null);
  const [resent, setResent] = useState<string | null>(null);
  const justConfirmed = params.get("confirmed") === "1";

  async function signIn(e: string, p: string, who: string) {
    setBusy(who);
    setError(null);
    const { error: err } = await getSupabaseBrowserClient().auth.signInWithPassword({ email: e.trim(), password: p });
    if (err) {
      const notConfirmed = /not confirmed/i.test(err.message);
      setUnconfirmed(notConfirmed ? e.trim().toLowerCase() : null);
      setError(notConfirmed ? "This email address has not been confirmed yet. Open the link we emailed you, then sign in." : err.message === "Invalid login credentials" ? "Email or password is incorrect." : err.message);
      setBusy(null);
      return;
    }
    window.location.href = redirectTo.startsWith("/") ? redirectTo : "/";
  }

  return (
    <AuthFrame title={<>Welcome <em>back</em>.</>} lede="Sign in to your property memory.">
      {justConfirmed && (
        <div className="mb-5 rounded-xl border border-ok/40 bg-ok/[.06] px-4 py-2.5 text-[13px]" data-testid="login-confirmed">
          <span className="font-semibold text-ok">Email confirmed.</span> Sign in below.
        </div>
      )}
      <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[
          { who: "tenant", name: "Alex Chen", role: "Tenant", email: "alex.tenant@rentalmove.demo", icon: UserRound },
          { who: "owner", name: "Sarah Jenkins", role: "Owner", email: "sarah.owner@rentalmove.demo", icon: Building2 },
        ].map((d) => (
          <button key={d.who} onClick={() => signIn(d.email, DEMO_PASSWORD, d.who)} disabled={!!busy} className="card flex items-center gap-3 p-3 text-left transition hover:-translate-y-0.5 hover:shadow-lift disabled:opacity-60">
            <span className="grid size-9 place-items-center rounded-lg bg-surface-2"><d.icon className="size-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold">{d.name}</span>
              <span className="block text-[11.5px] text-ink-3">Demo {d.role.toLowerCase()}</span>
            </span>
            {busy === d.who ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4 text-ink-3" />}
          </button>
        ))}
      </div>
      <div className="mb-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-ink-3"><span className="h-px flex-1 bg-line" />or with your account<span className="h-px flex-1 bg-line" /></div>
      {unconfirmed && (
        <div className="mb-4 rounded-xl border border-warn/40 bg-warn/[.06] p-3 text-[12.5px]" data-testid="login-unconfirmed">
          <div className="font-semibold text-warn">Confirm your email first</div>
          <p className="mt-0.5 text-ink-2">We sent a link to {unconfirmed}. Open it, then sign in. Check spam if it is not there.</p>
          {confirmUrl && (
            <div className="mt-2">
              <a href={confirmUrl} className="btn-primary inline-flex h-8 items-center px-3 text-[12px]" data-testid="login-confirm-direct">
                Confirm email now &rarr;
              </a>
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              className="btn-outline h-9 text-[12.5px]"
              data-testid="login-resend"
              onClick={async () => {
                const r = await fetch("/api/auth/resend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: unconfirmed }) });
                const b = await r.json().catch(() => ({}));
                if (b?.confirmUrl) setConfirmUrl(b.confirmUrl);
                setResent(r.ok ? (b.message || "A new link is on its way.") : b.error || "Could not send another link.");
              }}
            >
              Send the link again
            </button>
          </div>
          {resent && <p className="mt-1.5 text-ink-3" data-testid="login-resent">{resent}</p>}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); void signIn(email, password, "form"); }} className="space-y-3">
        <label className="block">
          <span className="eyebrow">Email</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input mt-1 h-10" placeholder="you@example.com" />
        </label>
        <label className="block">
          <span className="eyebrow">Password</span>
          <span className="relative mt-1 block">
            <input type={show ? "text" : "password"} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input h-10 pr-10" placeholder="Your password" />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink" aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
          </span>
        </label>
        {error && <p className="rounded-lg bg-danger/[.07] px-3 py-2 text-[12.5px] text-danger">{error}</p>}
        <button type="submit" disabled={!!busy || !email || !password} className="btn-primary h-10 w-full">{busy === "form" ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Sign in</button>
      </form>
      <p className="mt-6 text-center text-[13px] text-ink-3">New here? <Link href="/signup" className="font-medium text-ink underline-offset-4 hover:underline">Create an account</Link></p>
    </AuthFrame>
  );
}
