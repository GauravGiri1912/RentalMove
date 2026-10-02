"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2, Mail, Send, Trash2, UserPlus } from "lucide-react";
import { api, useStudio } from "./providers";
import { getProperty } from "@/lib/view";
import { OWNERSHIP_NOTE } from "@/lib/roles-copy";
import { cn, fmtDate } from "@/lib/utils";

interface Invite { id: string; email: string | null; status: "pending" | "accepted" | "revoked" | "expired"; created_at: string; expires_at: string; accepted_by: string | null; accepted_at: string | null; path: string | null }

const STATUS_TEXT: Record<Invite["status"], string> = { pending: "Waiting", accepted: "Joined", revoked: "Cancelled", expired: "Expired" };

/** Owner-only: invite a tenant to this property. The tenant's role comes from this invitation, never from what they claim. */
export function TenantInvites() {
  const { toast } = useStudio();
  const prop = getProperty();
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setInvites((await api<{ invites: Invite[] }>(`/api/properties/${prop.id}/invites`)).invites); } catch { setInvites([]); }
  }, [prop.id]);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      await api(`/api/properties/${prop.id}/invites`, { method: "POST", json: email.trim() ? { email: email.trim() } : {} });
      setEmail(""); await load();
    } catch (e: any) { toast({ title: "Could not create the invitation", detail: e?.message, tone: "danger" }); } finally { setBusy(false); }
  };
  const revoke = async (id: string) => {
    try { await api(`/api/properties/${prop.id}/invites/${id}`, { method: "DELETE" }); await load(); } catch (e: any) { toast({ title: "Could not cancel it", detail: e?.message, tone: "danger" }); }
  };
  const full = (path: string) => `${window.location.origin}${path}`;
  const copy = async (id: string, path: string) => { try { await navigator.clipboard.writeText(full(path)); setCopied(id); setTimeout(() => setCopied(null), 1800); } catch {} };
  const message = (path: string) => `I have set up ${prop.address_label} on RentalMove. Join as the tenant here: ${full(path)}`;
  const joined = (invites ?? []).filter((i) => i.status === "accepted");

  return (
    <section className="card p-5" data-testid="tenant-invites">
      <div className="flex items-center gap-2 text-[14px] font-semibold"><UserPlus className="size-4" /> {joined.length ? "Your tenant" : "Invite your tenant"}</div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">A tenant can only join through a link you send. Each link works once, for 14 days. They get the tenant role on this property only: they can add photos and agree or dispute findings, and you decide what goes into the report.</p>

      {joined.map((i) => <div key={i.id} className="mt-3 rounded-lg bg-ok/[.06] px-3 py-2 text-[13px]" data-testid="tenant-joined"><span className="font-medium">{i.accepted_by}</span> joined on {fmtDate(i.accepted_at!)}</div>)}

      <div className="mt-3 flex flex-wrap gap-2">
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Tenant's email (optional)" aria-label="Tenant email" className="input h-10 min-w-[220px] flex-1" data-testid="invite-email" />
        <button className="btn-primary h-10" onClick={create} disabled={busy} data-testid="invite-create">{busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />} Create invitation link</button>
      </div>

      {(invites ?? []).filter((i) => i.status !== "accepted").length > 0 && (
        <ul className="mt-3 space-y-2" data-testid="invite-list">
          {(invites ?? []).filter((i) => i.status !== "accepted").map((i) => (
            <li key={i.id} className="rounded-lg border border-line p-2.5 text-[12.5px]" data-testid={`invite-${i.status}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("chip", i.status === "pending" ? "border-signal/30 text-signal" : "text-ink-3")}>{STATUS_TEXT[i.status]}</span>
                <span className="text-ink-3">{i.email ? `for ${i.email} · ` : ""}created {fmtDate(i.created_at)}{i.status === "pending" ? ` · expires ${fmtDate(i.expires_at)}` : ""}</span>
                {i.status === "pending" && <button onClick={() => revoke(i.id)} className="ml-auto inline-flex items-center gap-1 text-danger hover:underline" data-testid="invite-revoke"><Trash2 className="size-3.5" /> Cancel</button>}
              </div>
              {i.path && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <input readOnly value={full(i.path)} onFocus={(e) => e.currentTarget.select()} aria-label="Invitation link" className="input h-9 min-w-[200px] flex-1 font-mono text-[11px]" data-testid="invite-link" />
                  <button className="btn-outline h-9" onClick={() => copy(i.id, i.path!)}>{copied === i.id ? <><Check className="size-4" /> Copied</> : <><Copy className="size-4" /> Copy</>}</button>
                  <a className="btn-outline h-9" href={`https://wa.me/?text=${encodeURIComponent(message(i.path))}`} target="_blank" rel="noreferrer"><Send className="size-4" /> WhatsApp</a>
                  <a className="btn-outline h-9" href={`mailto:${i.email ?? ""}?subject=${encodeURIComponent(`Join ${prop.address_label} on RentalMove`)}&body=${encodeURIComponent(message(i.path))}`}><Mail className="size-4" /> Email</a>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3" data-testid="ownership-note">{OWNERSHIP_NOTE}</p>
    </section>
  );
}
