"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, KeyRound } from "lucide-react";
import { AuthFrame } from "@/components/auth-frame";
import { TENANT_NOTE } from "@/lib/roles-copy";

interface Preview { valid: boolean; reason?: string | null; property?: string; invited_by?: string | null; email_restricted?: boolean }

/** Where a tenant lands from an owner's invitation link. Works signed out (shows what it is) and signed in (accepts it). */
export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const [pv, setPv] = useState<Preview | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [me, setMe] = useState<{ name: string; role: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/invites/${token}`, { cache: "no-store" }).then(async (r) => setPv(await r.json())).catch(() => setPv({ valid: false, reason: "Could not reach the server." }));
    fetch("/api/auth/session", { cache: "no-store" }).then(async (r) => { const b = await r.json(); setSignedIn(!!b.authenticated); setMe(b.user ?? null); }).catch(() => setSignedIn(false));
  }, [token]);

  async function accept() {
    setBusy(true); setError(null);
    const r = await fetch(`/api/invites/${token}/accept`, { method: "POST" });
    const b = await r.json().catch(() => ({}));
    if (r.ok) { setDone(true); setTimeout(() => { window.location.href = "/"; }, 1200); } else { setError(b.error || "Could not accept the invitation."); setBusy(false); }
  }

  const here = `/join/${token}`;
  return (
    <AuthFrame title={<>You are <em>invited</em>.</>} lede="A landlord has asked you to document a home with them on RentalMove.">
      {!pv || signedIn === null ? (
        <div className="grid place-items-center p-8"><Loader2 className="size-5 animate-spin text-ink-3" /></div>
      ) : !pv.valid ? (
        <div className="card p-5" data-testid="join-invalid">
          <AlertTriangle className="mb-2 size-5 text-warn" />
          <div className="text-[15px] font-semibold">This invitation cannot be used</div>
          <p className="mt-1 text-[13px] text-ink-2">{pv.reason ?? "It is not valid."} Ask the person who sent it for a new link.</p>
          <Link href="/welcome" className="btn-ghost mt-3">Home</Link>
        </div>
      ) : done ? (
        <div className="card p-5" data-testid="join-done"><CheckCircle2 className="mb-2 size-5 text-ok" /><div className="text-[15px] font-semibold">You have joined {pv.property}</div><p className="mt-1 text-[13px] text-ink-3">Taking you there…</p></div>
      ) : (
        <div className="card p-5" data-testid="join-valid">
          <div className="flex items-center gap-2 text-[12px] text-ink-3"><KeyRound className="size-4" /> Tenant invitation</div>
          <div className="mt-1 text-[22px] font-semibold leading-snug">{pv.property}</div>
          {pv.invited_by && <p className="mt-0.5 text-[13px] text-ink-2">Invited by {pv.invited_by}</p>}
          <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">{TENANT_NOTE}</p>
          {pv.email_restricted && <p className="mt-2 text-[12px] text-ink-3">This invitation was sent to one email address: sign in with that address to accept it.</p>}
          {error && <p className="mt-3 rounded-lg bg-danger/[.07] px-3 py-2 text-[12.5px] text-danger" data-testid="join-error">{error}</p>}
          {signedIn ? (
            <div className="mt-4">
              <p className="mb-2 text-[12.5px] text-ink-2">Signed in as <span className="font-medium">{me?.name}</span>.</p>
              <button className="btn-primary h-10 w-full" onClick={accept} disabled={busy} data-testid="join-accept">{busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Join as tenant</button>
            </div>
          ) : (
            <div className="mt-4 grid gap-2">
              <Link href={`/signup?redirectTo=${encodeURIComponent(here)}`} className="btn-primary h-10" data-testid="join-signup">Create an account to join</Link>
              <Link href={`/login?redirectTo=${encodeURIComponent(here)}`} className="btn-outline h-10" data-testid="join-login">I already have an account</Link>
            </div>
          )}
        </div>
      )}
    </AuthFrame>
  );
}
