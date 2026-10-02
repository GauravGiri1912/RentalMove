"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BadgeCheck, Ban, CheckCircle2, CircleAlert, CircleDashed, Download, Fingerprint, Loader2, Lock, Printer, Undo2 } from "lucide-react";
import { api, useStudio } from "@/components/providers";
import { Empty } from "@/components/ui";
import { getAssets, getInspections, getProperty, getSubmitted } from "@/lib/view";
import { can } from "@/lib/permissions";
import { cn, fmtDate, INSPECTION_LABEL } from "@/lib/utils";

interface Item { key: string; label: string; status: "photographed" | "seen" | "skipped" | "na" | "open"; reason: string | null; check: string | null }
interface Room { id: string; name: string; items: Item[]; photos: { id: string; sha256: string; slot: string | null; uploaded_at: string | null }[] }
interface Data {
  inspection: { id: string; type: keyof typeof INSPECTION_LABEL; captured_at: string };
  rooms: Room[]; hash: string; intact: boolean | null;
  removed: { asset_id: string; room_id: string; sha256: string | null; at: string; by: string | null }[];
  submitted: { at: string; by: string | null; hash: string | null; photos: number; skipped: number; reopen_request: { by: string | null; at: string; note: string } | null } | null;
}
const when = (iso: string) => fmtDate(iso, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const STATUS: Record<Item["status"], string> = { photographed: "Photographed", seen: "Seen in a photo by the vision model", skipped: "Skipped", na: "Not applicable", open: "Not covered" };

export default function SubmissionPage() {
  return <Suspense fallback={null}><Submission /></Suspense>;
}

/** The visit exactly as it was submitted, with the seal taken then and a live check that nothing has changed. */
function Submission() {
  const params = useSearchParams();
  const { user, refresh, toast } = useStudio();
  const prop = getProperty();
  const inspections = getInspections();
  const [visit, setVisit] = useState<string>(params.get("visit") ?? [...inspections].reverse().find((i) => getSubmitted(i.id))?.id ?? inspections[inspections.length - 1]?.id ?? "");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);
  const submittedNow = visit ? getSubmitted(visit) : null; // changes when the visit is reopened or resubmitted

  const load = useCallback(async () => {
    if (!visit) return;
    setError(null);
    try { setData(await api<Data>(`/api/inspections/${visit}/submission`)); } catch (e: any) { setError(e?.message || "Could not load this submission."); }
  }, [visit]);
  useEffect(() => { setData(null); void load(); }, [load, submittedNow?.at, submittedNow?.hash]);

  const act = async (json: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      await api(`/api/inspections/${visit}/coverage`, { method: "POST", json });
      await refresh(); await load(); setAsking(false); setNote("");
      toast({ title: done, tone: "ok" });
    } catch (e: any) { toast({ title: "Could not do that", detail: e?.message, tone: "danger" }); } finally { setBusy(false); }
  };

  if (!inspections.length) return <Empty icon={<Fingerprint className="size-5" />} title="No visits yet" body="Submit a visit from the Capture page and it appears here." action={<Link href="/capture" className="btn-primary">Start capture</Link>} />;

  const sub = data?.submitted ?? null;
  const assets = getAssets();
  const manifest = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify({
      property: prop.address_label, visit: data.inspection, submitted: sub, record_sha256: data.hash,
      how_to_verify: "record_sha256 = SHA-256 of JSON.stringify({v:1,visit,rooms:[{id,name,photos:[[sha256,slot]...sorted],skips:[[key,status,reason]...sorted]}...sorted by id}]). Photo hashes are SHA-256 of the original files; check a file on the Verify page.",
      rooms: data.rooms,
    }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `submission-${data.inspection.id}.json`; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="mx-auto max-w-4xl print:max-w-none">
      <div className="no-print mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-2">{prop.address_label}</div>
          <h1 className="h-display text-[40px] md:text-[52px]">What was <em>submitted</em></h1>
        </div>
        <select value={visit} onChange={(e) => setVisit(e.target.value)} className="input h-9 w-auto" aria-label="Visit">
          {inspections.map((i) => <option key={i.id} value={i.id}>{INSPECTION_LABEL[i.type]} · {fmtDate(i.captured_at, { day: "numeric", month: "short", year: "numeric" })}{getSubmitted(i.id) ? " · submitted" : ""}</option>)}
        </select>
      </div>

      {error && <p className="card p-4 text-[13px] text-danger">{error}</p>}
      {!data && !error && <div className="grid place-items-center p-16"><Loader2 className="size-6 animate-spin text-ink-3" /></div>}

      {data && (
        <>
          <p className="mb-3 hidden text-[13px] print:block">{prop.address_label} · {INSPECTION_LABEL[data.inspection.type]} · {fmtDate(data.inspection.captured_at)}</p>
          <section className={cn("rounded-2xl border p-4", !sub ? "border-warn/40 bg-warn/[.05]" : data.intact === false ? "border-danger/40 bg-danger/[.05]" : "border-ok/40 bg-ok/[.05]")} data-testid="submission-seal">
            {sub ? (
              <>
                <div className="flex items-center gap-2 text-[14px] font-semibold" data-testid="submission-state">
                  {data.intact === false ? <CircleAlert className="size-5 text-danger" /> : <BadgeCheck className="size-5 text-ok" />}
                  {data.intact === false ? "This visit has changed since it was submitted" : data.intact ? "Matches what was submitted" : "Submitted (made before sealing existed, so there is nothing to compare)"}
                </div>
                <p className="mt-1 text-[13px] text-ink-2" data-testid="submission-meta">Submitted{sub.by ? ` by ${sub.by}` : ""} · {when(sub.at)}{sub.hash ? ` · ${sub.photos} photos · ${sub.skipped} items skipped or not applicable` : ""}</p>
                {sub.hash && (
                  <div className="mt-2 space-y-1 break-all font-mono text-[11px]">
                    <div className="rounded-lg bg-surface-2/70 px-3 py-2"><span className="text-ink-3">sealed at submission </span><span data-testid="sealed-hash">{sub.hash}</span></div>
                    {data.intact === false && <div className="rounded-lg bg-surface-2/70 px-3 py-2"><span className="text-ink-3">now </span>{data.hash}</div>}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 text-[14px] font-semibold"><CircleDashed className="size-5 text-warn" /> Not submitted yet. What follows is the visit as it stands now.</div>
            )}
          </section>

          <div className="no-print mt-3 flex flex-wrap gap-2">
            <button className="btn-outline h-10" onClick={() => window.print()}><Printer className="size-4" /> Print / save as PDF</button>
            <button className="btn-outline h-10" onClick={manifest} data-testid="download-manifest"><Download className="size-4" /> Download record (JSON)</button>
            {!sub && <Link href="/capture" className="btn-outline h-10">Back to Capture</Link>}
            {sub && !can(user, "finding:triage") && !sub.reopen_request && <button className="btn-outline h-10" onClick={() => setAsking(!asking)} data-testid="ask-reopen"><Undo2 className="size-4" /> Ask the owner to reopen</button>}
            {sub && can(user, "finding:triage") && <button className="btn-outline h-10" disabled={busy} onClick={() => act({ action: "reopen" }, "Visit reopened; it needs submitting again")} data-testid="reopen"><Undo2 className="size-4" /> Reopen this visit</button>}
          </div>
          {asking && (
            <div className="no-print mt-3 flex flex-wrap gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="What needs to change?" aria-label="Reason" className="input h-10 min-w-[200px] flex-1" data-testid="reopen-note" />
              <button className="btn-primary h-10" disabled={busy || note.trim().length < 3} onClick={() => act({ action: "request_reopen", note }, "Request sent to the owner")} data-testid="reopen-send">Send request</button>
            </div>
          )}
          {sub?.reopen_request && (
            <p className="mt-3 rounded-xl border border-info/30 bg-info/[.05] p-3 text-[13px]" data-testid="reopen-request">
              <Lock className="mr-1 inline size-3.5" /> {sub.reopen_request.by ?? "Someone"} asked for this visit to be reopened ({when(sub.reopen_request.at)}): &ldquo;{sub.reopen_request.note}&rdquo;
            </p>
          )}

          <p className="mt-5 text-[12px] leading-relaxed text-ink-3">
            The fingerprint covers each photo&apos;s original-file SHA-256 and the item it was filed under, plus every skip and its reason. The vision model&apos;s reading is shown but not sealed, so re-analysing a photo cannot change it. Times come from this server&apos;s clock; this is not an independent third-party timestamp.
          </p>

          {data.removed.length > 0 && (
            <div className="mt-3 rounded-xl border border-line p-3 text-[12px] text-ink-2" data-testid="removed-note">
              <div className="font-medium">{data.removed.length} photo{data.removed.length === 1 ? " was" : "s were"} removed while this visit was a draft</div>
              <ul className="mt-1 space-y-0.5 text-ink-3">
                {data.removed.map((r) => <li key={r.asset_id}>{r.by ?? "Someone"} · {when(r.at)} · fingerprint <span className="font-mono">{r.sha256 ? r.sha256.slice(0, 10) + "…" : "unknown"}</span></li>)}
              </ul>
              <p className="mt-1 text-ink-3">Only the record of the removal is kept, not the image.</p>
            </div>
          )}

          {data.rooms.map((room) => (
            <section key={room.id} className="mt-6 break-inside-avoid-page" data-testid={`sub-room-${room.id}`}>
              <h2 className="h-display text-[26px]">{room.name} <span className="font-mono text-[12px] text-ink-3">{room.photos.length} photo{room.photos.length === 1 ? "" : "s"}</span></h2>
              <ul className="mt-2 space-y-1.5">
                {room.items.map((i) => (
                  <li key={i.key} className="flex items-start gap-2 text-[12.5px]" data-testid={`sub-item-${i.key}`}>
                    {i.status === "photographed" || i.status === "seen" ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ok" /> : i.status === "open" ? <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-warn" /> : <Ban className="mt-0.5 size-3.5 shrink-0 text-ink-3" />}
                    <span><span className="font-medium">{i.label}</span> <span className="text-ink-3">{STATUS[i.status]}{i.reason && i.status === "skipped" ? `: ${i.reason}` : ""}</span>{i.check && <span className="block text-warn">{i.check}</span>}</span>
                  </li>
                ))}
              </ul>
              {room.photos.length > 0 && (
                <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {room.photos.map((p) => {
                    const a = assets.find((x) => x.id === p.id);
                    return (
                      <li key={p.id} className="break-inside-avoid text-[11px] text-ink-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {a ? <img src={a.thumb} alt="" className="aspect-[4/3] w-full rounded-lg bg-surface-2 object-cover" loading="lazy" /> : <div className="aspect-[4/3] rounded-lg bg-surface-2" />}
                        <div className="mt-1 text-[11.5px] text-ink-2">{p.slot ? room.items.find((i) => i.key === p.slot)?.label ?? p.slot : "Other"}</div>
                        <div className="flex items-center gap-1 font-mono"><Fingerprint className="size-3" />{p.sha256.slice(0, 10)}…</div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
