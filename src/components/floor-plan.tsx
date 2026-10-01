"use client";

import { useStudio } from "./providers";
import { arc, cone, DOORS, PINS, PLAN, PLAN_ROOMS, WINDOWS } from "@/lib/floorplan";
import { assetFor, getRooms, getProperty } from "@/lib/view";

/** Plan areas and pins with the property's real room ids (matched by category). */
export function resolvedPlan() {
  const idFor = (cat: string | null) => (cat ? getRooms().find((r) => r.category === cat)?.id ?? null : null);
  return {
    rooms: PLAN_ROOMS.map((p) => ({ ...p, room_id: idFor(p.category) })),
    pins: PINS.map((p) => ({ ...p, room_id: idFor(p.category) })).filter((p): p is typeof p & { room_id: string } => !!p.room_id),
  };
}
import { cn } from "@/lib/utils";

export function useRoomHeat(inspectionId: string) {
  const { observations } = useStudio();
  const heat: Record<string, { fresh: number; pre: number; captured: boolean; running: boolean }> = {};
  for (const r of resolvedPlan().rooms) {
    if (!r.room_id) continue;
    const a = assetFor(r.room_id, inspectionId);
    const obs = a ? observations.filter((o) => o.asset_id === a.id && o.review_status !== "rejected") : [];
    heat[r.room_id] = { fresh: obs.filter((o) => !o.pre_existing).length, pre: obs.filter((o) => o.pre_existing).length, captured: !!a, running: a?.analysis_status === "running" };
  }
  return heat;
}

export function FloorPlan({
  inspectionId,
  selected,
  hovered,
  onSelect,
  onHover,
  compact,
  showPins = true,
  showHeat = true,
  className,
}: {
  inspectionId: string;
  selected?: string | null;
  hovered?: string | null;
  onSelect?: (roomId: string) => void;
  onHover?: (roomId: string | null) => void;
  compact?: boolean;
  showPins?: boolean;
  showHeat?: boolean;
  className?: string;
}) {
  const heat = useRoomHeat(inspectionId);
  const { rooms: plan, pins } = resolvedPlan();
  const fill = (id: string | null) => {
    if (!id || !showHeat) return "rgb(var(--surface))";
    const h = heat[id];
    if (!h?.captured) return "rgb(var(--surface-2))";
    if (h.fresh >= 2) return "rgb(var(--signal) / .22)";
    if (h.fresh === 1) return "rgb(var(--signal) / .11)";
    return "rgb(var(--surface))";
  };

  const unitLabel = getProperty()?.unit_label || "Floor Plan";

  return (
    <svg viewBox={`0 0 ${PLAN.w} ${PLAN.h}`} className={cn("h-auto w-full select-none", className)} role="img" aria-label={`Floor plan of ${unitLabel}`}>
      <defs>
        <pattern id="fp-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="rgb(var(--line))" strokeWidth="2" />
        </pattern>
        {plan.map((r, i) => (
          <clipPath key={i} id={`fp-clip-${i}`}><rect x={r.rect[0]} y={r.rect[1]} width={r.rect[2]} height={r.rect[3]} /></clipPath>
        ))}
        <radialGradient id="fp-cone" cx="0" cy="0" r="1">
          <stop offset="0" stopColor="rgb(var(--ink))" stopOpacity=".28" />
          <stop offset="1" stopColor="rgb(var(--ink))" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Rooms */}
      {plan.map((r, i) => {
        const [x, y, w, h] = r.rect;
        const active = r.room_id && (selected === r.room_id || hovered === r.room_id);
        const interactive = !!r.room_id && !!onSelect;
        return (
          <g
            key={r.label}
            onClick={() => r.room_id && onSelect?.(r.room_id)}
            onMouseEnter={() => onHover?.(r.room_id)}
            onMouseLeave={() => onHover?.(null)}
            className={cn(interactive && "cursor-pointer")}
            role={interactive ? "button" : undefined}
            aria-label={interactive ? r.label : undefined}
          >
            <rect x={x} y={y} width={w} height={h} fill={r.room_id ? fill(r.room_id) : "url(#fp-hatch)"} className="transition-[fill] duration-500" />
            {active && <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} fill="none" stroke="rgb(var(--ink))" strokeWidth="2" strokeDasharray="6 5" rx="2" />}
            {showPins && r.room_id && pins.filter((p) => p.room_id === r.room_id).map((p) => (
              <path key={p.room_id} d={cone(p, compact ? 140 : 170)} fill="url(#fp-cone)" clipPath={`url(#fp-clip-${i})`} className={cn("transition-opacity duration-300", active ? "opacity-100" : "opacity-60")} style={{ transformOrigin: `${p.x}px ${p.y}px` }} />
            ))}
            {!compact && (
              <text x={x + 18} y={y + 32} className="fill-[rgb(var(--ink))] font-sans" fontSize="17" fontWeight="600">{r.label}</text>
            )}
            {!compact && <text x={x + 18} y={y + 52} className="fill-[rgb(var(--ink-3))] font-mono" fontSize="12">{r.area_m2} m²</text>}
            {r.room_id && heat[r.room_id]?.fresh > 0 && (
              <g transform={`translate(${x + w - (compact ? 34 : 44)}, ${y + (compact ? 14 : 18)})`}>
                <rect width={compact ? 22 : 28} height={compact ? 22 : 24} rx="6" fill="rgb(var(--signal))" />
                <text x={compact ? 11 : 14} y={compact ? 15.5 : 16.5} textAnchor="middle" fontSize={compact ? 13 : 13} fontWeight="700" fill="white" className="font-mono">{heat[r.room_id].fresh}</text>
              </g>
            )}
            {r.room_id && heat[r.room_id]?.running && (
              <circle cx={x + w - (compact ? 23 : 30)} cy={y + (compact ? 25 : 30)} r="7" fill="rgb(var(--signal))" className="animate-pulse" />
            )}
          </g>
        );
      })}

      {/* Walls */}
      <rect x="40" y="40" width="920" height="560" fill="none" stroke="rgb(var(--ink))" strokeWidth="9" />
      <g stroke="rgb(var(--ink))" strokeWidth="5" fill="none" strokeLinecap="square">
        <path d="M500 40 V318 M500 372 V600" />
        <path d="M760 40 V300" />
        <path d="M500 300 H560 M640 300 H800 M870 300 H960" />
        <path d="M500 380 H540 M610 380 H960" />
      </g>
      {/* Windows */}
      <g stroke="rgb(var(--bg))" strokeWidth="7">
        {WINDOWS.map((w, i) => <line key={i} x1={w[0]} y1={w[1]} x2={w[2]} y2={w[3]} />)}
      </g>
      <g stroke="rgb(var(--ink-3))" strokeWidth="1.5">
        {WINDOWS.map((w, i) => <line key={i} x1={w[0]} y1={w[1]} x2={w[2]} y2={w[3]} />)}
      </g>
      {/* Doors */}
      {DOORS.map((d, i) => {
        const { leaf, swing } = arc(d);
        return (
          <g key={i}>
            {i === 4 && <line x1={d.gap[0]} y1={d.gap[1]} x2={d.gap[2]} y2={d.gap[3]} stroke="rgb(var(--surface))" strokeWidth="12" />}
            <path d={leaf} stroke="rgb(var(--ink-2))" strokeWidth="2.5" />
            <path d={swing} stroke="rgb(var(--ink-3))" strokeWidth="1" strokeDasharray="3 4" fill="none" />
          </g>
        );
      })}
      {!compact && <text x="975" y="345" className="fill-[rgb(var(--ink-3))] font-mono" fontSize="11" transform="rotate(90 975 345)" textAnchor="middle">ENTRY</text>}

      {/* Camera pins */}
      {showPins && pins.map((p) => (
        <g key={p.room_id} transform={`translate(${p.x} ${p.y})`} onClick={() => onSelect?.(p.room_id)} className={cn(onSelect && "cursor-pointer")}>
          <circle r={compact ? 9 : 12} fill="rgb(var(--ink))" stroke="rgb(var(--surface))" strokeWidth="3" />
          <g transform={`rotate(${p.angle})`}><path d={compact ? "M4 -3 L9 0 L4 3 Z" : "M5 -4 L11 0 L5 4 Z"} fill="rgb(var(--surface))" /></g>
        </g>
      ))}
    </svg>
  );
}
