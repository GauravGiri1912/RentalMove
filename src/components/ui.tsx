"use client";

import { useEffect, useRef, useState } from "react";
import { cn, pct } from "@/lib/utils";
import type { BBox, IssueCategory, Observation, ReviewStatus } from "@/lib/view-types";

export const CATEGORY_META: Record<IssueCategory, { label: string; glyph: string }> = {
  scratch: { label: "Scratch", glyph: "∕∕" },
  stain: { label: "Stain", glyph: "◍" },
  crack: { label: "Crack", glyph: "⌇" },
  dent: { label: "Dent / chip", glyph: "◡" },
  mark: { label: "Mark / scuff", glyph: "≈" },
  other: { label: "Other", glyph: "·" },
};

export function CategoryBadge({ c, className }: { c: IssueCategory; className?: string }) {
  return (
    <span className={cn("chip", className)}>
      <span className="font-mono text-signal text-[11px] leading-none">{CATEGORY_META[c].glyph}</span>
      {CATEGORY_META[c].label}
    </span>
  );
}

const STATUS_STYLE: Record<ReviewStatus, string> = {
  pending: "text-warn border-warn/30 bg-warn/[.07]",
  accepted: "text-ok border-ok/30 bg-ok/[.07]",
  rejected: "text-ink-3 border-line bg-surface-2 line-through decoration-ink-3/40",
  edited: "text-info border-info/30 bg-info/[.07]",
};

export function StatusBadge({ s }: { s: ReviewStatus }) {
  return (
    <span className={cn("chip capitalize", STATUS_STYLE[s])}>
      <span className="size-1.5 rounded-full bg-current" />
      {s}
    </span>
  );
}

export function Confidence({ value, className }: { value: number; className?: string }) {
  const low = value < 0.6;
  return (
    <span className={cn("inline-flex items-center gap-2", className)} title={`Model confidence ${pct(value)}${low ? " — low, check carefully" : ""}`}>
      <span className="relative h-1 w-14 overflow-hidden rounded-full bg-line">
        <span className={cn("absolute inset-y-0 left-0 rounded-full", low ? "bg-warn" : "bg-ink")} style={{ width: pct(value) }} />
      </span>
      <span className={cn("font-mono text-[11px] tabular-nums", low ? "text-warn" : "text-ink-2")}>{pct(value)}</span>
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function CountUp({ n, ms = 900 }: { n: number; ms?: number }) {
  const [v, setV] = useState(n);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(n * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [n, ms]);
  return <>{v}</>;
}

export function Stat({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: boolean }) {
  return (
    <div className="card p-4">
      <div className="eyebrow">{label}</div>
      <div className={cn("mt-2 font-display text-[40px] leading-none tabular-nums", accent && "text-signal")}>{typeof value === "number" ? <CountUp n={value} /> : value}</div>
      {sub && <div className="mt-2 text-[12px] text-ink-3">{sub}</div>}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ eyebrow, title, lede, actions }: { eyebrow: string; title: React.ReactNode; lede?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between animate-fade-up">
      <div className="max-w-2xl">
        <div className="eyebrow mb-3">{eyebrow}</div>
        <h1 className="h-display text-[44px] md:text-[56px]">{title}</h1>
        {lede && <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{lede}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/**
 * On-screen rectangle of an object-cover image inside its container, in px. Finding boxes
 * are normalised to the IMAGE, so they must be laid out on this rectangle — not on the
 * container — or any photo whose aspect differs from the frame (a portrait phone shot)
 * would get misplaced boxes.
 */
export function useCoverRect(container: React.RefObject<HTMLElement | null>, natural: { w: number; h: number } | null) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [container]);
  if (!natural || !size || !natural.w || !natural.h) return { left: 0, top: 0, width: "100%", height: "100%" } as const;
  const scale = Math.max(size.w / natural.w, size.h / natural.h);
  const w = natural.w * scale, h = natural.h * scale;
  return { left: (size.w - w) / 2, top: (size.h - h) / 2, width: w, height: h };
}

/** Photo with observation boxes. Boxes are overlays — the original is never altered. */
export function Photo({
  src,
  alt,
  observations = [],
  boxes,
  activeId,
  onBoxClick,
  showLabels = true,
  scanning,
  className,
  imgClassName,
  rounded = true,
}: {
  src: string;
  alt: string;
  observations?: Observation[];
  boxes?: { id: string; bbox: BBox; label?: string; tone?: "signal" | "muted" | "ok" }[];
  activeId?: string | null;
  onBoxClick?: (id: string) => void;
  showLabels?: boolean;
  scanning?: boolean;
  className?: string;
  imgClassName?: string;
  rounded?: boolean;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const rect = useCoverRect(frame, natural);
  const onReady = () => {
    const im = imgRef.current;
    if (im && im.naturalWidth) { setLoaded(true); setNatural({ w: im.naturalWidth, h: im.naturalHeight }); }
  };
  // A cached or prerendered image can finish loading before hydration, in which
  // case onLoad never reaches React — check `complete` directly.
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) onReady();
    else setLoaded(false);
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps
  const items =
    boxes ??
    observations.map((o) => ({
      id: o.id,
      bbox: o.bbox,
      label: `${CATEGORY_META[o.category].label} · ${pct(o.confidence)}`,
      tone: (o.pre_existing ? "muted" : o.review_status === "rejected" ? "muted" : "signal") as "signal" | "muted",
    }));
  return (
    <div ref={frame} className={cn("relative overflow-hidden bg-surface-2", rounded && "rounded-xl", className)}>
      {!loaded && <div className="absolute inset-0 overflow-hidden"><div className="h-full w-full -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-surface/60 to-transparent" /></div>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imgRef} src={src} alt={alt} onLoad={onReady} className={cn("block h-full w-full object-cover transition-opacity duration-500", loaded ? "opacity-100" : "opacity-0", imgClassName)} draggable={false} />
      <div className="pointer-events-none absolute" style={rect}>
      {items.map((b) => {
        const [x1, y1, x2, y2] = b.bbox;
        const active = activeId === b.id || hover === b.id;
        const muted = b.tone === "muted";
        return (
          <button
            key={b.id}
            type="button"
            onMouseEnter={() => setHover(b.id)}
            onMouseLeave={() => setHover(null)}
            onClick={(e) => { e.stopPropagation(); onBoxClick?.(b.id); }}
            aria-label={b.label}
            className={cn(
              "group pointer-events-auto absolute rounded-[3px] transition-all duration-200",
              muted ? "border border-dashed border-white/80 mix-blend-normal" : "border-[1.5px] border-signal",
              active && !muted && "shadow-[0_0_0_4px_rgb(var(--signal)/.25)]",
              active && "z-10",
              !onBoxClick && "cursor-default"
            )}
            style={{ left: `${x1 * 100}%`, top: `${y1 * 100}%`, width: `${(x2 - x1) * 100}%`, height: `${(y2 - y1) * 100}%` }}
          >
            {!muted && <span className="absolute -left-[3px] -top-[3px] size-[5px] bg-signal" />}
            {!muted && <span className="absolute -bottom-[3px] -right-[3px] size-[5px] bg-signal" />}
            {showLabels && b.label && (
              <span
                className={cn(
                  "pointer-events-none absolute left-0 whitespace-nowrap rounded-[4px] px-1.5 py-0.5 font-mono text-[10px] leading-4 transition-opacity",
                  y1 > 0.12 ? "-top-6" : "top-full mt-1",
                  muted ? "bg-black/60 text-white" : "bg-signal text-white",
                  active ? "opacity-100" : "opacity-0 group-hover:opacity-100 md:opacity-90"
                )}
              >
                {b.label}
              </span>
            )}
          </button>
        );
      })}
      </div>
      {scanning && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute inset-x-0 h-1/3 animate-scan bg-gradient-to-b from-transparent via-signal/20 to-transparent" />
          <div className="absolute inset-0 hairline-grid opacity-20" />
        </div>
      )}
    </div>
  );
}

/**
 * Zooms into a region of a photo, keeping aspect ratio. `aspect` is the
 * container's width/height; the region is padded so context stays visible.
 */
export function Crop({ src, bbox, imgW = 1200, imgH = 896, aspect = 1, pad = 2.4, className, outline = true, alt = "" }: { src: string; bbox: BBox; imgW?: number; imgH?: number; aspect?: number; pad?: number; className?: string; outline?: boolean; alt?: string }) {
  const [x1, y1, x2, y2] = bbox;
  const bw = (x2 - x1) * imgW, bh = (y2 - y1) * imgH;
  let rw = Math.max(bw, bh * aspect) * pad;
  rw = Math.min(rw, imgW, imgH * aspect);
  const rh = rw / aspect;
  const cx = ((x1 + x2) / 2) * imgW, cy = ((y1 + y2) / 2) * imgH;
  const rx = Math.min(Math.max(cx - rw / 2, 0), imgW - rw);
  const ry = Math.min(Math.max(cy - rh / 2, 0), imgH - rh);
  return (
    <div className={cn("relative overflow-hidden bg-surface-2", className)} style={{ aspectRatio: String(aspect) }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} draggable={false} className="absolute max-w-none" style={{ width: `${(imgW / rw) * 100}%`, height: `${(imgH / rh) * 100}%`, left: `${(-rx / rw) * 100}%`, top: `${(-ry / rh) * 100}%` }} />
      {outline && (
        <div className="absolute rounded-[3px] border-[1.5px] border-signal" style={{ left: `${((x1 * imgW - rx) / rw) * 100}%`, top: `${((y1 * imgH - ry) / rh) * 100}%`, width: `${(bw / rw) * 100}%`, height: `${(bh / rh) * 100}%` }} />
      )}
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <div className="mb-3 grid size-10 place-items-center rounded-xl bg-surface-2 text-ink-2">{icon}</div>
      <div className="text-[14px] font-semibold">{title}</div>
      <p className="mt-1 max-w-sm text-[13px] text-ink-3">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode; hint?: string }[]; size?: "sm" | "md" }) {
  return (
    <div role="tablist" className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          title={o.hint}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md font-medium transition",
            size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[12.5px]",
            value === o.value ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
