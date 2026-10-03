"use client";

import { useState } from "react";
import { AlertTriangle, BadgeCheck, CircleHelp, Copy, Link2, Loader2, MessageSquareWarning, Search, Send, ShieldQuestion, Trash2 } from "lucide-react";
import { api, useStudio } from "@/components/providers";
import { PageHeader, Photo } from "@/components/ui";
import { getAsset, getInspection, getProperty, observationsFor } from "@/lib/view";
import { EXAMPLES, REPLY_DISCLAIMER, draftReply, money, type ClaimItem, type ClaimResult, type Verdict } from "@/lib/claim";
import { cn, fmtDate, INSPECTION_LABEL } from "@/lib/utils";

const TONE: Record<Verdict, { box: string; text: string; label: string }> = {
  already_there: { box: "border-ok/40 bg-ok/[.06]", text: "text-ok", label: "Already there" },
  worse: { box: "border-warn/40 bg-warn/[.06]", text: "text-warn", label: "Partly there" },
  new: { box: "border-warn/40 bg-warn/[.06]", text: "text-warn", label: "Not at move-in" },
  not_found: { box: "border-line bg-surface-2/60", text: "text-ink-2", label: "Not found" },
  no_baseline: { box: "border-danger/30 bg-danger/[.05]", text: "text-danger", label: "No move-in photo" },
  no_current: { box: "border-line bg-surface-2/60", text: "text-ink-2", label: "No move-out photo" },
  unclear: { box: "border-line bg-surface-2/60", text: "text-ink-2", label: "Unclear" },
};

/** The tenant pastes what the landlord wrote; RentalMove looks the claim up in the record and drafts a reply. */
export default function ClaimPage() {
  const { user, toast } = useStudio();
  const prop = getProperty();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [landlord, setLandlord] = useState("");
  const [reply, setReply] = useState("");
  const [edited, setEdited] = useState(false);
  const [link, setLink] = useState<{ url: string; token: string } | null>(null);
  const [linking, setLinking] = useState(false);

  const draft = (r: ClaimResult, name: string) => draftReply(r, { tenantName: user.name, landlordName: name.trim() || undefined, verifyUrl: `${window.location.origin}/verify` });

  const check = async (text = message) => {
    setBusy(true); setError(null); setLink(null); setEdited(false);
    try {
      const { result: r } = await api<{ result: ClaimResult }>("/api/claim", { method: "POST", json: { property_id: prop.id, message: text } });
      setResult(r);
      setReply(draft(r, landlord));
    } catch (e: any) {
      setResult(null);
      setError(e?.message || "Could not check the claim.");
    } finally { setBusy(false); }
  };

  const rename = (name: string) => {
    setLandlord(name);
    if (result && !edited) setReply(draft(result, name));
  };

  const addLink = async () => {
    setLinking(true);
    try {
      const r = await api<{ share_url: string; token: string }>("/api/share", { method: "POST", json: { property_id: prop.id, expires_in_days: 14, recipient: landlord.trim() || "Landlord" } });
      setLink({ url: r.share_url, token: r.token });
      setReply((cur) => `${cur.trimEnd()}\n\nThe sealed, read-only record (valid for 14 days, faces pixelated): ${r.share_url}`);
      setEdited(true);
    } catch (e: any) {
      toast({ title: "Could not create the link", detail: e?.message, tone: "danger" });
    } finally { setLinking(false); }
  };

  const cancelLink = async () => {
    if (!link) return;
    try { await api(`/api/share/${link.token}`, { method: "DELETE" }); } catch {}
    setReply((cur) => cur.replace(/\n*The sealed, read-only record[^\n]*$/, "").trimEnd());
    setLink(null);
    toast({ title: "Link cancelled", detail: "It no longer opens the record.", tone: "ok" });
  };

  const copy = async () => { try { await navigator.clipboard.writeText(reply); toast({ title: "Reply copied", tone: "ok" }); } catch {} };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow={`${prop.address_label} · Landlord claim`}
        title={<>Your landlord says you <em>broke</em> it?</>}
        lede="Paste what they wrote. RentalMove finds that part of the home in your move-in and move-out photos, shows whether it was already there, and drafts a polite reply you can edit."
      />

      {user.role === "owner" && <p className="mb-4 rounded-xl border border-line bg-surface-2/60 p-3 text-[12.5px] text-ink-2">This tool is written for a tenant answering a landlord&apos;s claim. As the owner you can still try it to see what a tenant would see.</p>}

      <section className="card p-4" data-testid="claim-input">
        <label className="eyebrow" htmlFor="claim-text">The landlord&apos;s message</label>
        <textarea
          id="claim-text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={1500}
          rows={4}
          placeholder="e.g. Shower glass is damaged, deducting ₹4,000 from your deposit."
          className="input mt-1.5 w-full resize-y py-2"
          data-testid="claim-text"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button className="btn-primary h-10" onClick={() => check()} disabled={busy || message.trim().length < 3} data-testid="claim-check">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Check the record
          </button>
          <span className="text-[11.5px] text-ink-3">Try:</span>
          {EXAMPLES.map((ex, i) => (
            <button key={i} className="rounded-lg border border-line px-2.5 py-1 text-left text-[11.5px] text-ink-2 hover:border-ink-3" onClick={() => { setMessage(ex); void check(ex); }} data-testid={`claim-example-${i}`}>{ex.length > 46 ? `${ex.slice(0, 44)}…` : ex}</button>
          ))}
        </div>
        <p className="mt-2 text-[11.5px] text-ink-3">The message is not saved. Nothing is sent to anyone until you send the reply yourself.</p>
        {error && <p className="mt-2 rounded-lg bg-danger/[.07] px-3 py-2 text-[12.5px] text-danger" data-testid="claim-error">{error}</p>}
      </section>

      {result && (
        <>
          <section className="mt-5" data-testid="claim-result">
            <div className="flex flex-wrap items-center gap-1.5 text-[12px]" data-testid="claim-understood">
              <span className="eyebrow mr-1">Understood</span>
              {result.claim.rooms.map((r) => <span key={r} className="chip">{r.replace("_", " ")}</span>)}
              {result.claim.concepts.map((c) => <span key={c.key} className="chip">{c.label}</span>)}
              {result.claim.damage.map((d) => <span key={d} className="chip">{d}</span>)}
              {result.claim.amount && <span className="chip border-warn/40 text-warn" data-testid="claim-amount">{money(result.claim.amount)} claimed</span>}
              {!result.understood && <span className="text-ink-3">…not enough to be sure what this is about</span>}
            </div>

            <div className="mt-3 space-y-4">
              {result.items.slice(0, 3).map((it) => <ItemCard key={it.room.id || "none"} item={it} />)}
            </div>
            {result.items.length > 3 && <p className="mt-2 text-[12px] text-ink-3">{result.items.length - 3} more room{result.items.length - 3 === 1 ? "" : "s"} also matched. Mention the room in the message to narrow it down.</p>}
          </section>

          <section className="card mt-5 p-4" data-testid="claim-reply">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[14px] font-semibold">A reply you can send</div>
              <input value={landlord} onChange={(e) => rename(e.target.value)} placeholder="Landlord's name (optional)" aria-label="Landlord's name" className="input h-9 w-56 text-[12.5px]" data-testid="claim-landlord" />
            </div>
            <textarea value={reply} onChange={(e) => { setReply(e.target.value); setEdited(true); }} rows={11} className="input mt-2 w-full resize-y py-2 text-[13px] leading-relaxed" aria-label="Reply" data-testid="claim-reply-text" />
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="btn-outline h-9" onClick={copy} data-testid="claim-copy"><Copy className="size-4" /> Copy</button>
              <a className="btn-outline h-9" href={`https://wa.me/?text=${encodeURIComponent(reply)}`} target="_blank" rel="noreferrer"><Send className="size-4" /> WhatsApp</a>
              {!link ? (
                <button className="btn-signal h-9" onClick={addLink} disabled={linking} data-testid="claim-add-link">{linking ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />} Add a link to the sealed record</button>
              ) : (
                <button className="btn-outline h-9 text-danger" onClick={cancelLink} data-testid="claim-cancel-link"><Trash2 className="size-4" /> Cancel the link</button>
              )}
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3" data-testid="claim-disclaimer">{REPLY_DISCLAIMER}</p>
          </section>

          <section className="mt-5 rounded-xl border border-dashed border-line p-4 text-[12px] leading-relaxed text-ink-3" data-testid="claim-limits">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-ink-2"><ShieldQuestion className="size-3.5" /> What this cannot tell you</div>
            <ul className="list-disc space-y-0.5 pl-4">
              <li>It reads the message with word lists, not a lawyer. Unusual wording can be missed, and it says so when it is unsure.</li>
              <li>It compares what was recorded. A mark the photos do not show may still exist; a mark it matched may be a different mark. Look at the two photos yourself.</li>
              <li>It does not decide who is responsible or what is fair. A person does, and a tenancy agreement or local rules may matter.</li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function ItemCard({ item }: { item: ClaimItem }) {
  const tone = TONE[item.verdict];
  const Icon = item.verdict === "already_there" ? BadgeCheck : item.verdict === "unclear" || item.verdict === "not_found" ? CircleHelp : item.verdict === "no_baseline" ? AlertTriangle : MessageSquareWarning;
  const then = item.then ? getAsset(item.then.asset_id) : undefined;
  const now = item.now ? getAsset(item.now.asset_id) : undefined;
  const thenIds = new Set(item.thenMatched.map((m) => m.id)), nowIds = new Set(item.nowMatched.map((m) => m.id));
  const inspLabel = (id?: string) => { const i = id ? getInspection(id) : undefined; return i ? `${INSPECTION_LABEL[i.type]} · ${fmtDate(i.captured_at)}` : ""; };

  return (
    <article className={cn("rounded-2xl border p-4", tone.box)} data-testid="claim-item" data-verdict={item.verdict}>
      <div className="flex items-start gap-2.5">
        <Icon className={cn("mt-0.5 size-5 shrink-0", tone.text)} />
        <div className="min-w-0 flex-1">
          <div className={cn("text-[11px] font-semibold uppercase tracking-wider", tone.text)} data-testid="claim-verdict">{tone.label}{item.room.id ? ` · ${item.room.name}` : ""}</div>
          <h2 className="mt-0.5 text-[19px] font-semibold leading-snug" data-testid="claim-headline">{item.headline}{item.verdict === "already_there" && item.then ? ` — ${fmtDate(item.then.date, { day: "numeric", month: "short", year: "numeric" })}` : ""}</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{item.detail}</p>
        </div>
      </div>

      {(then || now) && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="claim-photos">
          <figure>
            {then ? <Photo src={then.src} alt={`${item.room.name} at move-in`} observations={observationsFor(then.id).filter((o) => thenIds.has(o.id))} className="aspect-[1200/896]" showLabels={false} /> : <div className="grid aspect-[1200/896] place-items-center rounded-xl border border-dashed border-line text-[12px] text-ink-3">No photo</div>}
            <figcaption className="mt-1.5 text-[11.5px] text-ink-3"><span className="font-semibold text-ink-2">Then</span> · {inspLabel(item.then?.inspection_id)}</figcaption>
          </figure>
          <figure>
            {now ? <Photo src={now.src} alt={`${item.room.name} at move-out`} observations={observationsFor(now.id).filter((o) => nowIds.has(o.id))} className="aspect-[1200/896]" showLabels={false} /> : <div className="grid aspect-[1200/896] place-items-center rounded-xl border border-dashed border-line text-[12px] text-ink-3">No photo</div>}
            <figcaption className="mt-1.5 text-[11.5px] text-ink-3"><span className="font-semibold text-ink-2">Now</span> · {inspLabel(item.now?.inspection_id)}</figcaption>
          </figure>
        </div>
      )}

      {(item.nowMatched.length > 0 || item.thenMatched.length > 0) && (
        <ul className="mt-3 space-y-1.5 text-[12.5px]" data-testid="claim-findings">
          {item.thenMatched.map((m) => <li key={`t-${m.id}`}><span className="chip mr-1.5">At move-in</span>{m.description}</li>)}
          {item.nowMatched.map((m) => (
            <li key={`n-${m.id}`}>
              <span className={cn("chip mr-1.5", m.pre_existing ? "border-ok/40 text-ok" : "border-warn/40 text-warn")}>{m.pre_existing ? "Matches move-in" : "New since move-in"}</span>
              {m.trend === "grew" && <span className="chip mr-1.5 border-warn/40 text-warn">larger now</span>}
              {m.description}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
