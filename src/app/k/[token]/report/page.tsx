"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, BadgeCheck, CameraOff, Check, CircleAlert, Copy, Fingerprint, Loader2, Mail, Printer, Lock, Send, ShieldCheck, Trash2 } from "lucide-react";
import { cn, fmtDate, shortHash } from "@/lib/utils";

interface Photo {
  shot_id: string; label: string; status: "done" | "skipped" | "missing";
  url?: string; sha256?: string | null; uploaded_at?: string; verified?: boolean; camera?: string | null; faces?: number;
  taken?: { level: "ok" | "warn" | "none"; label: string; detail: string };
}
interface Report {
  name: string; address: string; created_at: string; scope: "w" | "r";
  sealed: { hash: string; at: string; photos: number; missing: number } | null; intact: boolean | null; read_token: string | null; sharing: boolean;
  rooms: { id: string; name: string; photos: Photo[] }[];
  counts: { photos: number; missing: number };
  acks: { name: string; at: string; hash: string }[];
}
const when = (iso: string) => fmtDate(iso, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** The sealed move-in record. Same page for the tenant (with sending tools) and for whoever receives the read-only link. */
export default function KitReport() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [r, setR] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [readTok, setReadTok] = useState<string | null>(null);
  const [who, setWho] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    fetch(`/api/kit/${token}/report`, { cache: "no-store" }).then(async (res) => {
      const b = await res.json();
      if (!res.ok) setError(b.error || "This link is not valid.");
      else { setR(b); setReadTok(b.read_token); setSharing(!!b.sharing); }
    }).catch(() => setError("Could not reach the server."));
  }, [token]);

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center">
        <div><AlertTriangle className="mx-auto mb-3 size-8 text-warn" /><h1 className="h-display text-[34px]">Record not available</h1><p className="mt-2 max-w-sm text-[14px] text-ink-2">{error}{/private|replaced/.test(error) ? "" : " If the tenant deleted this record, it no longer exists."}</p></div>
      </main>
    );
  }
  if (!r) return <main className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin text-ink-3" /></main>;

  const mine = r.scope === "w";
  const home = r.address || `${r.name}'s home`;
  const shareUrl = typeof window !== "undefined" && readTok ? `${window.location.origin}/k/${readTok}/report` : "";
  const message = `Here is the move-in condition record for ${home}, sealed ${r.sealed ? when(r.sealed.at) : "(not sealed yet)"}: ${shareUrl}`;
  const copy = async () => { try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {} };

  async function confirmSeen() {
    setBusy(true); setNote(null);
    const res = await fetch(`/api/kit/${token}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: who }) });
    const b = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) setR((cur) => (cur ? { ...cur, acks: b.acks } : cur)); else setNote(b.error || "Could not save your confirmation.");
  }

  async function toggleShare(on: boolean) {
    if (!on && !window.confirm("Stop sharing? Every link you sent will stop working and nobody but you can open this record.")) return;
    setBusy(true); setNote(null);
    const res = await fetch(`/api/kit/${token}/share`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on }) });
    const b = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { setSharing(!!b.sharing); setReadTok(b.read_token ?? null); } else setNote(b.error || "Could not change sharing.");
  }

  async function newLink() {
    if (!window.confirm("Make a new share link? Every link you sent before will stop working, so you will need to send the new one.")) return;
    setBusy(true); setNote(null);
    const res = await fetch(`/api/kit/${token}/relink`, { method: "POST" });
    const b = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { setReadTok(b.read_token); setNote("New link ready. The old links no longer work."); } else setNote(b.error || "Could not make a new link.");
  }

  async function remove() {
    if (!window.confirm("Delete this kit, all its photos and the sealed record? This cannot be undone, and links you sent will stop working.")) return;
    setDeleting(true);
    const res = await fetch(`/api/kit/${token}`, { method: "DELETE" });
    if (res.ok) {
      try { localStorage.setItem("rm:kits", JSON.stringify((JSON.parse(localStorage.getItem("rm:kits") || "[]") as { path: string }[]).filter((k) => !k.path.endsWith(token)))); } catch {}
      router.push("/kit");
    } else { setDeleting(false); window.alert("Could not delete the kit. Please try again."); }
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 print:px-0">
      <div className="no-print mb-6 flex items-center gap-3">
        <Link href="/welcome" className="text-[15px] font-semibold tracking-tight">RentalMove</Link>
        <div className="flex-1" />
        {mine && !r.sealed && <Link href={`/k/${token}`} className="btn-outline">Continue my kit</Link>}
      </div>

      <header>
        <div className="eyebrow">Move-in condition record</div>
        <h1 className="h-display mt-2 text-[40px] sm:text-[52px]">{home}</h1>
        <p className="mt-1 text-[14px] text-ink-2">Recorded by {r.name} · started {when(r.created_at)}</p>
      </header>

      <section className={cn("mt-6 rounded-2xl border p-4", r.sealed ? (r.intact ? "border-ok/40 bg-ok/[.05]" : "border-danger/40 bg-danger/[.05]") : "border-warn/40 bg-warn/[.05]")} data-testid="kit-seal-box">
        {r.sealed ? (
          <>
            <div className="flex items-center gap-2 text-[14px] font-semibold">
              {r.intact ? <BadgeCheck className="size-5 text-ok" /> : <CircleAlert className="size-5 text-danger" />}
              {r.intact ? "Sealed and unchanged" : "This record has changed since it was sealed"}
            </div>
            <p className="mt-1 text-[13px] text-ink-2">Sealed {when(r.sealed.at)} · {r.sealed.photos} photos{r.sealed.missing ? ` · ${r.sealed.missing} items not photographed` : ""}</p>
            <div className="mt-2 break-all rounded-lg bg-surface-2/70 px-3 py-2 font-mono text-[11px]"><span className="text-ink-3">record sha256 </span>{r.sealed.hash}</div>
            <div className="mt-3 border-t border-line pt-3 text-[13px]" data-testid="kit-acks">
              {r.acks.length > 0 ? (
                <ul className="space-y-0.5">{r.acks.map((a) => <li key={a.name} className="flex items-center gap-1.5"><Check className="size-4 text-ok" />Seen by <span className="font-medium">{a.name}</span> <span className="text-ink-3">· {when(a.at)}</span></li>)}</ul>
              ) : <p className="text-ink-3">Not yet confirmed by anyone else.</p>}
              {!mine && r.intact && !r.acks.length && (
                <div className="no-print mt-3">
                  <p className="text-[12.5px] text-ink-2">Confirming means you have looked at this record. It is not agreement with anything in it, and it is saved with the fingerprint above.</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input value={who} onChange={(e) => setWho(e.target.value)} maxLength={60} placeholder="Your name" aria-label="Your name" className="input h-10 max-w-[240px]" data-testid="kit-ack-name" />
                    <button className="btn-signal h-10" disabled={busy || who.trim().length < 2} onClick={confirmSeen} data-testid="kit-ack-btn">{busy ? <Loader2 className="size-4 animate-spin" /> : <BadgeCheck className="size-4" />} Confirm I&apos;ve seen this</button>
                  </div>
                  {note && <p className="mt-2 text-[12.5px] text-danger">{note}</p>}
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="text-[13.5px] text-warn">This record is not sealed yet, so it can still change.</p>
        )}
      </section>

      {mine && !sharing && (
        <section className="no-print mt-4 card p-4" data-testid="kit-private">
          <div className="flex items-center gap-2 text-[13.5px] font-semibold"><Lock className="size-4 text-ok" /> Private: only you can see this record</div>
          <p className="mt-0.5 text-[12.5px] text-ink-3">Nobody has a link to it and the Verify page will not recognise its photos. When you are ready to send it to your landlord, turn sharing on to get a read-only link. You can turn it off again at any time.</p>
          <button className="btn-signal mt-3 h-10" disabled={busy || !r.sealed} onClick={() => toggleShare(true)} data-testid="kit-share-on"><Send className="size-4" /> Share this record</button>
          {!r.sealed && <p className="mt-2 text-[12px] text-warn">Seal your record first (finish your kit), then you can share it.</p>}
          {note && <p className="mt-2 text-[12.5px] text-danger">{note}</p>}
        </section>
      )}
      {mine && sharing && (
        <section className="no-print mt-4 card p-4" data-testid="kit-send">
          <div className="text-[13.5px] font-semibold">Send your record</div>
          <p className="mt-0.5 text-[12.5px] text-ink-3">This link is read-only. Whoever opens it can see the photos but cannot change or delete anything.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="btn-signal h-10" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" data-testid="kit-whatsapp"><Send className="size-4" /> WhatsApp</a>
            <a className="btn-outline h-10" href={`mailto:?subject=${encodeURIComponent(`Move-in condition record — ${home}`)}&body=${encodeURIComponent(message)}`} data-testid="kit-email"><Mail className="size-4" /> Email</a>
            <button className="btn-outline h-10" onClick={copy}>{copied ? <><Check className="size-4" /> Copied</> : <><Copy className="size-4" /> Copy link</>}</button>
            <button className="btn-outline h-10" onClick={() => window.print()}><Printer className="size-4" /> Print / PDF</button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[12.5px]">
            <button onClick={newLink} disabled={busy} className="underline hover:text-ink" data-testid="kit-relink">Made a mistake? Make a new share link</button>
            <button onClick={() => toggleShare(false)} disabled={busy} className="underline hover:text-ink" data-testid="kit-share-off">Stop sharing</button>
            {note && <span className="text-ink-2" data-testid="kit-relink-note">{note}</span>}
          </div>
          <input readOnly value={shareUrl} className="input mt-3 font-mono text-[11.5px]" onFocus={(e) => e.currentTarget.select()} aria-label="Read-only link" data-testid="kit-share-url" />
        </section>
      )}

      <p className="mt-5 text-[12px] leading-relaxed text-ink-3">
        Each photo&apos;s SHA-256 fingerprint was taken on the phone and checked again on the server; the record fingerprint above covers every photo, room and shot. Dates come from this server&apos;s clock and, where the camera wrote one, the photo&apos;s own capture time. This is <span className="font-medium text-ink-2">not</span> an independent third-party timestamp. Faces are pixelated in the images below. Any photo can be checked on the <Link href="/verify" className="underline">Verify</Link> page.
      </p>

      {r.rooms.map((room, ri) => (
        <section key={room.id} className="mt-8 break-inside-avoid-page" data-testid={`report-room-${ri}`}>
          <h2 className="h-display text-[28px]"><span className="mr-2 font-mono text-[12px] text-ink-3">{String(ri + 1).padStart(2, "0")}</span>{room.name}</h2>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {room.photos.map((p) => (
              <li key={p.shot_id} className="break-inside-avoid">
                {p.status === "done" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt={`${room.name}: ${p.label}`} loading="lazy" className="aspect-[4/3] w-full rounded-lg bg-surface-2 object-cover" />
                ) : (
                  <div className="grid aspect-[4/3] place-items-center rounded-lg border border-dashed border-line text-center text-[12px] text-ink-3"><span><CameraOff className="mx-auto mb-1 size-4" />{p.status === "skipped" ? "Skipped" : "Not photographed"}</span></div>
                )}
                <div className="mt-1.5 text-[12.5px] font-medium">{p.label}</div>
                {p.status === "done" && (
                  <div className="mt-0.5 space-y-0.5 text-[11px] leading-snug text-ink-3">
                    <div className={cn(p.taken?.level === "warn" && "text-warn")} title={p.taken?.detail}>{p.taken?.label === "No capture time in file" ? `Uploaded ${when(p.uploaded_at!)}` : p.taken?.label}</div>
                    <div className="flex items-center gap-1 font-mono"><Fingerprint className="size-3" />{p.sha256 ? shortHash(p.sha256, 10) : "—"}{p.verified && <span className="inline-flex items-center gap-0.5 font-sans text-ok" title="Fingerprint matched on the phone and on the server"><ShieldCheck className="size-3" />verified</span>}</div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <footer className="mt-10 border-t border-line pt-4 text-[12px] text-ink-3">
        {r.counts.photos} photos{r.counts.missing ? ` · ${r.counts.missing} items not photographed` : ""}. This record describes what the photos show; it makes no finding about cause, responsibility or cost.
        {mine && (
          <div className="no-print mt-4 flex flex-wrap items-center gap-3">
            <Link href="/kit" className="underline">Start another kit</Link>
            <button onClick={remove} disabled={deleting} className="inline-flex items-center gap-1 text-danger hover:underline" data-testid="kit-delete">{deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Delete my kit and photos</button>
          </div>
        )}
      </footer>
    </main>
  );
}
