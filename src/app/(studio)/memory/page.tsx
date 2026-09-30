"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, ChevronDown, ChevronUp, GitCompareArrows, Plus, X, Fingerprint } from "lucide-react";
import { useStudio } from "@/components/providers";
import { CategoryBadge, Confidence, PageHeader, Photo, StatusBadge } from "@/components/ui";
import { assetFor, getInspections, getRooms } from "@/lib/view";
import { cn, fmtBytes, fmtDate, INSPECTION_LABEL, shortHash } from "@/lib/utils";

export default function MemoryPage() {
  const { observations } = useStudio();
  const rooms = getRooms();
  const inspections = getInspections();
  const [open, setOpen] = useState<{ r: number; i: number } | null>(null);
  const [showBoxes, setShowBoxes] = useState(true);

  return (
    <div>
      <PageHeader
        eyebrow="381 Elmwood Ave · Unit 4B"
        title={<>Property <em>memory</em></>}
        lede="Every room, at every inspection, in one grid. Read across a row to watch a room age; read down a column to see a whole visit."
        actions={
          <>
            <button onClick={() => setShowBoxes((s) => !s)} className="btn-outline">{showBoxes ? "Hide" : "Show"} findings</button>
            <Link href="/capture" className="btn-primary"><Camera className="size-4" /> New capture</Link>
          </>
        }
      />

      <div data-tour="memory-grid" className="card overflow-x-auto p-2">
        <div className="grid min-w-[880px] grid-cols-[180px_repeat(3,1fr)] gap-2">
          <div />
          {inspections.map((insp) => (
            <div key={insp.id} className="px-2 pb-1 pt-2">
              <div className="flex items-center gap-2">
                <span className={cn("size-2 rounded-full", insp.type === "move_out" ? "bg-signal" : insp.type === "move_in" ? "bg-ink" : "bg-ink-3")} />
                <span className="text-[13px] font-semibold">{INSPECTION_LABEL[insp.type]}</span>
                {insp.status === "in_progress" && <span className="chip h-5 border-signal/30 text-[10.5px] text-signal">In progress</span>}
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-ink-3">{fmtDate(insp.captured_at)} · {insp.captured_by}</div>
            </div>
          ))}

          {rooms.map((room, r) => (
            <Row key={room.id}>
              <div className="flex flex-col justify-center px-3">
                <Link href={`/rooms/${room.id}`} className="text-[14px] font-semibold hover:underline">{room.name}</Link>
                <div className="mt-0.5 text-[12px] text-ink-3">{inspections.filter((i) => assetFor(room.id, i.id)).length} of {inspections.length} captured</div>
                <Link href={`/compare?room=${room.id}`} className="mt-2 inline-flex w-fit items-center gap-1 text-[12px] font-medium text-ink-2 hover:text-ink">
                  <GitCompareArrows className="size-3.5" /> Compare
                </Link>
              </div>
              {inspections.map((insp, i) => {
                const a = assetFor(room.id, insp.id);
                if (!a)
                  return (
                    <div key={insp.id} className="grid aspect-[4/3] place-items-center rounded-xl border border-dashed border-line text-center">
                      <div className="text-[12px] text-ink-3">
                        <Plus className="mx-auto mb-1 size-4" />Not captured
                        <div className="text-[11px]">Periodic visits can skip rooms</div>
                      </div>
                    </div>
                  );
                const obs = observations.filter((o) => o.asset_id === a.id);
                const fresh = obs.filter((o) => !o.pre_existing && o.review_status !== "rejected");
                return (
                  <button key={insp.id} onClick={() => setOpen({ r, i })} className="group relative overflow-hidden rounded-xl text-left focus-visible:ring-2">
                    <Photo src={a.thumb} alt={`${room.name}, ${INSPECTION_LABEL[insp.type]}`} observations={showBoxes ? obs : []} showLabels={false} scanning={a.analysis_status === "running"} className="aspect-[4/3]" imgClassName="transition duration-700 group-hover:scale-[1.04]" />
                    <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center gap-1.5">
                      {fresh.length > 0 && <span className="rounded-md bg-signal px-1.5 py-0.5 font-mono text-[10.5px] text-white">{fresh.length} finding{fresh.length > 1 ? "s" : ""}</span>}
                      {a.analysis_status === "running" && <span className="rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10.5px] text-white">analysing…</span>}
                      {a.staged && <span className="ml-auto rounded-md bg-black/45 px-1.5 py-0.5 font-mono text-[10px] text-white/80">staged</span>}
                    </div>
                  </button>
                );
              })}
            </Row>
          ))}
        </div>
      </div>

      {open && <Lightbox r={open.r} i={open.i} onMove={(r, i) => setOpen({ r, i })} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="contents">{children}</div>;
}

function Lightbox({ r, i, onMove, onClose }: { r: number; i: number; onMove: (r: number, i: number) => void; onClose: () => void }) {
  const { observations } = useStudio();
  const rooms = getRooms();
  const inspections = getInspections();
  const room = rooms[r];
  const insp = inspections[i];
  const a = assetFor(room.id, insp.id);
  const obs = a ? observations.filter((o) => o.asset_id === a.id) : [];
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onMove(r, Math.min(i + 1, inspections.length - 1));
      if (e.key === "ArrowLeft") onMove(r, Math.max(i - 1, 0));
      if (e.key === "ArrowDown") onMove(Math.min(r + 1, rooms.length - 1), i);
      if (e.key === "ArrowUp") onMove(Math.max(r - 1, 0), i);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [r, i, onMove, onClose, inspections.length, rooms.length]);

  return (
    <div className="fixed inset-0 z-50 flex bg-black/85 backdrop-blur-sm animate-fade-up" onClick={onClose}>
      <div className="flex min-w-0 flex-1 flex-col p-4 md:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-3 text-white">
          <div className="flex-1">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-white/50">{room.name}</div>
            <div className="text-[15px] font-medium">{INSPECTION_LABEL[insp.type]} · {fmtDate(insp.captured_at)}</div>
          </div>
          <div className="hidden items-center gap-1 md:flex">
            <button className="btn h-8 px-2 text-white/80 hover:bg-white/10" onClick={() => onMove(Math.max(r - 1, 0), i)} aria-label="Previous room"><ChevronUp className="size-4" /></button>
            <button className="btn h-8 px-2 text-white/80 hover:bg-white/10" onClick={() => onMove(Math.min(r + 1, rooms.length - 1), i)} aria-label="Next room"><ChevronDown className="size-4" /></button>
          </div>
          <button className="btn h-8 px-2 text-white/80 hover:bg-white/10" onClick={onClose} aria-label="Close"><X className="size-5" /></button>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          <button className="absolute left-0 z-10 grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30" disabled={i === 0} onClick={() => onMove(r, i - 1)} aria-label="Earlier"><ArrowLeft className="size-5" /></button>
          {a ? (
            <Photo src={a.src} alt={room.name} observations={obs} activeId={active} onBoxClick={setActive} className="max-h-full w-auto max-w-[min(100%,1200px)] shadow-2xl [aspect-ratio:1200/896]" />
          ) : (
            <div className="text-white/60">Not captured at this inspection.</div>
          )}
          <button className="absolute right-0 z-10 grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30" disabled={i === inspections.length - 1} onClick={() => onMove(r, i + 1)} aria-label="Later"><ArrowRight className="size-5" /></button>
        </div>
        <div className="mt-4 flex justify-center gap-2">
          {inspections.map((x, k) => (
            <button key={x.id} onClick={() => onMove(r, k)} className={cn("rounded-full px-3 py-1 text-[12px] transition", k === i ? "bg-white text-black" : "bg-white/10 text-white/70 hover:bg-white/20")}>
              {INSPECTION_LABEL[x.type]} {new Date(x.captured_at).getFullYear()}
            </button>
          ))}
        </div>
      </div>
      {a && (
        <aside className="hidden w-[340px] shrink-0 overflow-y-auto border-l border-white/10 bg-bg p-5 lg:block" onClick={(e) => e.stopPropagation()}>
          <div className="eyebrow mb-3">Findings · {obs.length}</div>
          <div className="space-y-2">
            {obs.length === 0 && <p className="text-[13px] text-ink-3">No visible condition issues recorded.</p>}
            {obs.map((o) => (
              <button key={o.id} onMouseEnter={() => setActive(o.id)} onMouseLeave={() => setActive(null)} className={cn("w-full rounded-xl border p-3 text-left transition", active === o.id ? "border-signal bg-signal/[.04]" : "border-line bg-surface")}>
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <CategoryBadge c={o.category} />
                  <StatusBadge s={o.review_status} />
                  {o.pre_existing && <span className="chip">Pre-existing</span>}
                </div>
                <p className="text-[12.5px] leading-relaxed">{o.description}</p>
                <div className="mt-2 flex items-center justify-between text-[11px] text-ink-3">
                  <span>{o.sub_area}</span>
                  <Confidence value={o.confidence} />
                </div>
              </button>
            ))}
          </div>
          <div className="eyebrow mb-2 mt-6">File</div>
          <dl className="space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between"><dt className="text-ink-3">size</dt><dd>{fmtBytes(a.bytes)} · {a.width}×{a.height}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-3">captured</dt><dd>{new Date(a.captured_at).toISOString().replace("T", " ").slice(0, 16)}Z</dd></div>
            <div className="flex justify-between gap-3"><dt className="flex items-center gap-1 text-ink-3"><Fingerprint className="size-3" />sha256</dt><dd className="truncate" title={a.sha256}>{shortHash(a.sha256, 12)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-3">source</dt><dd className="truncate">{a.cloudinary_public_id ? "Cloudinary" : "staged demo"}</dd></div>
          </dl>
        </aside>
      )}
    </div>
  );
}
