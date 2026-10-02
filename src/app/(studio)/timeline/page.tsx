"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarClock, KeyRound, LogOut, Search as SearchIcon } from "lucide-react";
import { useStudio } from "@/components/providers";
import { CategoryBadge, PageHeader, Photo, StatusBadge } from "@/components/ui";
import { assetFor, getInspections, getProperty, getRooms } from "@/lib/view";
import { Empty } from "@/components/ui";
import { Camera } from "lucide-react";
import { cn, fmtDate, INSPECTION_LABEL } from "@/lib/utils";

const ICON = { move_in: KeyRound, inspection: SearchIcon, move_out: LogOut };

export default function TimelinePage() {
  const { observations } = useStudio();
  const prop = getProperty();
  const inspections = getInspections();
  const rooms = getRooms();
  if (!inspections.length) {
    return <Empty icon={<Camera className="size-5" />} title="No visits yet" body="The timeline starts with the move-in capture." action={<Link href="/capture" className="btn-primary">Start capture</Link>} />;
  }
  // Span: first inspection → today (or the last inspection, if later).
  const first = new Date(inspections[0].captured_at).getTime();
  const now = Date.now();
  const last = Math.max(now, new Date(inspections[inspections.length - 1].captured_at).getTime());
  const pad = (last - first) * 0.04 || 864e5 * 30;
  const start = first - pad, end = last + pad;
  const pos = (t: number) => `${Math.min(100, Math.max(0, ((t - start) / (end - start)) * 100))}%`;
  const years: number[] = [];
  for (let y = new Date(first).getFullYear() + 1; y <= new Date(last).getFullYear(); y++) years.push(y);
  const months = Math.max(1, Math.round((last - first) / (30.44 * 864e5)));
  const words = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

  return (
    <div>
      <PageHeader eyebrow={`${prop.address_label} · since ${fmtDate(inspections[0].captured_at, { month: "short", year: "numeric" })}`} title={<>{months >= 24 ? `${Math.floor(months / 12)} years` : `${months} month${months === 1 ? "" : "s"}`}, <em>{words[inspections.length] ?? inspections.length} visit{inspections.length === 1 ? "" : "s"}</em></>} lede="The full condition history of the home, in order. Each visit links back to the photos and the decisions made about them." />

      {/* Lease bar */}
      <div className="card mb-10 p-5">
        <div className="relative h-16">
          <div className="absolute inset-x-0 top-7 h-1.5 rounded-full bg-surface-2" />
          <div className="absolute left-0 top-7 h-1.5 rounded-full bg-ink" style={{ width: pos(now) }} />
          {years.map((y) => {
            const t = new Date(`${y}-01-01`).getTime();
            return <div key={y} className="absolute top-10 -translate-x-1/2 font-mono text-[10.5px] text-ink-3" style={{ left: pos(t) }}><div className="mx-auto mb-1 h-2 w-px bg-line" />{y}</div>;
          })}
          {inspections.map((insp) => {
            const Icon = ICON[insp.type];
            return (
              <a key={insp.id} href={`#${insp.id}`} className="group absolute top-0 -translate-x-1/2 text-center" style={{ left: pos(new Date(insp.captured_at).getTime()) }}>
                <span className={cn("mx-auto grid size-7 place-items-center rounded-full border-2 border-surface shadow-card transition group-hover:scale-110", insp.type === "move_out" ? "bg-signal text-white" : "bg-ink text-bg")}><Icon className="size-3.5" /></span>
              </a>
            );
          })}
          <div className="absolute top-3 -translate-x-1/2" style={{ left: pos(now) }}>
            <div className="h-10 w-px bg-signal" />
          </div>
        </div>
        <div className="mt-2 flex justify-between text-[12px] text-ink-3">
          <span>First inspection · {fmtDate(inspections[0].captured_at)}</span>
          <span>Today</span>
        </div>
      </div>

      <ol className="relative space-y-12 before:absolute before:bottom-0 before:left-[15px] before:top-2 before:w-px before:bg-line md:before:left-[199px]">
        {[...inspections].reverse().map((insp) => {
          const Icon = ICON[insp.type];
          const assets = rooms.map((r) => ({ r, a: assetFor(r.id, insp.id) })).filter((x) => x.a);
          const obs = observations.filter((o) => assets.some((x) => x.a!.id === o.asset_id));
          const fresh = obs.filter((o) => !o.pre_existing);
          return (
            <li key={insp.id} id={insp.id} className="relative grid grid-cols-1 scroll-mt-24 gap-4 md:grid-cols-[170px_1fr] md:gap-14">
              <div className="flex items-start gap-3 md:block md:text-right">
                <span className={cn("relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-4 border-bg md:absolute md:left-[184px] md:top-0", insp.type === "move_out" ? "bg-signal text-white" : "bg-ink text-bg")}><Icon className="size-3.5" /></span>
                <div>
                  <div className="h-display text-[30px]">{INSPECTION_LABEL[insp.type]}</div>
                  <div className="font-mono text-[11.5px] text-ink-3">{fmtDate(insp.captured_at, { day: "numeric", month: "long", year: "numeric" })}</div>
                  <div className="mt-1 text-[12px] text-ink-3">by {insp.captured_by}</div>
                </div>
              </div>
              <div className="card overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
                  <span className="text-[13px] font-medium">{assets.length} rooms · {obs.length} findings</span>
                  {fresh.length > 0 && insp.type !== "move_in" && <span className="chip border-signal/30 text-signal">{fresh.length} new since move-in</span>}
                  {insp.status === "in_progress" && <span className="chip"><CalendarClock className="size-3" /> In progress</span>}
                  <Link href={insp.type === "move_in" ? "/memory" : "/compare"} className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-ink-2 hover:text-ink">{insp.type === "move_in" ? "Open memory" : "Compare with move-in"} <ArrowUpRight className="size-3.5" /></Link>
                </div>
                <div className="grid grid-cols-2 gap-1 p-1 lg:grid-cols-4">
                  {assets.map(({ r, a }) => (
                    <Link key={r.id} href={`/compare?room=${r.id}`} className="group relative">
                      <Photo src={a!.thumb} alt={r.name} observations={observations.filter((o) => o.asset_id === a!.id && !o.pre_existing)} showLabels={false} scanning={a!.analysis_status === "running"} className="aspect-[4/3]" rounded={false} imgClassName="transition duration-500 group-hover:scale-105" />
                      <span className="absolute bottom-1.5 left-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10.5px] text-white backdrop-blur">{r.name}</span>
                    </Link>
                  ))}
                </div>
                {obs.length > 0 && (
                  <ul className="divide-y divide-line border-t border-line">
                    {obs.slice(0, 4).map((o) => (
                      <li key={o.id} className="flex items-center gap-3 px-4 py-2.5 text-[12.5px]">
                        <CategoryBadge c={o.category} />
                        <span className="min-w-0 flex-1 truncate text-ink-2">{o.description}</span>
                        <StatusBadge s={o.review_status} />
                      </li>
                    ))}
                    {obs.length > 4 && <li className="px-4 py-2 text-[12px] text-ink-3">+ {obs.length - 4} more</li>}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
