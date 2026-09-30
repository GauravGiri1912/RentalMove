"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { AuthFrame } from "@/components/auth-frame";
import { Segmented } from "@/components/ui";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"tenant" | "owner">("tenant");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password, role }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || b.message || "Sign-up failed");
      const { error: err } = await getSupabaseBrowserClient().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (err) throw new Error(err.message);
      window.location.href = "/";
    } catch (e: any) {
      setError(e?.message || String(e));
      setBusy(false);
    }
  }

  return (
    <AuthFrame title={<>Start a <em>record</em>.</>} lede="Tenants document their home; owners manage properties.">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <span className="eyebrow">I am a</span>
          <div className="mt-1"><Segmented value={role} onChange={setRole} options={[{ value: "tenant", label: "Tenant" }, { value: "owner", label: "Owner" }]} /></div>
        </div>
        <label className="block"><span className="eyebrow">Name</span><input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className="input mt-1 h-10" placeholder="Your name" /></label>
        <label className="block"><span className="eyebrow">Email</span><input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input mt-1 h-10" placeholder="you@example.com" /></label>
        <label className="block"><span className="eyebrow">Password</span><input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input mt-1 h-10" placeholder="At least 8 characters" /></label>
        {error && <p className="rounded-lg bg-danger/[.07] px-3 py-2 text-[12.5px] text-danger">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary h-10 w-full">{busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />} Create account</button>
        {role === "tenant" && <p className="text-[11.5px] text-ink-3">New tenant accounts are linked to the demo property so you can try everything.</p>}
      </form>
      <p className="mt-6 text-center text-[13px] text-ink-3">Already have an account? <Link href="/login" className="font-medium text-ink underline-offset-4 hover:underline">Sign in</Link></p>
    </AuthFrame>
  );
}
