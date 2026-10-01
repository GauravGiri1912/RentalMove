"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { BBox } from "@/lib/view-types";
import { align, diff, lumaFromRGB, warp, type Gray } from "@/lib/pixel";

export type CompareMode = "slider" | "side" | "onion" | "diff";

type Box = { id: string; bbox: BBox; tone: "signal" | "muted" };

/** Zooms its content so `focus` fills most of the frame. */
function Zoom({ focus, children }: { focus: BBox | null; children: React.ReactNode }) {
  let style: React.CSSProperties = { transform: "none" };
  if (focus) {
    const [x1, y1, x2, y2] = focus;
    const s = Math.min(3.2, 0.55 / Math.max(x2 - x1, y2 - y1));
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    const tx = Math.min(Math.max(0.5 - cx * s, 1 - s), 0), ty = Math.min(Math.max(0.5 - cy * s, 1 - s), 0);
    style = { transform: `translate(${tx * 100}%, ${ty * 100}%) scale(${s})`, transformOrigin: "0 0" };
  }
  return <div className="absolute inset-0 transition-transform duration-700 ease-[cubic-bezier(.2,.7,.2,1)]" style={style}>{children}</div>;
}

function Boxes({ boxes, active, onHover }: { boxes: Box[]; active: string | null; onHover?: (id: string | null) => void }) {
  return (
    <>
      {boxes.map((b) => {
        const [x1, y1, x2, y2] = b.bbox;
        return (
          <div
            key={b.id}
            onMouseEnter={() => onHover?.(b.id)}
            onMouseLeave={() => onHover?.(null)}
            className={cn(
              "absolute rounded-[2px] transition-all",
              b.tone === "muted" ? "border border-dashed border-white/90" : "border-[1.5px] border-signal",
              active === b.id && "shadow-[0_0_0_4px_rgb(var(--signal)/.3)]"
            )}
            style={{ left: `${x1 * 100}%`, top: `${y1 * 100}%`, width: `${(x2 - x1) * 100}%`, height: `${(y2 - y1) * 100}%` }}
          />
        );
      })}
    </>
  );
}

function Img({ src, alt }: { src: string; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} draggable={false} className="absolute inset-0 h-full w-full select-none object-cover" />;
}

function Tag({ children, side }: { children: React.ReactNode; side: "left" | "right" }) {
  return (
    <span className={cn("pointer-events-none absolute top-3 z-10 rounded-md bg-black/60 px-2 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-white backdrop-blur", side === "left" ? "left-3" : "right-3")}>
      {children}
    </span>
  );
}

export interface DiffStats { changedPct: number; regions: BBox[]; ms: number; threshold: number; alignment: { dx: number; dy: number; scale: number } }

export function CompareViewer({
  mode,
  prior,
  current,
  priorLabel,
  currentLabel,
  boxes,
  focus,
  active,
  onHoverBox,
  threshold,
  normalize,
  onDiff,
  aspect = "1200 / 896",
}: {
  mode: CompareMode;
  prior: string;
  current: string;
  priorLabel: string;
  currentLabel: string;
  boxes: Box[];
  focus: BBox | null;
  active: string | null;
  onHoverBox?: (id: string | null) => void;
  threshold: number;
  normalize: boolean;
  onDiff?: (s: DiffStats) => void;
  aspect?: string;
}) {
  const [split, setSplit] = useState(0.5);
  const [opacity, setOpacity] = useState(0.5);
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const setFromEvent = useCallback((clientX: number) => {
    const r = frame.current?.getBoundingClientRect();
    if (!r) return;
    setSplit(Math.min(1, Math.max(0, (clientX - r.left) / r.width)));
  }, []);

  useEffect(() => {
    const up = () => (dragging.current = false);
    const move = (e: PointerEvent) => dragging.current && setFromEvent(e.clientX);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointermove", move);
    return () => { window.removeEventListener("pointerup", up); window.removeEventListener("pointermove", move); };
  }, [setFromEvent]);

  const onKeySlider = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") setSplit((s) => Math.max(0, s - 0.05));
    if (e.key === "ArrowRight") setSplit((s) => Math.min(1, s + 0.05));
  };

  if (mode === "side") {
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[{ src: prior, label: priorLabel, b: boxes.filter((x) => x.tone === "muted") }, { src: current, label: currentLabel, b: boxes }].map((p, k) => (
          <div key={k} className="relative overflow-hidden rounded-xl bg-surface-2" style={{ aspectRatio: aspect }}>
            <Zoom focus={focus}><Img src={p.src} alt={p.label} /><Boxes boxes={p.b} active={active} onHover={onHoverBox} /></Zoom>
            <Tag side="left">{p.label}</Tag>
          </div>
        ))}
      </div>
    );
  }

  if (mode === "onion") {
    return (
      <div>
        <div className="relative overflow-hidden rounded-xl bg-surface-2" style={{ aspectRatio: aspect }}>
          <Zoom focus={focus}>
            <Img src={prior} alt={priorLabel} />
            <div className="absolute inset-0" style={{ opacity }}><Img src={current} alt={currentLabel} /></div>
            <Boxes boxes={boxes} active={active} onHover={onHoverBox} />
          </Zoom>
          <Tag side="left">{priorLabel}</Tag>
          <Tag side="right">{currentLabel}</Tag>
        </div>
        <label className="mt-3 flex items-center gap-3 text-[12px] text-ink-3">
          <span className="w-16">Move-in</span>
          <input type="range" min={0} max={1} step={0.01} value={opacity} onChange={(e) => setOpacity(+e.target.value)} className="flex-1 accent-[rgb(var(--signal))]" aria-label="Blend" />
          <span className="w-16 text-right">Current</span>
        </label>
      </div>
    );
  }

  if (mode === "diff") {
    return <PixelDiff prior={prior} current={current} threshold={threshold} normalize={normalize} focus={focus} onDiff={onDiff} />;
  }

  return (
    <div
      ref={frame}
      className="relative cursor-ew-resize touch-none overflow-hidden rounded-xl bg-surface-2"
      style={{ aspectRatio: aspect }}
      onPointerDown={(e) => { dragging.current = true; setFromEvent(e.clientX); }}
    >
      <Zoom focus={focus}>
        <Img src={current} alt={currentLabel} />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${(1 - split) * 100}% 0 0)` }}>
          <Img src={prior} alt={priorLabel} />
        </div>
        <Boxes boxes={boxes.map((b) => b)} active={active} onHover={onHoverBox} />
      </Zoom>
      <Tag side="left">{priorLabel}</Tag>
      <Tag side="right">{currentLabel}</Tag>
      <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-white shadow-[0_0_0_1px_rgb(0_0_0/.15)]" style={{ left: `${split * 100}%` }}>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Reveal position"
          aria-valuenow={Math.round(split * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          onKeyDown={onKeySlider}
          className="pointer-events-auto absolute top-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/70 bg-black/40 text-white shadow-lg backdrop-blur-md"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 6-6 6 6 6M15 6l6 6-6 6" /></svg>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pixel diff — the same engine the server uses (lib/pixel.ts), run in the browser:
// align (shift + zoom) → local exposure match → misalignment-tolerant difference → regions.
// ---------------------------------------------------------------------------

const DIFF_W = 800;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

function PixelDiff({ prior, current, threshold, normalize, focus, onDiff }: { prior: string; current: string; threshold: number; normalize: boolean; focus: BBox | null; onDiff?: (s: DiffStats) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const onDiffRef = useRef(onDiff);
  useEffect(() => {
    onDiffRef.current = onDiff;
  });
  const [data, setData] = useState<{ a: Gray; b: Gray; t: ReturnType<typeof align>; w: number; h: number } | null>(null);
  const [regions, setRegions] = useState<BBox[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setData(null);
    Promise.all([loadImage(prior), loadImage(current)])
      .then(([pa, pb]) => {
        if (!live) return;
        const w = DIFF_W, h = Math.round((DIFF_W * pa.naturalHeight) / pa.naturalWidth);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const x = c.getContext("2d", { willReadFrequently: true })!;
        x.drawImage(pa, 0, 0, w, h);
        const a = lumaFromRGB(x.getImageData(0, 0, w, h).data, w, h, 4);
        x.drawImage(pb, 0, 0, w, h);
        const b = lumaFromRGB(x.getImageData(0, 0, w, h).data, w, h, 4);
        setData({ a, b, t: align(a, b), w, h });
      })
      .catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [prior, current]);

  useEffect(() => {
    if (!data || !canvas.current) return;
    const t0 = performance.now();
    const { a, b, t, w, h } = data;
    const moved = Math.abs(t.dx) > 0.01 || Math.abs(t.dy) > 0.01 || Math.abs(t.scale - 1) > 1e-6;
    const aligned = moved ? warp(b, t) : b;
    const margin = moved ? Math.ceil(Math.max(Math.abs(t.dx), Math.abs(t.dy)) + w * Math.abs(1 - t.scale)) + 3 : 0;
    const d = diff(a, aligned, { normalize, smooth: moved, margin, threshold: threshold > 0 ? threshold : undefined });

    const ctx = canvas.current.getContext("2d")!;
    const out = ctx.createImageData(w, h);
    const o = out.data;
    const sig = getComputedStyle(document.documentElement).getPropertyValue("--signal").trim().split(/\s+/).map(Number);
    for (let i = 0; i < w * h; i++) {
      const k = i * 4;
      const g = aligned.data[i] * 0.55 + 90; // dimmed greyscale backdrop (aligned current)
      const heat = d.heat[i];
      if (heat > d.threshold) {
        const s = Math.min(1, (heat - d.threshold) / 30 + 0.55);
        o[k] = g * (1 - s) + sig[0] * s; o[k + 1] = g * (1 - s) + sig[1] * s; o[k + 2] = g * (1 - s) + sig[2] * s;
      } else {
        o[k] = o[k + 1] = o[k + 2] = g;
      }
      o[k + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
    setRegions(d.regions);
    onDiffRef.current?.({ changedPct: d.changedPct, regions: d.regions, ms: performance.now() - t0, threshold: d.threshold, alignment: { dx: t.dx / w, dy: t.dy / h, scale: t.scale } });
  }, [data, threshold, normalize]);

  return (
    <div className="relative overflow-hidden rounded-xl bg-surface-2" style={{ aspectRatio: data ? `${data.w} / ${data.h}` : "1200 / 896" }}>
      <Zoom focus={focus}>
        <canvas ref={canvas} width={data?.w ?? DIFF_W} height={data?.h ?? 597} className="absolute inset-0 h-full w-full" />
        {regions.map((r, i) => (
          <div key={i} className="absolute rounded-[2px] border border-signal/90 bg-signal/[.06]" style={{ left: `${r[0] * 100}%`, top: `${r[1] * 100}%`, width: `${(r[2] - r[0]) * 100}%`, height: `${(r[3] - r[1]) * 100}%` }} />
        ))}
      </Zoom>
      {!data && !failed && <div className="absolute inset-0 grid place-items-center text-[12px] text-ink-3">Aligning and computing difference…</div>}
      {failed && <div className="absolute inset-0 grid place-items-center text-[12px] text-danger">Could not load both images for pixel comparison.</div>}
      <Tag side="left">Pixel difference · aligned</Tag>
    </div>
  );
}
