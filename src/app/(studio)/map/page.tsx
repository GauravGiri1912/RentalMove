"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Compass, GitCompareArrows, Loader2 } from "lucide-react";
import { useStudio } from "@/components/providers";
import { FloorPlan, resolvedPlan, useRoomHeat } from "@/components/floor-plan";
import { CategoryBadge, PageHeader, Photo, Segmented } from "@/components/ui";
import { assetFor, getInspections, getProperty, getRoom, getRooms } from "@/lib/view";
import { Empty } from "@/components/ui";
import { Building2 } from "lucide-react";
import { hasPlan } from "@/lib/floorplan";
import { cn, fmtDate, INSPECTION_LABEL } from "@/lib/utils";

export default function MapPage() {
  const { observations } = useStudio();
  const inspections = getInspections();
  const rooms = getRooms();
  const [inspId, setInspId] = useState(inspections[inspections.length - 1]?.id ?? "");
  const [selected, setSelected] = useState<string>(rooms.find((r) => r.category === "kitchen")?.id ?? rooms[0]?.id ?? "");
  const [hovered, setHovered] = useState<string | null>(null);
  const heat = useRoomHeat(inspId);
  const focusId = hovered ?? selected;
  const room = getRoom(focusId);
  const insp = inspections.find((i) => i.id === inspId)!;
  const asset = assetFor(focusId, inspId);
  const obs = asset ? observations.filter((o) => o.asset_id === asset.id && o.review_status !== "rejected") : [];
  const pin = resolvedPlan().pins.find((p) => p.room_id === focusId);
  const totalFresh = Object.values(heat).reduce((s, h) => s + h.fresh, 0);

  if (!hasPlan(rooms) || !inspId) {
    return <Empty icon={<Building2 className="size-5" />} title="No floor plan for this property yet" body="The home map needs a plan of the unit. Rooms, photos and findings are all available in Property memory." />;
  }

  return (
    <div>
      <PageHeader
        eyebrow={`${getProperty().address_label} · ${getProperty().unit_label}`}
        title={<>Home <em>map</em></>}
        lede="Every photo has a place. Each pin marks where the camera stood and which way it faced, so the next visit can stand in the same spot."
        actions={
          <Segmented
            value={inspId}
            onChange={setInspId}
            options={inspections.map((i) => ({ value: i.id, label: `${INSPECTION_LABEL[i.type]} ${new Date(i.captured_at).getFullYear()}` }))}
          />
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
        <div data-tour="map-plan" className="card relative overflow-hidden p-4 md:p-6">
          <div className="hairline-grid pointer-events-none absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_80%)]" />
          <div className="relative">
            <FloorPlan inspectionId={inspId} selected={selected} hovered={hovered} onSelect={setSelected} onHover={setHovered} />
          </div>
          <div className="relative mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-ink-3">
            <span className="flex items-center gap-2"><span className="size-3 rounded-sm border border-line bg-surface" /> No new findings</span>
            <span className="flex items-center gap-2"><span className="size-3 rounded-sm bg-signal/[.11]" /> 1 new</span>
            <span className="flex items-center gap-2"><span className="size-3 rounded-sm bg-signal/[.22]" /> 2+ new</span>
            <span className="flex items-center gap-2"><span className="size-3 rounded-sm bg-surface-2" /> Not captured</span>
            <span className="flex items-center gap-2"><Compass className="size-3.5" /> Camera position + view</span>
            <span className="ml-auto font-mono">{totalFresh} new at {INSPECTION_LABEL[insp.type].toLowerCase()}</span>
          </div>
        </div>

        <aside className="space-y-4" data-tour="map-room">
          <div className="card overflow-hidden">
            {asset ? (
              <Photo key={asset.id} src={asset.thumb} alt={room.name} observations={obs} showLabels={false} scanning={asset.analysis_status === "running"} rounded={false} className="aspect-[4/3]" />
            ) : (
              <div className="grid aspect-[4/3] place-items-center bg-surface-2 text-[13px] text-ink-3">Not captured at this visit</div>
            )}
            <div className="p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="h-display text-[30px]">{room.name}</h2>
                <span className="font-mono text-[11px] text-ink-3">{fmtDate(insp.captured_at, { month: "short", year: "numeric" })}</span>
              </div>
              {pin && <div className="mt-1 font-mono text-[11px] text-ink-3">camera ({pin.x}, {pin.y}) · facing {((pin.angle + 360) % 360).toFixed(0)}° · {pin.fov}° view</div>}
              {asset?.analysis_status === "running" ? (
                <p className="mt-3 flex items-center gap-2 text-[13px] text-ink-3"><Loader2 className="size-4 animate-spin text-signal" /> Analysis in progress</p>
              ) : obs.length === 0 ? (
                <p className="mt-3 text-[13px] text-ink-3">{asset ? "No condition findings recorded." : "Periodic visits can skip rooms."}</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {obs.map((o) => (
                    <li key={o.id} className="flex items-start gap-2 text-[12.5px] leading-snug">
                      <CategoryBadge c={o.category} className="shrink-0" />
                      <span className={cn("pt-0.5", o.pre_existing ? "text-ink-3" : "text-ink")}>{o.description}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link href={`/rooms/${room.id}`} className="btn-primary">Room dossier <ArrowUpRight className="size-4" /></Link>
                <Link href={`/compare?room=${room.id}`} className="btn-outline"><GitCompareArrows className="size-4" /> Compare</Link>
              </div>
            </div>
          </div>
          <p className="px-1 text-[12px] leading-relaxed text-ink-3">Tip: hover a room to preview it, click to pin it. Switch visits above to watch findings appear across the home.</p>
        </aside>
      </div>
    </div>
  );
}
