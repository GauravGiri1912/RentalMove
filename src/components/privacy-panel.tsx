"use client";

// "Private items" for one photo: what is hidden in shared copies, where each area came from,
// and tools to scan, draw, remove, and preview the exact copy a recipient will see.

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EyeOff, Loader2, ScanText, SquareDashedMousePointer, Trash2, X, AlertTriangle, Eye } from "lucide-react";
import { api, useStudio } from "@/components/providers";
import { getOcrBudget, getPrivacy, getPrivacyScan, observationsFor } from "@/lib/view";
import { coversFinding, type Box } from "@/lib/privacy";
import { CATEGORY_META_LABEL, cn, fmtDate } from "@/lib/utils";
import type { Asset, PrivacyRegion } from "@/lib/view-types";

const SOURCE: Record<PrivacyRegion["source"], string> = { ocr: "Text · Cloudinary OCR", ai: "AI suggestion", manual: "Added by hand" };

export function PrivacyPanel({ asset }: { asset: Asset }) {
  const { refresh, toast } = useStudio();
  const regions = getPrivacy(asset.id);
  const scan = getPrivacyScan(asset.id);
  const ocr = getOcrBudget();
  const findings = observationsFor(asset.id).filter((o) => o.review_status !== "rejected");
  const [busy, setBusy] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const call = async (label: string, json: unknown) => {
    setBusy(label);
    try {
      const r = await api(`/api/assets/${asset.id}/privacy`, { method: "POST", json });
      await refresh();
      return r;
    } catch (e: any) {
      toast({ title: "Privacy update failed", detail: e?.message, tone: "danger" });
      return null;
    } finally {
      setBusy(null);
    }
  };
  const runScan = async () => {
    const r = await call("scan", { action: "scan" });
    if (r) toast({ title: r.found ? `${r.found} private area${r.found === 1 ? "" : "s"} found` : "Nothing private found", detail: r.engine === "ocr" ? "Cloudinary OCR" : "AI suggestions — check them, and draw anything missed", tone: r.found ? "ok" : "neutral" });
  };
  const openPreview = async () => {
    setBusy("preview");
    try {
      // Exactly what a recipient gets: the signed evidence rendition, private areas applied server-side.
      const r = await api<{ urls: string[] }>("/api/media/sign", { method: "POST", json: { items: [{ asset_id: asset.id, recipe: { kind: "evidence", pixelate: true, boxes: [] } }] } });
      setPreview(r.urls[0]);
    } catch (e: any) {
      toast({ title: "Preview failed", detail: e?.message, tone: "danger" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card p-4" data-testid="privacy-panel">
      <div className="mb-2 flex items-center gap-2">
        <EyeOff className="size-4 text-ink-3" />
        <span className="text-[13px] font-semibold">Private items</span>
        <span className={cn("chip ml-auto", regions.length ? "border-ok/40 text-ok" : "")} data-testid="privacy-count">
          {regions.length ? `${regions.length} hidden in shared copies` : "Nothing hidden"}
        </span>
      </div>
      <p className="mb-3 text-[12px] leading-relaxed text-ink-3">
        Letters, bills, screens and personal photos are pixelated by Cloudinary in every copy that leaves the app — share links, the report, listing photos. The original stays untouched as evidence.
      </p>

      {regions.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {regions.map((r) => {
            const covered = coversFinding(r.bbox as Box, findings.map((f) => ({ id: f.id, bbox: f.bbox as Box })));
            return (
              <li key={r.id} className="rounded-lg border border-line px-2.5 py-1.5 text-[12px]" data-testid="privacy-region">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.label || "personal item"}</span>
                  <span className={cn("rounded px-1.5 py-0.5 text-[10.5px]", r.source === "ai" ? "bg-warn/10 text-warn" : "bg-surface-2 text-ink-3")}>{r.source === "manual" && r.by ? `Added by ${r.by}` : SOURCE[r.source]}</span>
                  <button className="ml-auto text-ink-3 hover:text-danger" aria-label="Stop hiding this area" disabled={!!busy} onClick={() => call("remove", { action: "remove", id: r.id })}><Trash2 className="size-3.5" /></button>
                </div>
                {covered.length > 0 && (
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-warn"><AlertTriangle className="size-3" /> Covers a finding ({covered.map((id) => CATEGORY_META_LABEL[findings.find((f) => f.id === id)!.category]).join(", ")}) — it will be hidden in shared copies too.</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {regions.some((r) => r.source === "ai") && <p className="mb-3 text-[11.5px] text-warn">AI suggestions are approximate — check the preview and draw anything that was missed.</p>}

      <div className="flex flex-wrap gap-2">
        <button className="btn-outline h-8 flex-1 text-[12px]" disabled={!!busy} onClick={runScan} data-testid="privacy-scan">
          {busy === "scan" ? <Loader2 className="size-3.5 animate-spin" /> : <ScanText className="size-3.5" />} Scan for private items
        </button>
        <button className="btn-outline h-8 flex-1 text-[12px]" disabled={!!busy} onClick={() => setDrawing(true)} data-testid="privacy-draw">
          <SquareDashedMousePointer className="size-3.5" /> Hide an area
        </button>
        <button className="btn-outline h-8 flex-1 text-[12px]" disabled={!!busy} onClick={openPreview} data-testid="privacy-preview">
          {busy === "preview" ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />} Preview shared copy
        </button>
      </div>
      <p className="mt-2 text-[10.5px] text-ink-3" data-testid="privacy-engine">
        {ocr.available ? `Scans use Cloudinary OCR · ${ocr.used}/${ocr.cap} this month.` : `Scans use the AI (${ocr.reason ?? "OCR unavailable"}).`}
        {scan ? ` Last scan: ${scan.engine === "ocr" ? "OCR" : "AI"}, ${scan.found} found, ${fmtDate(scan.at, { day: "numeric", month: "short" })}.` : ""}
      </p>

      {drawing && typeof document !== "undefined" && createPortal(<DrawArea asset={asset} regions={regions} onClose={() => setDrawing(false)} onSave={async (bbox, label) => { const ok = await call("add", { action: "add", bbox, label }); if (ok) setDrawing(false); }} busy={busy === "add"} />, document.body)}
      {preview && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onMouseDown={() => setPreview(null)} data-testid="privacy-preview-modal">
          <div className="card m-auto w-full max-w-4xl p-3" onMouseDown={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className="text-[13px] font-semibold">Shared copy — as a recipient sees it</span>
              <button className="btn-ghost ml-auto size-8 p-0" onClick={() => setPreview(null)} aria-label="Close"><X className="size-4" /></button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Shared copy with private areas pixelated" className="w-full rounded-lg" />
            <p className="mt-2 px-1 text-[11.5px] text-ink-3">Rendered by Cloudinary from the original: faces and private areas pixelated. Signed URL — it cannot be edited to remove them.</p>
          </div>
        </div>, document.body)}
    </div>
  );
}

function DrawArea({ asset, regions, onClose, onSave, busy }: { asset: Asset; regions: PrivacyRegion[]; onClose: () => void; onSave: (b: Box, label: string) => void; busy: boolean }) {
  const [box, setBox] = useState<Box | null>(null);
  const [label, setLabel] = useState("personal item");
  const el = useRef<HTMLDivElement>(null);
  const start = useRef<[number, number] | null>(null);
  const at = (e: React.PointerEvent): [number, number] => {
    const r = el.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  return (
    <div className="fixed inset-0 z-50 flex overflow-y-auto bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Hide an area" data-testid="privacy-draw-modal">
      <div className="card m-auto w-full max-w-3xl p-4">
        <div className="mb-2 flex items-center gap-2">
          <EyeOff className="size-4" />
          <h2 className="text-[15px] font-semibold">Hide an area in shared copies</h2>
          <button className="btn-ghost ml-auto size-8 p-0" onClick={onClose} aria-label="Close"><X className="size-4" /></button>
        </div>
        <p className="mb-3 text-[12.5px] text-ink-3">Drag a box over anything private — a letter, a screen, a family photo. Areas already hidden are shaded.</p>
        <div
          ref={el}
          className="relative w-full cursor-crosshair touch-none select-none overflow-hidden rounded-lg bg-black"
          style={{ aspectRatio: `${asset.width} / ${asset.height}` }}
          onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); const p = at(e); start.current = p; setBox([p[0], p[1], p[0], p[1]]); }}
          onPointerMove={(e) => { if (start.current) { const p = at(e), s = start.current; setBox([Math.min(s[0], p[0]), Math.min(s[1], p[1]), Math.max(s[0], p[0]), Math.max(s[1], p[1])]); } }}
          onPointerUp={() => { start.current = null; }}
          data-testid="privacy-canvas"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset.src} alt="" className="pointer-events-none absolute inset-0 size-full object-fill" draggable={false} />
          {regions.map((r) => (
            <div key={r.id} className="pointer-events-none absolute border border-white/70 bg-black/45 backdrop-blur-md" style={{ left: `${r.bbox[0] * 100}%`, top: `${r.bbox[1] * 100}%`, width: `${(r.bbox[2] - r.bbox[0]) * 100}%`, height: `${(r.bbox[3] - r.bbox[1]) * 100}%` }} />
          ))}
          {box && <div className="pointer-events-none absolute border-2 border-dashed border-signal bg-signal/15" style={{ left: `${box[0] * 100}%`, top: `${box[1] * 100}%`, width: `${(box[2] - box[0]) * 100}%`, height: `${(box[3] - box[1]) * 100}%` }} />}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block flex-1">
            <span className="eyebrow">What is it?</span>
            <input className="input mt-1" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} data-testid="privacy-label" />
          </label>
          <button className="btn-primary" disabled={!box || box[2] - box[0] < 0.01 || box[3] - box[1] < 0.01 || busy} onClick={() => box && onSave(box, label.trim() || "personal item")} data-testid="privacy-save">
            {busy && <Loader2 className="size-4 animate-spin" />} Hide this area
          </button>
        </div>
      </div>
    </div>
  );
}
