"use client";

// Finding insights (size, trend, everyday-wear context), the scale-reference tool, the
// repair loop panel, and the per-room photo checklist.

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, Camera, CheckCircle2, CircleDashed, Hammer, Ruler, TrendingUp, X, Info, AlertTriangle, Loader2 } from "lucide-react";
import { api, useStudio } from "@/components/providers";
import { getAsset, getCalibration } from "@/lib/view";
import { reviewUrl } from "@/lib/cloudinary-urls";
import { photoTimeOf, sizeOf, trendLabel, trendOf, wearOf, workOrderOf } from "@/lib/insights";
import { fmtArea, fmtLength, REFERENCES } from "@/lib/measure";
import { WEAR_DISCLAIMER } from "@/lib/wear";
import type { CoverageResult } from "@/lib/coverage";
import type { Asset, Observation, WorkOrder } from "@/lib/view-types";
import { cn, fmtDate } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Size · trend · wear
// ---------------------------------------------------------------------------

export function FindingFacts({ obs, compact }: { obs: Observation; compact?: boolean }) {
  const [scaleOpen, setScaleOpen] = useState(false);
  const size = sizeOf(obs);
  const t = trendOf(obs);
  const wear = wearOf(obs);
  const asset = getAsset(obs.asset_id);
  const cal = asset && getCalibration(asset.id);
  return (
    <div className="mt-4 space-y-3 border-t border-line pt-4" data-testid="finding-facts">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <Ruler className="size-3.5 text-ink-3" />
        {size ? (
          <span data-testid="finding-size">
            <span className="font-semibold">{fmtLength(size.long_cm)}</span> long
            {size.area_cm2 != null && <span className="text-ink-3"> · affected {fmtArea(size.area_cm2)}</span>}
          </span>
        ) : (
          <span className="text-ink-3">No scale on this photo yet</span>
        )}
        {!compact && (
          <button className="ml-auto text-[12px] font-medium text-info hover:underline" onClick={() => setScaleOpen(true)} data-testid="set-scale">
            {cal ? "Change scale" : "Set scale"}
          </button>
        )}
      </div>
      {cal && <p className="-mt-2 text-[11px] text-ink-3">Scale: {refLabel(cal.reference)} = {cal.cm} cm{cal.by ? `, set by ${cal.by}` : ""}. Approximate — valid for things on the same surface.</p>}
      {t && (
        <div className="flex items-center gap-2 text-[12px]" data-testid="finding-trend">
          <TrendingUp className={cn("size-3.5", t.kind === "grew" ? "text-warn" : "text-ink-3")} />
          <span className={cn("chip", t.kind === "grew" && "border-warn/40 text-warn", t.kind === "new" && "border-signal/30 text-signal")}>{trendLabel(t)}</span>
          <span className="text-[11px] text-ink-3">changed pixels at this spot vs move-in</span>
        </div>
      )}
      <div className={cn("rounded-lg p-2.5 text-[12px] leading-relaxed", wear.level === "typical" ? "bg-ok/[.07]" : wear.level === "review" ? "bg-warn/[.08]" : "bg-surface-2")} data-testid="wear-context">
        <div className="mb-0.5 flex items-center gap-1.5 font-semibold">
          {wear.level === "review" ? <AlertTriangle className="size-3.5 text-warn" /> : <Info className="size-3.5 text-ink-3" />}
          {wear.level === "typical" ? "Commonly seen with everyday use" : wear.level === "review" ? "Worth a closer look" : "Everyday-use context"}
        </div>
        <p className="text-ink-2">{wear.text}</p>
        <p className="mt-1 text-[10.5px] text-ink-3">{WEAR_DISCLAIMER}</p>
      </div>
      {scaleOpen && asset && typeof document !== "undefined" && createPortal(<ScaleModal asset={asset} onClose={() => setScaleOpen(false)} />, document.body)}
    </div>
  );
}

const refLabel = (id: string) => REFERENCES.find((r) => r.id === id)?.label ?? id;

// ---------------------------------------------------------------------------
// Scale reference: draw a line across something of known size
// ---------------------------------------------------------------------------

export function ScaleModal({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const { refresh, toast } = useStudio();
  const existing = getCalibration(asset.id);
  const [line, setLine] = useState<[number, number, number, number] | null>(existing?.line ?? null);
  const [ref, setRef] = useState(existing?.reference ?? "switch");
  const [cm, setCm] = useState<string>(String(existing?.cm ?? REFERENCES.find((r) => r.id === "switch")!.cm));
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<[number, number] | null>(null);

  const at = (e: React.PointerEvent): [number, number] => {
    const r = box.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  const save = async (clear = false) => {
    setBusy(true);
    try {
      await api(`/api/assets/${asset.id}/calibration`, { method: "POST", json: clear ? { clear: true } : { line, cm: Number(cm), reference: ref } });
      await refresh();
      toast({ title: clear ? "Scale removed" : "Scale saved", detail: clear ? undefined : "Findings on this photo now show sizes in cm", tone: "ok" });
      onClose();
    } catch (e: any) {
      toast({ title: "Could not save scale", detail: e?.message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const valid = !!line && Number(cm) > 0;
  return (
    <div className="fixed inset-0 z-50 flex overflow-y-auto bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Set scale" data-testid="scale-modal">
      <div className="card m-auto w-full max-w-3xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <Ruler className="size-4" />
          <h2 className="text-[15px] font-semibold">Set a scale for this photo</h2>
          <button className="btn-ghost ml-auto size-8 p-0" onClick={onClose} aria-label="Close"><X className="size-4" /></button>
        </div>
        <p className="mb-3 text-[12.5px] text-ink-3">Drag a line across something whose size you know — a light switch, a tile, a door. Sizes are approximate and only hold for things on the same surface.</p>
        <div
          ref={box}
          className="relative w-full cursor-crosshair touch-none select-none overflow-hidden rounded-lg bg-black"
          style={{ aspectRatio: `${asset.width} / ${asset.height}` }}
          onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); const p = at(e); drag.current = p; setLine([p[0], p[1], p[0], p[1]]); }}
          onPointerMove={(e) => { if (drag.current) { const p = at(e); setLine([drag.current[0], drag.current[1], p[0], p[1]]); } }}
          onPointerUp={() => { drag.current = null; }}
          data-testid="scale-canvas"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset.src} alt="" className="pointer-events-none absolute inset-0 size-full object-fill" draggable={false} />
          {line && (
            <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 1 1" preserveAspectRatio="none">
              <line x1={line[0]} y1={line[1]} x2={line[2]} y2={line[3]} stroke="#facc15" strokeWidth={3} vectorEffect="non-scaling-stroke" />
              <circle cx={line[0]} cy={line[1]} r={0.006} fill="#facc15" />
              <circle cx={line[2]} cy={line[3]} r={0.006} fill="#facc15" />
            </svg>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="eyebrow">The line spans</span>
            <select className="input mt-1" value={ref} onChange={(e) => { setRef(e.target.value); const r = REFERENCES.find((x) => x.id === e.target.value); if (r?.cm) setCm(String(r.cm)); }} data-testid="scale-ref">
              {REFERENCES.map((r) => <option key={r.id} value={r.id}>{r.label}{r.cm ? ` (${r.cm} cm)` : ""}</option>)}
            </select>
          </label>
          <label className="block w-28">
            <span className="eyebrow">Length (cm)</span>
            <input className="input mt-1" inputMode="decimal" value={cm} onChange={(e) => setCm(e.target.value)} data-testid="scale-cm" />
          </label>
          <div className="ml-auto flex gap-2">
            {existing && <button className="btn-outline" disabled={busy} onClick={() => save(true)}>Remove</button>}
            <button className="btn-primary" disabled={!valid || busy} onClick={() => save()} data-testid="scale-save">{busy && <Loader2 className="size-4 animate-spin" />} Save scale</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Repair loop
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<WorkOrder["status"], string> = { open: "Requested", in_progress: "In progress", done: "Repaired" };

export function RepairPanel({ obs }: { obs: Observation }) {
  const { view, refresh, toast } = useStudio();
  const wo = workOrderOf(obs);
  const isOwner = view?.user.role === "owner";
  const [form, setForm] = useState({ assignee: "", note: "", due: "" });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const call = async (label: string, json: unknown) => {
    setBusy(label);
    try {
      const r = await api(`/api/observations/${obs.id}/workorder`, { method: "POST", json });
      await refresh();
      return r;
    } catch (e: any) {
      toast({ title: "Work order failed", detail: e?.message, tone: "danger" });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const upload = async (file: File) => {
    setBusy("photo");
    try {
      const sig = await api(`/api/observations/${obs.id}/workorder`, { method: "POST", json: { action: "sign" } });
      const up = await uploadSigned(file, sig, setProgress);
      const r = await api(`/api/observations/${obs.id}/workorder`, { method: "POST", json: { action: "photo", public_id: up.public_id } });
      await refresh();
      const v = r?.check?.verdict;
      toast({
        title: "Repair photo added",
        detail: v === "reduced" ? "The change is no longer detected at this spot." : v === "unchanged" ? "The change is still detected at this spot." : "Could not verify from this photo — take it from the same spot as the original.",
        tone: v === "reduced" ? "ok" : "neutral",
      });
    } catch (e: any) {
      toast({ title: "Upload failed", detail: e?.message, tone: "danger" });
    } finally {
      setBusy(null);
      setProgress(0);
    }
  };

  return (
    <div className="mt-4 border-t border-line pt-4" data-testid="repair-panel">
      <div className="mb-2 flex items-center gap-2">
        <Hammer className="size-4 text-ink-3" />
        <span className="text-[13px] font-semibold">Repair</span>
        {wo && <span className={cn("chip ml-auto", wo.status === "done" ? "border-ok/40 text-ok" : wo.status === "in_progress" ? "border-info/40 text-info" : "")} data-testid="repair-status">{STATUS_LABEL[wo.status]}</span>}
      </div>

      {!wo && !open && (
        isOwner ? (
          <button className="btn-outline w-full" onClick={() => setOpen(true)} data-testid="repair-request"><Hammer className="size-4" /> Request a repair</button>
        ) : (
          <p className="text-[12px] text-ink-3">No repair requested for this finding.</p>
        )
      )}

      {!wo && open && (
        <div className="space-y-2 animate-fade-up">
          <input className="input" placeholder="Who will fix it (e.g. contractor name)" value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} data-testid="repair-assignee" />
          <input className="input" placeholder="Note (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <label className="flex items-center gap-2 text-[12px] text-ink-3">Due <input type="date" className="input h-9 flex-1" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} /></label>
          <div className="flex gap-2">
            <button className="btn-outline flex-1" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary flex-1" disabled={!!busy} onClick={async () => { if (await call("create", { action: "create", assignee: form.assignee, note: form.note, due: form.due || null })) setOpen(false); }} data-testid="repair-create">
              {busy === "create" && <Loader2 className="size-4 animate-spin" />} Create work order
            </button>
          </div>
        </div>
      )}

      {wo && (
        <div className="space-y-3">
          <div className="text-[12px] text-ink-2">
            {wo.assignee && <div>Assigned to <span className="font-medium">{wo.assignee}</span>{wo.due && <> · due {fmtDate(wo.due)}</>}</div>}
            {wo.note && <div className="text-ink-3">{wo.note}</div>}
          </div>

          {wo.photo && <RepairEvidence obs={obs} wo={wo} />}

          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} data-testid="repair-file" />
            <button className="btn-outline flex-1" disabled={!!busy} onClick={() => fileRef.current?.click()}>
              {busy === "photo" ? <><Loader2 className="size-4 animate-spin" /> {progress ? `${progress}%` : "Checking…"}</> : <><Camera className="size-4" /> {wo.photo ? "Replace repair photo" : "Add repair photo"}</>}
            </button>
            {isOwner && wo.status !== "done" && (
              <button className="btn-primary flex-1" disabled={!!busy} onClick={() => call("status", { action: "status", status: wo.status === "open" ? "in_progress" : "done" })} data-testid="repair-advance">
                {wo.status === "open" ? "Mark started" : "Mark repaired"}
              </button>
            )}
            {isOwner && wo.status === "done" && (
              <button className="btn-outline flex-1" disabled={!!busy} onClick={() => call("status", { action: "status", status: "open" })}>Re-open</button>
            )}
          </div>
          <p className="text-[11px] text-ink-3">Take the repair photo from the same spot as the original so it can be checked against it.</p>

          <ol className="space-y-1 border-l border-line pl-3 text-[11.5px] text-ink-3">
            {[...wo.history].reverse().map((h, i) => (
              <li key={i}><span className="text-ink-2">{h.text}</span>{h.by ? ` · ${h.by}` : ""} · {fmtDate(h.at, { day: "numeric", month: "short" })}</li>
            ))}
          </ol>
          {isOwner && <button className="text-[11.5px] text-ink-3 hover:text-danger" onClick={() => call("cancel", { action: "cancel" })}>Cancel work order</button>}
        </div>
      )}
    </div>
  );
}

/** Before (finding photo) / after (repair photo) crops with the pixel-check verdict. */
export function RepairEvidence({ obs, wo }: { obs: Observation; wo: WorkOrder }) {
  const a = getAsset(obs.asset_id);
  const c = wo.photo?.check;
  const after = reviewUrl(wo.photo!.public_id);
  return (
    <div data-testid="repair-evidence">
      <div className="grid grid-cols-2 gap-2">
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.thumb} alt="Before repair" className="aspect-[4/3] w-full rounded-md object-cover" />
          <figcaption className="mt-1 text-[11px] text-ink-3">Finding</figcaption>
        </figure>
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={after} alt="After repair" className="aspect-[4/3] w-full rounded-md object-cover" />
          <figcaption className="mt-1 text-[11px] text-ink-3">Repair photo · {fmtDate(wo.photo!.at, { day: "numeric", month: "short" })}</figcaption>
        </figure>
      </div>
      {c && (
        <p className={cn("mt-2 flex items-start gap-1.5 rounded-md p-2 text-[12px]", c.verdict === "reduced" ? "bg-ok/[.08] text-ok" : c.verdict === "unchanged" ? "bg-warn/[.08] text-warn" : "bg-surface-2 text-ink-3")} data-testid="repair-verdict">
          {c.verdict === "reduced" ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" /> : <CircleDashed className="mt-0.5 size-3.5 shrink-0" />}
          {c.verdict === "reduced" ? "Same view as the finding photo, and the change is no longer detected at this spot." :
           c.verdict === "unchanged" ? "Same view, but the change is still detected at this spot." :
           c.same_view ? "The change was too small to verify from photos — check in person." : "This photo does not show the same view as the finding, so it could not be checked."}
        </p>
      )}
      {wo.photo!.sha256 && <p className="mt-1 font-mono text-[10.5px] text-ink-3">sha256 {wo.photo!.sha256.slice(0, 16)}…</p>}
    </div>
  );
}

function uploadSigned(file: Blob, sig: any, onProgress: (p: number) => void): Promise<any> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("api_key", sig.apiKey);
    form.append("timestamp", String(sig.timestamp));
    form.append("signature", sig.signature);
    form.append("folder", sig.folder);
    form.append("tags", sig.tags);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new Error(body?.error?.message || `Cloudinary upload failed (${xhr.status})`));
      } catch { reject(new Error(`Cloudinary upload failed (${xhr.status})`)); }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(form);
  });
}

// ---------------------------------------------------------------------------
// Room coverage checklist
// ---------------------------------------------------------------------------

export function CoverageList({ result, title = "Photo checklist" }: { result: CoverageResult; title?: string }) {
  const gaps = result.items.filter((i) => !i.covered);
  return (
    <div data-testid="coverage">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[13px] font-semibold">{title}</span>
        <span className={cn("chip ml-auto", gaps.some((g) => !g.resolved) ? "border-warn/40 text-warn" : "border-ok/40 text-ok")}>{result.covered}/{result.total} covered{result.skipped ? ` · ${result.skipped} explained` : ""}</span>
      </div>
      <ul className="space-y-1.5">
        {result.items.map((i) => (
          <li key={i.label} className="flex items-start gap-2 text-[12px]">
            {i.covered ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ok" /> : <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-warn" />}
            <span>
              <span className={cn(i.covered ? "text-ink-2" : "font-medium")}>{i.label}</span>
              {!i.covered && !i.resolved && <span className="text-ink-3"> — not in any photo yet. {i.why}</span>}
              {!i.covered && i.resolved && <span className="text-ink-3"> — {i.resolved.kind === "na" ? "not applicable" : `skipped: ${i.resolved.reason}`}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Photo time (EXIF capture time vs the visit)
// ---------------------------------------------------------------------------

export function PhotoTimeChip({ asset, onDark }: { asset: Asset; onDark?: boolean }) {
  const c = photoTimeOf(asset);
  if (!c) return null;
  return (
    <span
      title={c.detail}
      data-testid="photo-time"
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10.5px]",
        onDark ? "bg-black/60 text-white backdrop-blur" : "border border-line",
        c.level === "warn" && (onDark ? "bg-warn/90 text-white" : "border-warn/40 text-warn"),
      )}
    >
      <Clock className="size-3" /> {c.label}
    </span>
  );
}
