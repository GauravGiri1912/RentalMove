"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { AuthFrame } from "@/components/auth-frame";

export default function SignupPage() {
  return <Suspense fallback={null}><Signup /></Suspense>;
}

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // No role is sent: what you can do depends on the property you create or are invited to, never on a label you pick here.
      const r = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || b.message || "Sign-up failed");
      const { error: err } = await getSupabaseBrowserClient().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (err) throw new Error(err.message);
      window.location.href = redirectTo;
    } catch (e: any) {
      setError(e?.message || String(e));
      setBusy(false);
    }
  }

  return (
    <AuthFrame title={<>Start a <em>record</em>.</>} lede={joining ? "Create your account to accept the invitation." : "One account for everyone. After signing up you add your property, or open an invitation from your landlord."}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block"><span className="eyebrow">Name</span><input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className="input mt-1 h-10" placeholder="Your name" autoComplete="name" data-testid="signup-name" /></label>
        <label className="block"><span className="eyebrow">Email</span><input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input mt-1 h-10" placeholder="you@example.com" data-testid="signup-email" /></label>
        <label className="block"><span className="eyebrow">Password</span><input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input mt-1 h-10" placeholder="At least 8 characters" data-testid="signup-password" /></label>
        {error && <p className="rounded-lg bg-danger/[.07] px-3 py-2 text-[12.5px] text-danger" data-testid="signup-error">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary h-10 w-full" data-testid="signup-submit">{busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />} Create account</button>
        <p className="text-[11.5px] leading-relaxed text-ink-3" data-testid="signup-roles-note">You are not asked whether you are an owner or a tenant. If you add a property you manage it; if your landlord invites you, you join it as a tenant.</p>
      </form>
      <p className="mt-6 text-center text-[13px] text-ink-3">Already have an account? <Link href={joining ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : "/login"} className="font-medium text-ink underline-offset-4 hover:underline">Sign in</Link></p>
    </AuthFrame>
  );
}
