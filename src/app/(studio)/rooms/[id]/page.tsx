"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, GitCompareArrows, MessageSquare, Pause, Play, Table2, BarChart3 } from "lucide-react";
import { useStudio } from "@/components/providers";
import { FloorPlan } from "@/components/floor-plan";
import { CategoryBadge, Confidence, StatusBadge } from "@/components/ui";
import { assetFor, getInspections, getRooms } from "@/lib/view";
import { PLAN_ROOMS } from "@/lib/floorplan";
import { roomCoverage, sizeOf, trendLabel, trendOf, workOrderOf } from "@/lib/insights";
import { fmtLength } from "@/lib/measure";
import { CoverageList } from "@/components/insights";
import { cn, fmtDate, INSPECTION_LABEL } from "@/lib/utils";

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const { observations, threads } = useStudio();
  const rooms = getRooms();
  const room = rooms.find((r) => r.id === id) ?? rooms[0];
  const idx = rooms.indexOf(room);
  const inspections = getInspections();
  const frames = inspections.map((i) => ({ insp: i, asset: assetFor(room.id, i.id) })).filter((f) => f.asset);
  const max = frames.length - 1;
  const [t, setT] = useState(max);
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState<"chart" | "table">("chart");
  const raf = useRef<number>(0);
  const plan = PLAN_ROOMS.find((p) => p.category === room.category);

  useEffect(() => { setT(max); setPlaying(false); }, [room.id, max]);

  const play = useCallback(() => {
    setPlaying(true);
    let dir = 1;
    let last = performance.now();
    let cur = 0;
    setT(0);
    const step = (now: number) => {
      // rAF timestamps can be slightly earlier than performance.now() at start: never go backwards.
      const dt = Math.max(0, (now - last) / 1000);
      last = Math.max(last, now);
      cur = Math.max(0, cur + dir * dt * 0.45);
      if (cur >= max) { cur = max; dir = -1; }
      if (cur <= 0 && dir < 0) { cur = 0; setT(0); setPlaying(false); return; }
      setT(cur);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [max]);
  const stop = () => { cancelAnimationFrame(raf.current); setPlaying(false); };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  useEffect(() => {
    const onTour = (e: Event) => { if ((e as CustomEvent).detail === "room:play") play(); };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "ArrowRight") { stop(); setT((x) => Math.min(max, Math.floor(x + 1))); }
      if (e.key === "ArrowLeft") { stop(); setT((x) => Math.max(0, Math.ceil(x - 1))); }
      if (e.key === " ") { e.preventDefault(); playing ? stop() : play(); }
    };
    window.addEventListener("rm:tour", onTour);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("rm:tour", onTour); window.removeEventListener("keydown", onKey); };
  }, [play, playing, max]);

  if (!frames.length) {
    return <div className="py-16 text-center text-[14px] text-ink-3">No photos of {room.name} yet. <Link href={`/capture?room=${room.id}`} className="underline">Capture one</Link>.</div>;
  }
  const tc = Math.min(max, Math.max(0, t));
  const nearest = Math.round(tc);
  const cur = frames[nearest];
  const lo = Math.floor(tc), hi = Math.min(max, lo + 1);
  const tDate = new Date(new Date(frames[lo].insp.captured_at).getTime() + (tc - lo) * (new Date(frames[hi].insp.captured_at).getTime() - new Date(frames[lo].insp.captured_at).getTime()));

  const history = frames.map((f) => {
    const obs = observations.filter((o) => o.asset_id === f.asset!.id && o.review_status !== "rejected");
    return { f, pre: obs.filter((o) => o.pre_existing || f.insp.type === "move_in").length, fresh: obs.filter((o) => !o.pre_existing && f.insp.type !== "move_in").length, obs };
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3 animate-fade-up">
        <Link href="/map" className="btn-ghost -ml-2 h-8 text-[12px]"><ArrowLeft className="size-3.5" /> Home map</Link>
        <div className="flex-1" />
        <Link href={`/rooms/${rooms[(idx - 1 + rooms.length) % rooms.length].id}`} className="btn-outline h-8 px-2" aria-label="Previous room"><ArrowLeft className="size-4" /></Link>
        <Link href={`/rooms/${rooms[(idx + 1) % rooms.length].id}`} className="btn-outline h-8 px-2" aria-label="Next room"><ArrowRight className="size-4" /></Link>
      </div>

      <header className="mb-8 grid grid-cols-1 items-end gap-6 lg:grid-cols-[1fr_260px] animate-fade-up">
        <div>
          <div className="eyebrow mb-3">Room dossier{plan ? ` · ${plan.area_m2} m²` : ""} · {frames.length} capture{frames.length === 1 ? "" : "s"}</div>
          <h1 className="h-display text-[56px] md:text-[80px]">{room.name}</h1>
        </div>
        <div className="card p-2"><FloorPlan inspectionId={cur.insp.id} selected={room.id} compact showHeat={false} /></div>
      </header>

      {/* Time machine */}
      <section className="card p-2" data-tour="room-tm">
        <div className="relative aspect-[1200/896] overflow-hidden rounded-xl bg-surface-2 md:aspect-[16/9]">
          {frames.map((f, i) => {
            const op = i === 0 ? 1 : Math.min(1, Math.max(0, t - i + 1));
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={f.insp.id} src={f.asset!.src} alt={`${room.name}, ${INSPECTION_LABEL[f.insp.type]}`} className="absolute inset-0 h-full w-full object-cover" style={{ opacity: op }} draggable={false} />
            );
          })}
          {history.map((h, i) =>
            h.obs.map((o) => {
              const vis = Math.max(0, 1 - Math.abs(t - i) * 2.2);
              if (vis <= 0) return null;
              const [x1, y1, x2, y2] = o.bbox;
              const pre = o.pre_existing || h.f.insp.type === "move_in";
              return (
                <div key={o.id} className={cn("absolute rounded-[2px]", pre ? "border border-dashed border-white" : "border-[1.5px] border-signal shadow-[0_0_0_4px_rgb(var(--signal)/.2)]")} style={{ opacity: vis, left: `${x1 * 100}%`, top: `${y1 * 100}%`, width: `${(x2 - x1) * 100}%`, height: `${(y2 - y1) * 100}%` }}>
                  {!pre && vis > 0.6 && <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-signal px-1.5 py-0.5 font-mono text-[10px] text-white">new · {o.category}</span>}
                </div>
              );
            })
          )}
          <div className="absolute left-4 top-4 rounded-xl bg-black/55 px-3 py-2 text-white backdrop-blur-md">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/60">{INSPECTION_LABEL[cur.insp.type]}</div>
            <div className="font-display text-[26px] leading-none tabular-nums">{fmtDate(tDate.toISOString(), { month: "short", year: "numeric" })}</div>
          </div>
          {cur.asset!.staged && <span className="absolute right-4 top-4 rounded-md bg-black/45 px-1.5 py-0.5 font-mono text-[10px] text-white/80">staged</span>}
        </div>

        <div className="flex items-center gap-4 px-3 pb-2 pt-4">
          <button onClick={() => (playing ? stop() : play())} className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-bg transition hover:scale-105" aria-label={playing ? "Pause" : "Play through time"}>
            {playing ? <Pause className="size-4" /> : <Play className="ml-0.5 size-4" />}
          </button>
          <div className="relative flex-1 pb-6 pt-1">
            <input type="range" min={0} max={max} step={0.001} value={t} onChange={(e) => { stop(); setT(+e.target.value); }} className="w-full accent-[rgb(var(--signal))]" aria-label="Time" />
            {frames.map((f, i) => {
              return (
                <button key={f.insp.id} onClick={() => { stop(); setT(i); }} className={cn("absolute top-7 whitespace-nowrap text-[11px] transition", i === 0 ? "" : i === max ? "-translate-x-full" : "-translate-x-1/2", nearest === i ? "font-medium text-ink" : "text-ink-3 hover:text-ink")} style={{ left: `${(i / max) * 100}%` }}>
                  {INSPECTION_LABEL[f.insp.type]} {new Date(f.insp.captured_at).getFullYear()}
                </button>
              );
            })}
          </div>
          <Link href={`/compare?room=${room.id}`} className="btn-outline hidden sm:inline-flex"><GitCompareArrows className="size-4" /> Compare</Link>
        </div>
      </section>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.3fr]">
        <section className="card p-5" data-tour="room-history">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="eyebrow mb-1">Condition history</div>
              <h2 className="text-[15px] font-semibold">Findings per inspection</h2>
            </div>
            <div className="flex gap-1">
              <button onClick={() => setView("chart")} aria-pressed={view === "chart"} className={cn("btn-ghost h-8 px-2", view === "chart" && "bg-surface-2 text-ink")} aria-label="Chart view"><BarChart3 className="size-4" /></button>
              <button onClick={() => setView("table")} aria-pressed={view === "table"} className={cn("btn-ghost h-8 px-2", view === "table" && "bg-surface-2 text-ink")} aria-label="Table view"><Table2 className="size-4" /></button>
            </div>
          </div>
          {view === "chart" ? <HistoryChart rows={history.map((h) => ({ label: `${INSPECTION_LABEL[h.f.insp.type]} ${new Date(h.f.insp.captured_at).getFullYear()}`, pre: h.pre, fresh: h.fresh }))} /> : (
            <table className="w-full text-left text-[13px]">
              <thead><tr className="border-b border-line text-[12px] text-ink-3"><th className="py-2 font-normal">Inspection</th><th className="py-2 text-right font-normal">Already there</th><th className="py-2 text-right font-normal">New</th></tr></thead>
              <tbody>{history.map((h) => <tr key={h.f.insp.id} className="border-b border-line/60"><td className="py-2">{INSPECTION_LABEL[h.f.insp.type]} · {fmtDate(h.f.insp.captured_at, { month: "short", year: "numeric" })}</td><td className="py-2 text-right font-mono">{h.pre}</td><td className="py-2 text-right font-mono">{h.fresh}</td></tr>)}</tbody>
            </table>
          )}
          {(() => {
            const cov = roomCoverage(room.id, cur.insp.id);
            return cov ? <div className="mt-5 border-t border-line pt-4"><CoverageList result={cov} title={`What the ${INSPECTION_LABEL[cur.insp.type].toLowerCase()} photos show`} /></div> : null;
          })()}
        </section>

        <section className="card">
          <div className="border-b border-line p-5 pb-4">
            <div className="eyebrow mb-1">Every finding, every visit</div>
            <h2 className="text-[15px] font-semibold">Finding history</h2>
          </div>
          <ol className="divide-y divide-line">
            {[...history].reverse().flatMap((h) =>
              h.obs.map((o) => (
                <li key={o.id} className="flex gap-3 p-4">
                  <div className="w-20 shrink-0 pt-0.5 font-mono text-[11px] text-ink-3">{fmtDate(h.f.insp.captured_at, { month: "short", year: "numeric" })}</div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <CategoryBadge c={o.category} />
                      <StatusBadge s={o.review_status} />
                      {h.f.insp.type !== "move_in" && (o.pre_existing ? <span className="chip">Since move-in</span> : <span className="chip border-signal/30 text-signal">New</span>)}
                      {(threads[o.id]?.length ?? 0) > 0 && <span className="chip"><MessageSquare className="size-3" /> {threads[o.id].length}</span>}
                      {(() => { const tr = trendOf(o); return tr && tr.kind !== "new" ? <span className={cn("chip", tr.kind === "grew" && "border-warn/40 text-warn")}>{trendLabel(tr)}</span> : null; })()}
                      {(() => { const sz = sizeOf(o); return sz ? <span className="chip">{fmtLength(sz.long_cm)}</span> : null; })()}
                      {(() => { const w = workOrderOf(o); return w ? <Link href="/repairs" className={cn("chip", w.status === "done" && "border-ok/40 text-ok")}>{w.status === "done" ? "Repaired" : "Repair requested"}</Link> : null; })()}
                    </div>
                    <p className="text-[13px] leading-relaxed">{o.description}</p>
                    <div className="mt-1.5"><Confidence value={o.confidence} /></div>
                  </div>
                </li>
              ))
            )}
          </ol>
        </section>
      </div>
    </div>
  );
}

/** Stacked bars: already-there (bottom) + new (top). Validated palette tokens. */
function HistoryChart({ rows }: { rows: { label: string; pre: number; fresh: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 420, H = 200, pad = { l: 28, r: 8, t: 18, b: 28 };
  const maxV = Math.max(3, ...rows.map((r) => r.pre + r.fresh));
  const bw = Math.min(56, (W - pad.l - pad.r) / rows.length - 36);
  const x = (i: number) => pad.l + ((W - pad.l - pad.r) / rows.length) * (i + 0.5);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / maxV);
  const ticks = Array.from({ length: maxV + 1 }, (_, i) => i);
  return (
    <div>
      <div className="mb-3 flex gap-4 text-[12px] text-ink-2">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[rgb(var(--chart-pre))]" /> Already there</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[rgb(var(--chart-new))]" /> New since move-in</span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Findings per inspection, stacked by already there and new">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="rgb(var(--line))" strokeWidth={v === 0 ? 1.2 : 0.6} />
              <text x={pad.l - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10" className="fill-[rgb(var(--ink-3))] font-mono">{v}</text>
            </g>
          ))}
          {rows.map((r, i) => {
            const total = r.pre + r.fresh;
            const gap = r.pre && r.fresh ? 2 : 0;
            const preTop = y(r.pre), top = y(total);
            return (
              <g key={r.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={x(i) - 40} y={pad.t} width={80} height={H - pad.t - pad.b} fill="transparent" />
                {r.pre > 0 && <path d={bar(x(i) - bw / 2, preTop, bw, y(0) - preTop, !r.fresh)} fill="rgb(var(--chart-pre))" opacity={hover === null || hover === i ? 1 : 0.45} />}
                {r.fresh > 0 && <path d={bar(x(i) - bw / 2, top, bw, preTop - top - gap, true)} fill="rgb(var(--chart-new))" opacity={hover === null || hover === i ? 1 : 0.45} />}
                <text x={x(i)} y={top - 6} textAnchor="middle" fontSize="11" fontWeight="600" className="fill-[rgb(var(--ink))] font-mono">{total}</text>
                <text x={x(i)} y={H - 9} textAnchor="middle" fontSize="11" className="fill-[rgb(var(--ink-2))]">{r.label}</text>
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div className="pointer-events-none absolute top-0 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11.5px] shadow-lift" style={{ left: `${(x(hover) / W) * 100}%`, transform: "translateX(-50%)" }}>
            <div className="font-medium">{rows[hover].label}</div>
            <div className="text-ink-2">{rows[hover].pre} already there · {rows[hover].fresh} new</div>
          </div>
        )}
      </div>
    </div>
  );
}

function bar(x: number, y: number, w: number, h: number, roundTop: boolean) {
  const r = roundTop ? Math.min(4, h) : 0;
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}
