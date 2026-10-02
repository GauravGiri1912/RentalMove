"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, FileText, Pencil, X, ZoomIn, ZoomOut, PartyPopper, History, HelpCircle, ScanLine, CameraOff, Plus } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { certaintyFor, photoAbstain } from "@/lib/insights";
import { useStudio } from "@/components/providers";
import { Parties } from "@/components/parties";
import { FindingFacts, PhotoTimeChip, RepairPanel } from "@/components/insights";
import { Loader2 } from "lucide-react";
import { CATEGORY_META, CategoryBadge, Confidence, Crop, Kbd, Photo, Segmented, StatusBadge } from "@/components/ui";
import { getProperty, getRoom, reportPair } from "@/lib/view";
import { cn, fmtDate, INSPECTION_LABEL } from "@/lib/utils";
import type { IssueCategory, Observation } from "@/lib/view-types";
import { reviewUrl, named } from "@/lib/cloudinary-urls";

type Tab = "active" | "history";

export default function ReviewPage() {
  return (
    <Suspense fallback={null}>
      <Review />
    </Suspense>
  );
}

function Review() {
  const { review, toast, version, injectFindings, view, observations, createManualFinding, user } = useStudio();
  const { can } = usePermissions();
  const canTriage = can("finding:triage");
  const canEdit = can("finding:edit");
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>("active");
  const { baseline: baseInsp, current: curInsp } = reportPair();
  const prop = getProperty();
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    if (!curInsp) return;
    fetch(`/api/inspections/${curInsp.id}/findings?propertyId=${prop.id}&limit=1000`)
      .then(r => r.json())
      .then(d => {
        const mappedAssets = (d.assets || []).map((a: any) => ({
          ...a,
          src: reviewUrl(a.cloudinary_public_id || a.secure_url),
          thumb: named(a.cloudinary_public_id || a.secure_url, "rm_thumb"),
        }));
        injectFindings(mappedAssets, d.observations || []);
        setLoading(false);
      });
  }, [curInsp?.id, prop.id, injectFindings]); // Removed version to prevent fetch loop

  const assets = view?.assets || [];

  const all = useMemo(() => {
    const currentIds = new Set(assets.filter((a) => a.inspection_id === curInsp?.id).map((a) => a.id));
    return observations.filter((o) => currentIds.has(o.asset_id));
  }, [observations, curInsp?.id, assets]);

  const { activeQueue, historyQueue } = useMemo(() => {
    const stances = view?.stances || {};
    const isOwner = user.role === "owner";
    const active: Observation[] = [];
    const history: Observation[] = [];

    for (const o of all) {
      if (isOwner) {
        if (o.review_status === "pending") active.push(o);
        else history.push(o);
      } else {
        if ((o.review_status === "accepted" || o.review_status === "edited") && !o.pre_existing) {
          if (stances[o.id]?.tenant) history.push(o);
          else active.push(o);
        }
      }
    }

    active.sort((a, b) => Number(certaintyFor(a).unsure) - Number(certaintyFor(b).unsure) || Number(!!a.pre_existing) - Number(!!b.pre_existing) || a.id.localeCompare(b.id));
    history.sort((a, b) => (b.reviewed_at ?? "").localeCompare(a.reviewed_at ?? "") || a.id.localeCompare(b.id));

    return { activeQueue: active, historyQueue: history };
  }, [all, user.role, view?.stances]);

  const queue = tab === "active" ? activeQueue : historyQueue;
  
  const [selId, setSelId] = useState<string | null>(params.get("o"));
  // Auto-select first item when queue loads
  useEffect(() => {
    if (!selId && queue.length > 0) {
      setSelId(queue[0]?.id);
    }
  }, [queue, selId]);
  const [editing, setEditing] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [draft, setDraft] = useState<{ category: IssueCategory; description: string; note: string }>({ category: "other", description: "", note: "" });

  const sel = all.find((o) => o.id === selId) ?? queue[0];
  const decided = all.filter((o) => o.review_status !== "pending").length;

  useEffect(() => {
    if (sel) setDraft({ category: sel.category, description: sel.description, note: sel.reviewer_note ?? "" });
    setEditing(false);
  }, [sel?.id, sel?.category, sel?.description, sel?.reviewer_note]);

  const nextPending = useCallback(
    (after: string) => {
      const idx = queue.findIndex((o) => o.id === after);
      const rest = [...queue.slice(idx + 1), ...queue.slice(0, idx)];
      return rest.find((o) => o.review_status === "pending" && o.id !== after)?.id;
    },
    [queue]
  );

  const decide = useCallback(
    (status: "accepted" | "rejected" | "edited") => {
      if (!sel) return;
      if (status === "edited" && !canEdit) return;
      if ((status === "accepted" || status === "rejected") && !canTriage) return;
      const prev: Observation = { ...sel };
      const patch = status === "edited" ? { category: draft.category, description: draft.description, reviewer_note: draft.note || undefined } : { reviewer_note: draft.note || undefined };
      
      // review() handles optimistic update to StudioProvider globally
      review(sel.id, status, patch).catch(() => {});
      toast({
        title: status === "accepted" ? "Accepted" : status === "rejected" ? "Rejected — kept out of the report" : "Saved with your edits",
        detail: `metadata.review_status=${status} → Cloudinary`,
        tone: status === "accepted" ? "ok" : "neutral",
        undo: () => { 
          review(prev.id, prev.review_status, prev); 
          setSelId(prev.id); 
        },
      });
      setEditing(false);
      const n = nextPending(sel.id);
      if (n) setSelId(n);
    },
    [sel, draft, review, toast, nextPending, canTriage, canEdit]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") {
        if (e.key === "Escape") setEditing(false);
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && editing && canEdit) decide("edited");
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const idx = queue.findIndex((o) => o.id === sel?.id);
      const k = e.key.toLowerCase();
      if (k === "a") {
        if (canTriage) decide("accepted");
      } else if (k === "r") {
        if (canTriage) decide("rejected");
      } else if (k === "e") {
        if (canEdit) {
          e.preventDefault();
          setEditing(true);
        }
      } else if (k === "z") {
        setZoom((z) => !z);
      } else if (k === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelId(queue[Math.min(idx + 1, queue.length - 1)]?.id);
      } else if (k === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelId(queue[Math.max(idx - 1, 0)]?.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [queue, sel, decide, editing, canTriage, canEdit]);

  if (loading) {
    return <div className="p-8 text-center"><Loader2 className="mx-auto size-6 animate-spin text-ink-3" /></div>;
  }
  
  const asset = sel ? assets.find(a => a.id === sel.asset_id) : undefined;
  const room = asset ? getRoom(asset.room_id) : undefined;
  const baseline = baseInsp && room ? assets.find((a) => a.room_id === room.id && a.inspection_id === baseInsp.id) : undefined;
  const siblings = asset ? observations.filter((o) => o.asset_id === asset.id) : [];
  const done = decided === all.length;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
        <div>
          <div className="eyebrow mb-2">{curInsp ? `${INSPECTION_LABEL[curInsp.type]} · ${fmtDate(curInsp.captured_at)}` : canTriage ? "Review" : "Findings"}</div>
          <h1 className="h-display text-[44px]">{canTriage ? "Review" : "Findings"}</h1>
        </div>
        <div className="w-full max-w-sm">
          <div className="mb-1.5 flex justify-between text-[12px]"><span className="text-ink-3">{canTriage ? "Decided" : "Owner reviewed"}</span><span className="font-mono">{decided} / {all.length}</span></div>
          <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
            {all.map((o) => (
              <span key={o.id} className={cn("flex-1 transition-colors duration-500", o.review_status === "accepted" ? "bg-ok" : o.review_status === "rejected" ? "bg-ink-3" : o.review_status === "edited" ? "bg-info" : "bg-line")} />
            ))}
          </div>
        </div>
      </div>

      {done && (
        <div className="card mb-5 flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center animate-fade-up">
          <span className="grid size-10 place-items-center rounded-xl bg-ok/10 text-ok"><PartyPopper className="size-5" /></span>
          <div className="flex-1">
            <div className="text-[15px] font-semibold">{canTriage ? "Every finding has a human decision." : "All findings have an owner decision."}</div>
            <div className="text-[13px] text-ink-3">{canTriage ? "Only accepted and edited findings go into the evidence report." : "Review the final evidence report and positions."}</div>
          </div>
          <Link href="/report" className="btn-primary"><FileText className="size-4" /> {canTriage ? "Build the report" : "View evidence report"}</Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr] 2xl:grid-cols-[280px_1fr_340px]">
        {/* Queue */}
        <aside data-tour="rv-queue" className="card flex max-h-[calc(100vh-220px)] flex-col overflow-hidden lg:sticky lg:top-20">
          <div className="border-b border-line p-2">
            <Segmented
              size="sm"
              value={tab}
              onChange={setTab as (v: string) => void}
              options={
                user.role === "owner"
                  ? [
                      { value: "active", label: `Needs review · ${activeQueue.length}` },
                      { value: "history", label: `Reviewed history · ${historyQueue.length}` },
                    ]
                  : [
                      { value: "active", label: `Needs your response · ${activeQueue.length}` },
                      { value: "history", label: `Response history · ${historyQueue.length}` },
                    ]
              }
            />
          </div>
          <div className="flex-1 overflow-y-auto p-1.5">
            {queue.map((o) => {
              const a = assets.find(x => x.id === o.asset_id)!;
              return (
                <button key={o.id} onClick={() => setSelId(o.id)} className={cn("flex w-full gap-2.5 rounded-lg p-2 text-left transition", o.id === sel?.id ? "bg-surface-2" : "hover:bg-surface-2/60", o.review_status !== "pending" && "opacity-60")}>
                  <Crop src={a.thumb} bbox={o.bbox} imgW={a.width} imgH={a.height} className="w-11 shrink-0 rounded-md" outline={false} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-medium">{CATEGORY_META[o.category].label}</span>
                      {!o.pre_existing && o.review_status === "pending" && !certaintyFor(o).unsure && <span className="size-1.5 shrink-0 rounded-full bg-signal" />}
                      {certaintyFor(o).unsure && <HelpCircle className="size-3 shrink-0 text-warn" aria-label="Not sure" />}
                    </div>
                    <div className="truncate text-[11.5px] text-ink-3">{getRoom(a.room_id).name} · {o.sub_area}</div>
                  </div>
                  {o.review_status !== "pending" && (
                    <span className={cn("mt-1 grid size-4 shrink-0 place-items-center rounded-full", o.review_status === "rejected" ? "bg-ink-3" : o.review_status === "edited" ? "bg-info" : "bg-ok")}>
                      {o.review_status === "rejected" ? <X className="size-2.5 text-white" strokeWidth={3} /> : <Check className="size-2.5 text-white" strokeWidth={3} />}
                    </span>
                  )}
                </button>
              );
            })}
            {queue.length === 0 && <p className="p-4 text-center text-[12px] text-ink-3">You're all caught up in this tab.</p>}
          </div>
          <div className="flex items-center justify-center gap-1.5 border-t border-line p-2 text-[11px] text-ink-3">
            <Kbd>J</Kbd><Kbd>K</Kbd> move{canTriage && <> · <Kbd>A</Kbd><Kbd>R</Kbd> decide</>}
          </div>
        </aside>

        {/* Viewer */}
        {sel && asset && room ? (
          <>
            <section className="min-w-0 space-y-3">
            <div className="card p-2" data-tour="rv-photo">
              <div className="relative aspect-[1200/896] overflow-hidden rounded-xl">
              <div
                className="absolute inset-0 transition-transform duration-700 ease-[cubic-bezier(.2,.7,.2,1)]"
                style={zoom ? zoomStyle(sel.bbox) : undefined}
              >
                <Photo src={asset.src} alt={room.name} observations={siblings} activeId={sel.id} onBoxClick={setSelId} showLabels={!zoom} rounded={false} className="h-full" />
              </div>
              <div className="absolute left-3 top-3 flex gap-1.5">
                <span className="rounded-md bg-black/60 px-2 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-white backdrop-blur">{room.name}</span>
                <PhotoTimeChip asset={asset} onDark />
              </div>
              {photoAbstain(asset) && (
                <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-lg bg-black/70 px-3 py-2 text-[12px] text-white backdrop-blur" data-testid="photo-abstain">
                  <CameraOff className="size-4 shrink-0" /> The AI could not judge this photo: {photoAbstain(asset)}. A retake from closer or with better light is suggested.
                </div>
              )}
              <button onClick={() => setZoom((z) => !z)} className="absolute right-3 top-3 inline-flex h-8 items-center gap-1.5 rounded-md bg-black/60 px-2.5 text-[12px] text-white backdrop-blur hover:bg-black/75">
                {zoom ? <ZoomOut className="size-3.5" /> : <ZoomIn className="size-3.5" />} {zoom ? "Fit" : "Zoom"} <span className="font-mono text-white/60">Z</span>
              </button>
            </div>
            {canTriage && (
              <div className="mt-2 flex justify-end">
                <button 
                  onClick={async () => {
                    const o = await createManualFinding(asset.id);
                    setSelId(o.id);
                    // Open edit mode directly for new finding
                    setEditing(true); 
                  }} 
                  className="btn-secondary text-[11.5px]"
                >
                  <Plus className="size-3.5" /> Add manual finding
                </button>
              </div>
            )}
          </div>

          {baseline && baseInsp && curInsp && (
            <div className="card p-4">
              <div className="mb-3 flex items-center gap-2">
                <History className="size-4 text-ink-3" />
                <span className="text-[13px] font-semibold">Was it there at move-in?</span>
                <span className="ml-auto text-[12px] text-ink-3">Same region, both captures</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <figure>
                  <Crop src={baseline.src} bbox={sel.bbox} imgW={baseline.width} imgH={baseline.height} aspect={4 / 3} className="rounded-lg" />
                  <figcaption className="mt-1.5 text-[11.5px] text-ink-3">{INSPECTION_LABEL[baseInsp.type]} · {fmtDate(baseInsp.captured_at, { month: "short", year: "numeric" })}</figcaption>
                </figure>
                <figure>
                  <Crop src={asset.src} bbox={sel.bbox} imgW={asset.width} imgH={asset.height} aspect={4 / 3} className="rounded-lg" />
                  <figcaption className="mt-1.5 text-[11.5px] text-ink-3">{INSPECTION_LABEL[curInsp.type]} · {fmtDate(curInsp.captured_at, { month: "short", year: "numeric" })}</figcaption>
                </figure>
              </div>
              <p className="mt-2 text-[11px] text-ink-3">Same coordinates in both photos — framing can differ slightly between visits.</p>
            </div>
          )}
        </section>

        {/* Decision */}
        <aside className="card h-fit p-4 lg:col-start-2 2xl:sticky 2xl:top-20 2xl:col-start-3">
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <CategoryBadge c={editing ? draft.category : sel.category} />
            <StatusBadge s={sel.review_status} />
            {sel.pre_existing ? <span className="chip">Matches move-in</span> : <span className="chip border-signal/30 text-signal">New since move-in</span>}
          </div>

          {editing ? (
            <div className="space-y-3 animate-fade-up">
              <label className="block">
                <span className="eyebrow">Category</span>
                <select className="input mt-1" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as IssueCategory })}>
                  {(Object.keys(CATEGORY_META) as IssueCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="eyebrow">Description</span>
                <textarea autoFocus rows={3} className="input mt-1 h-auto py-2 leading-relaxed" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </label>
            </div>
          ) : (
            <p className="text-[15px] leading-relaxed">{sel.description}</p>
          )}

          {sel.review_status === "pending" && user.role === "owner" ? (
            <>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[12px]">
                <div><dt className="text-ink-3">Location</dt><dd className="mt-0.5 font-medium">{sel.sub_area}</dd></div>
                <div><dt className="text-ink-3">Confidence</dt><dd className="mt-1"><Confidence value={sel.confidence} /></dd></div>
                <div><dt className="text-ink-3">Source</dt><dd className="mt-0.5 font-medium">{sel.source === "ai" ? "Vision model" : "Reviewer"}</dd></div>
                <div><dt className="text-ink-3">Model</dt><dd className="mt-0.5 font-mono text-[11px]">qwen3.8-27b</dd></div>
              </dl>
              {(() => {
                const c = certaintyFor(sel);
                if (c.pixel_only) return (
                  <p className="mt-3 flex gap-2 rounded-lg bg-info/[.07] p-2.5 text-[12px] leading-relaxed text-ink-2" data-testid="pixel-only-note">
                    <ScanLine className="mt-0.5 size-3.5 shrink-0 text-info" />
                    <span><span className="font-semibold">Undescribed change.</span> The pixels changed here since move-in, but the vision model did not describe it. The location is reliable; use Edit to say what it is.</span>
                  </p>
                );
                if (!c.unsure) return null;
                return (
                  <div className="mt-3 rounded-lg bg-warn/[.08] p-2.5 text-[12px] leading-relaxed" data-testid="unsure-note">
                    <div className="flex items-center gap-1.5 font-semibold text-warn"><HelpCircle className="size-3.5" /> Not sure — check before accepting</div>
                    <ul className="mt-1 list-disc pl-5 text-ink-2">{c.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                    <p className="mt-1 text-ink-3">The AI flags these instead of presenting them as findings. It may be lighting, texture or something that was already there.</p>
                  </div>
                );
              })()}

              <label className="mt-4 block border-t border-line pt-4">
                <span className="eyebrow">Reviewer note</span>
                <input className="input mt-1" placeholder="Optional — visible in the report" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
              </label>

              <div className="mt-4 grid grid-cols-3 gap-2" data-tour="rv-decide">
                {editing ? (
                  <>
                    <button className="btn-outline col-span-1" onClick={() => setEditing(false)}>Cancel</button>
                    <button className="btn-primary col-span-2" onClick={() => decide("edited")}><Check className="size-4" /> Save edit <span className="font-mono text-[10.5px] opacity-60">⌘↵</span></button>
                  </>
                ) : (
                  <>
                    <button className="btn h-11 flex-col gap-0 border border-ok/30 bg-ok/[.08] text-ok hover:bg-ok/15" onClick={() => decide("accepted")}><Check className="size-4" /><span className="text-[11px]">Accept <span className="font-mono opacity-60">A</span></span></button>
                    <button className="btn h-11 flex-col gap-0 border border-line bg-surface text-ink-2 hover:bg-surface-2" onClick={() => decide("rejected")}><X className="size-4" /><span className="text-[11px]">Reject <span className="font-mono opacity-60">R</span></span></button>
                    <button className="btn h-11 flex-col gap-0 border border-info/30 bg-info/[.08] text-info hover:bg-info/15" onClick={() => setEditing(true)}><Pencil className="size-4" /><span className="text-[11px]">Edit <span className="font-mono opacity-60">E</span></span></button>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="mt-4 space-y-3 border-t border-line pt-4">
                <div className="rounded-xl border border-line bg-surface-2/40 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="eyebrow">Owner decision</span>
                    {sel.reviewed_at && <span className="text-[10px] text-ink-3 uppercase tracking-wider">{fmtDate(sel.reviewed_at, { hour: "numeric", minute: "numeric" })}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge s={sel.review_status} />
                    <span className="text-[12px] text-ink-2 font-medium">
                      {sel.review_status === "pending"
                        ? "Awaiting owner review"
                        : sel.review_status === "accepted"
                        ? "Accepted for evidence report"
                        : sel.review_status === "edited"
                        ? "Edited & accepted for report"
                        : "Excluded from evidence report"}
                    </span>
                  </div>
                </div>
                {sel.reviewer_note && (
                  <div className="rounded-xl border border-line bg-surface-2/25 p-3 text-[12px]">
                    <span className="eyebrow block mb-1">Owner reviewer note</span>
                    <p className="text-ink-2 leading-relaxed">{sel.reviewer_note}</p>
                  </div>
                )}
              </div>
              
              <Parties obsId={sel.id} />
              
              <div className="mt-5 border-t border-line pt-4">
                <span className="eyebrow block mb-3">Evidence Details</span>
                <dl className="grid grid-cols-2 gap-3 text-[12px]">
                  <div><dt className="text-ink-3">Location</dt><dd className="mt-0.5 font-medium">{sel.sub_area}</dd></div>
                  <div><dt className="text-ink-3">Confidence</dt><dd className="mt-1"><Confidence value={sel.confidence} /></dd></div>
                  <div><dt className="text-ink-3">Source</dt><dd className="mt-0.5 font-medium">{sel.source === "ai" ? "Vision model" : "Reviewer"}</dd></div>
                  <div><dt className="text-ink-3">Model</dt><dd className="mt-0.5 font-mono text-[11px]">qwen3.8-27b</dd></div>
                </dl>
              </div>
            </>
          )}

          <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">The system describes what it sees. It never decides who is responsible — that is always a person&apos;s call.</p>
          <FindingFacts obs={sel} />
          {sel.review_status !== "rejected" && <RepairPanel obs={sel} />}
        </aside>
          </>
        ) : (
          <div className="col-span-1 lg:col-span-2 2xl:col-span-2 flex h-[400px] flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface/50 p-8 text-center">
            <Check className="mb-4 size-10 text-ok opacity-80" />
            <h2 className="text-[18px] font-medium">You're all caught up!</h2>
            <p className="mt-2 max-w-sm text-[14px] text-ink-3">
              There are no findings that require your attention in this tab.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function zoomStyle([x1, y1, x2, y2]: [number, number, number, number]): React.CSSProperties {
  const s = Math.min(3.5, 0.5 / Math.max(x2 - x1, y2 - y1));
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  const tx = Math.min(Math.max(0.5 - cx * s, 1 - s), 0), ty = Math.min(Math.max(0.5 - cy * s, 1 - s), 0);
  return { transform: `translate(${tx * 100}%, ${ty * 100}%) scale(${s})`, transformOrigin: "0 0" };
}
