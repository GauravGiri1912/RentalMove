"use client";

import { VisitCompleteness } from "@/components/visit";
import { TenantInvites } from "@/components/invites";
import { GettingStarted } from "@/components/getting-started";
import { MessageSquareWarning } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles, ArrowRight, ArrowUpRight, Building2, Camera, CheckCircle2, Circle, CircleDashed, FileText, Fingerprint,
  GitCompareArrows, Loader2, ScanSearch, Upload, Cpu, PenLine, Link2, Copy, AlertTriangle,
} from "lucide-react";
import { useStudio } from "@/components/providers";
import { Confidence, Crop, Empty, Photo, SectionTitle, Stat } from "@/components/ui";
import { FloorPlan } from "@/components/floor-plan";
import { SUGGESTED } from "@/lib/assistant";
import { assetFor, comparisonFor, getAssets, getEvents, getInspections, getProperties, getProperty, getRooms, isUsablePhoto, reportPair } from "@/lib/view";
import { hasPlan } from "@/lib/floorplan";
import { cn, fmtDate, INSPECTION_LABEL, relTime } from "@/lib/utils";

const STAGE_ICON: Record<string, typeof Upload> = {
  upload: Upload, analyze: Cpu, compare: GitCompareArrows, review: ScanSearch, share: Link2, signature: PenLine, fingerprint: Copy,
};

export default function Overview() {
  const { user, observations, setAskOpen, signatures } = useStudio();
  const prop = getProperty();
  const rooms = getRooms();
  const inspections = getInspections();
  const assets = getAssets();
  const { baseline, current } = reportPair();
  const currentIds = new Set(assets.filter((a) => a.inspection_id === current?.id && isUsablePhoto(a.id)).map((a) => a.id));
  const pending = observations.filter((o) => o.review_status === "pending" && currentIds.has(o.asset_id));
  const newFindings = pending.filter((o) => !o.pre_existing).length;
  const reused = assets.filter((a) => a.reused_of);

  // Hero: the room with the most new findings that was captured at more than one visit.
  const heroRoom = useMemo(() => {
    const scored = rooms
      .map((r) => ({ r, visits: inspections.filter((i) => assetFor(r.id, i.id)).length, fresh: observations.filter((o) => !o.pre_existing && assets.find((a) => a.id === o.asset_id && a.room_id === r.id && currentIds.has(a.id))).length }))
      .filter((x) => x.visits > 0)
      .sort((a, b) => b.fresh - a.fresh || b.visits - a.visits);
    return scored[0]?.r ?? null;
  }, [rooms, inspections, observations, assets]); // eslint-disable-line react-hooks/exhaustive-deps
  const heroFrames = heroRoom ? inspections.filter((i) => assetFor(heroRoom.id, i.id)) : [];
  const [hero, setHero] = useState(Math.max(0, heroFrames.length - 1));
  const heroRef = useRef<HTMLDivElement>(null);
  const [heroVisible, setHeroVisible] = useState(true);

  // Pause rotation when hero card is scrolled off-screen
  useEffect(() => {
    if (!heroRef.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      setHeroVisible(entry.isIntersecting);
    }, { threshold: 0.1 });
    observer.observe(heroRef.current);
    return () => observer.disconnect();
  }, []);

  // Frame rotation timer, responsive to visibility, tab focus, and reduced motion
  useEffect(() => {
    if (heroFrames.length < 2 || !heroVisible) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const t = setInterval(() => {
      if (document.hidden) return;
      setHero((h) => (h + 1) % heroFrames.length);
    }, 3800);
    return () => clearInterval(t);
  }, [heroFrames.length, heroVisible]);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const comparedRooms = rooms.filter((r) => (comparisonFor(r.id)?.changes.length ?? 0) > 0).length;
  const analysing = assets.filter((a) => a.analysis_status === "queued" || a.analysis_status === "running").length;

  if (!inspections.length) {
    return (
      <div className="space-y-6 pt-10">
        <Empty icon={<Camera className="size-5" />} title={`${prop.address_label} has no visits yet`} body="Start with a move-in capture. Every later visit is compared with it." action={<Link href="/capture" className="btn-primary"><Camera className="size-4" /> Start move-in capture</Link>} />
        <GettingStarted />
        {user.role === "owner" && <div id="tenant-invites"><TenantInvites /></div>}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <header data-tour="ov-hero" className="grid grid-cols-1 gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-end animate-fade-up">
        <div>
          <div className="eyebrow mb-3">{greeting}, {user.name.split(" ")[0]} · {fmtDate(now.toISOString(), { weekday: "long", day: "numeric", month: "long" })}</div>
          <h1 className="h-display text-[48px] md:text-[68px]">
            {current ? (
              user.role === "tenant" ? <>Your {INSPECTION_LABEL[current.type].toLowerCase()} is <em className="text-signal">on record</em>.</> : <>{prop.address_label}: <em className="text-signal">{INSPECTION_LABEL[current.type].toLowerCase()}</em>.</>
            ) : (
              <>{prop.address_label} has its <em className="text-signal">baseline</em>.</>
            )}
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-2">
            {current && baseline
              ? `${assets.filter((a) => currentIds.has(a.id)).length} rooms were captured on ${fmtDate(current.captured_at)} and compared with move-in (${fmtDate(baseline.captured_at)}). ${newFindings} finding${newFindings === 1 ? " is" : "s are"} new since move-in${pending.length ? " — each waits for a human decision" : ""}.${analysing ? ` ${analysing} photo${analysing === 1 ? " is" : "s are"} still being analysed.` : ""}`
              : "The move-in photos are the baseline every later visit is compared with."}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {pending.length > 0 && <Link href="/review" className="btn-signal h-10 px-4"><ScanSearch className="size-4" /> Review {pending.length} finding{pending.length === 1 ? "" : "s"}</Link>}
            <Link href="/compare" className="btn-outline h-10 px-4"><GitCompareArrows className="size-4" /> Compare rooms</Link>
            <Link href="/capture" className="btn-ghost h-10 px-4"><Camera className="size-4" /> Add a photo</Link>
          </div>
        </div>

        {heroRoom && heroFrames.length > 0 && (
          <div ref={heroRef} className="card overflow-hidden p-2">
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl">
              {heroFrames.map((insp, i) => {
                const a = assetFor(heroRoom.id, insp.id)!;
                return (
                  <div key={insp.id} className={cn("absolute inset-0 transition-opacity duration-1000", i === hero ? "opacity-100" : "opacity-0")}>
                    <Photo
                      src={a.src}
                      alt={`${heroRoom.name} at ${INSPECTION_LABEL[insp.type]}`}
                      observations={observations.filter((o) => o.asset_id === a.id && !o.pre_existing && o.review_status !== "rejected")}
                      showLabels={false}
                      rounded={false}
                      priority={i === hero}
                      loading={i === hero ? "eager" : "lazy"}
                      className="h-full"
                    />
                  </div>
                );
              })}
              <div className="absolute inset-x-3 bottom-3 flex items-center justify-between rounded-lg bg-black/55 px-3 py-2 text-white backdrop-blur-md">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/60">{heroRoom.name}</div>
                  <div className="text-[13px] font-medium">{INSPECTION_LABEL[heroFrames[hero % heroFrames.length].type]} · {fmtDate(heroFrames[hero % heroFrames.length].captured_at, { month: "short", year: "numeric" })}</div>
                </div>
                <div className="flex gap-1">
                  {heroFrames.map((f, i) => (
                    <button key={f.id} onClick={() => setHero(i)} aria-label={`Show ${INSPECTION_LABEL[f.type]}`} className={cn("h-1.5 rounded-full transition-all", i === hero ? "w-6 bg-white" : "w-1.5 bg-white/50")} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between px-2 pb-1 pt-3 text-[12px] text-ink-3">
              <span>Same room, {heroFrames.length} visit{heroFrames.length === 1 ? "" : "s"}.</span>
              <Link href={`/rooms/${heroRoom.id}`} className="inline-flex items-center gap-1 font-medium text-ink hover:underline">Room dossier <ArrowRight className="size-3.5" /></Link>
            </div>
          </div>
        )}
      </header>

      {user.role === "tenant" && (
        <Link href="/claim" className="card flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-lift" data-testid="claim-cta">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-signal/10 text-signal"><MessageSquareWarning className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">Your landlord says you broke something?</span>
            <span className="block text-[12.5px] text-ink-3">Paste their message. See whether it was already there at move-in, and get a reply ready to send.</span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-ink-3" />
        </Link>
      )}
      <GettingStarted />
      {user.role === "owner" && <div id="tenant-invites"><TenantInvites /></div>}

      {reused.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/[.05] p-4 text-[13px] animate-fade-up">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
          <div className="flex-1">
            <span className="font-semibold">{reused.length} re-used photo{reused.length === 1 ? "" : "s"} detected.</span> The same image as an earlier capture was uploaded again (Cloudinary perceptual hash, confirmed on aligned pixels). It cannot show the room&apos;s current condition.
          </div>
          <Link href="/memory" className="btn-ghost h-8 text-[12px]">Show <ArrowRight className="size-3.5" /></Link>
        </div>
      )}

      {current && <VisitCompleteness inspectionId={current.id} compact />}

      <section data-tour="ov-stats" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Photos in memory" value={assets.length} sub={`${inspections.length} visit${inspections.length === 1 ? "" : "s"} since ${fmtDate(inspections[0].captured_at, { month: "short", year: "numeric" })}`} />
        <Stat label="Awaiting review" value={pending.length} sub={`${newFindings} new · ${pending.length - newFindings} pre-existing`} accent />
        <Stat label="Rooms with changes" value={`${comparedRooms}/${rooms.length}`} sub={analysing ? `${analysing} photo${analysing === 1 ? "" : "s"} analysing` : "compared with move-in"} />
        <Stat label="Integrity sealed" value={`${assets.filter((a) => a.sha256).length}/${assets.length}`} sub={<span className="inline-flex items-center gap-1"><Fingerprint className="size-3" /> SHA-256 of originals</span>} />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
        {hasPlan(rooms) ? (
          <Link href="/map" className="card group relative overflow-hidden p-5 transition hover:shadow-lift">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="eyebrow mb-1">Home map · {current ? INSPECTION_LABEL[current.type].toLowerCase() : "move-in"}</div>
                <div className="text-[15px] font-semibold">Where the changes are</div>
              </div>
              <ArrowUpRight className="size-4 text-ink-3 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
            </div>
            <FloorPlan inspectionId={(current ?? baseline ?? inspections[0]).id} compact />
          </Link>
        ) : (
          <div className="card p-5"><Empty icon={<Building2 className="size-5" />} title="No floor plan for this property" body="The home map is available once a plan is set up for the unit." /></div>
        )}
        <div className="card relative flex flex-col overflow-hidden p-5">
          <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-signal/10 blur-3xl" />
          <div className="eyebrow mb-1">Ask RentalMove</div>
          <div className="h-display text-[30px]">Ask the <em>home</em> anything.</div>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-3">Answers come only from this property&apos;s records — each one cites the photos it&apos;s based on.</p>
          <div className="mt-4 flex flex-1 flex-col justify-end gap-2">
            {SUGGESTED.slice(0, 3).map((q) => (
              <button key={q} onClick={() => window.dispatchEvent(new CustomEvent("rm:ask", { detail: q }))} className="flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2.5 text-left text-[13px] transition hover:border-ink/30">
                {q} <ArrowRight className="size-3.5 text-ink-3" />
              </button>
            ))}
            <button onClick={() => setAskOpen(true)} className="btn-signal mt-1"><Sparkles className="size-4" /> Ask a question <span className="font-mono text-[10.5px] opacity-70">⌘J</span></button>
          </div>
        </div>
      </section>

      <section data-tour="ov-rooms" className="grid grid-cols-1 gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div>
          <SectionTitle eyebrow={current ? `${INSPECTION_LABEL[current.type]} · ${fmtDate(current.captured_at)}` : "Move-in"} title="Rooms" action={<Link href="/memory" className="btn-ghost h-8 text-[12px]">Open memory <ArrowUpRight className="size-3.5" /></Link>} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {rooms.map((r) => {
              const cur = assetFor(r.id, (current ?? baseline ?? inspections[inspections.length - 1]).id);
              if (!cur) return (
                <div key={r.id} className="card grid place-items-center p-6 text-center text-[12.5px] text-ink-3">
                  <div><div className="mb-1 text-[14px] font-semibold text-ink">{r.name}</div>Not captured at this visit.<div className="mt-2"><Link href={`/capture?room=${r.id}`} className="btn-outline h-8 text-[12px]"><Camera className="size-3.5" /> Capture</Link></div></div>
                </div>
              );
              const obs = observations.filter((o) => o.asset_id === cur.id && o.review_status !== "rejected");
              const fresh = obs.filter((o) => !o.pre_existing).length;
              const cmp = comparisonFor(r.id);
              const running = cur.analysis_status === "running" || cur.analysis_status === "queued";
              return (
                <Link key={r.id} href={`/rooms/${r.id}`} className="card group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lift">
                  <Photo src={cur.thumb} alt={r.name} observations={obs.filter((o) => !o.pre_existing)} showLabels={false} scanning={running} rounded={false} className="aspect-[16/10]" imgClassName="transition duration-700 group-hover:scale-[1.03]" />
                  <div className="p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[14px] font-semibold">{r.name}</div>
                      {running ? (
                        <span className="chip border-signal/30 text-signal"><Loader2 className="size-3 animate-spin" /> Analysing</span>
                      ) : cur.analysis_status === "quota_limited" ? (
                        <span className="chip border-warn/30 text-warn">AI quota limited</span>
                      ) : cur.analysis_status === "retryable" ? (
                        <span className="chip border-signal/30 text-ink-3">Analysis retryable</span>
                      ) : cur.analysis_status === "failed" ? (
                        <span className="chip border-warn/30 text-warn">Analysis failed</span>
                      ) : cur.reused_of ? (
                        <span className="chip border-danger/30 text-danger">Re-used photo</span>
                      ) : fresh > 0 && current ? (
                        <span className="chip border-signal/30 bg-signal/[.06] text-signal">{fresh} new since move-in</span>
                      ) : (
                        <span className="chip">{current ? "No new changes" : `${obs.length} recorded`}</span>
                      )}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink-3">{cmp?.summary ?? (cur.analysis_error ? `Analysis failed: ${cur.analysis_error.slice(0, 80)}` : "No comparison run yet.")}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <SectionTitle eyebrow="Live" title="Pipeline activity" />
            <div className="card divide-y divide-line">
              {getEvents().length === 0 && <p className="p-4 text-[12.5px] text-ink-3">No activity yet.</p>}
              {getEvents().slice(0, 8).map((e, i) => {
                const Icon = STAGE_ICON[e.stage] ?? Cpu;
                return (
                  <div key={e.id} className="flex gap-3 p-3.5 animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
                    <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg", e.stage === "fingerprint" ? "bg-danger/10 text-danger" : i === 0 ? "bg-signal/10 text-signal" : "bg-surface-2 text-ink-2")}>
                      <Icon className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-medium">{e.label}</span>
                        <span className="shrink-0 font-mono text-[10.5px] text-ink-3">{relTime(e.at)}</span>
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[11px] text-ink-3" title={e.detail}>{e.detail}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {user.role === "tenant" ? <TenantChecklist pending={pending.length} signed={!!signatures.tenant} analysing={analysing} /> : <Portfolio />}
        </div>
      </section>

      {pending.filter((o) => !o.pre_existing).length > 0 && (
        <section>
          <SectionTitle eyebrow="Needs a decision" title="Lowest-confidence findings first" action={<Link href="/review" className="btn-ghost h-8 text-[12px]">Open review <ArrowRight className="size-3.5" /></Link>} />
          <div className="card divide-y divide-line">
            {pending.filter((o) => !o.pre_existing).sort((a, b) => a.confidence - b.confidence).slice(0, 4).map((o) => {
              const a = assets.find((x) => x.id === o.asset_id)!;
              const room = rooms.find((r) => r.id === a.room_id);
              return (
                <Link key={o.id} href={`/review?o=${o.id}`} className="flex items-center gap-4 p-3 transition hover:bg-surface-2/60">
                  <Crop src={a.thumb} bbox={o.bbox} imgW={a.width} imgH={a.height} className="w-12 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{o.description}</div>
                    <div className="text-[12px] text-ink-3">{room?.name} · {o.sub_area}</div>
                  </div>
                  <Confidence value={o.confidence} className="hidden sm:inline-flex" />
                  <ArrowRight className="size-4 text-ink-3" />
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function TenantChecklist({ pending, signed, analysing }: { pending: number; signed: boolean; analysing: number }) {
  const { baseline, current } = reportPair();
  const steps = [
    { done: !!baseline, label: "Move-in baseline", detail: baseline ? fmtDate(baseline.captured_at) : "Not captured yet" },
    { done: !!current, label: "Latest inspection captured", detail: current ? `${INSPECTION_LABEL[current.type]} · ${fmtDate(current.captured_at)}` : "Not yet" },
    { done: analysing === 0 && !!current, active: analysing > 0, label: "Analysis", detail: analysing ? `${analysing} photo${analysing === 1 ? "" : "s"} running` : "Complete" },
    { done: pending === 0 && !!current, label: "Review findings", detail: pending ? `${pending} waiting` : "All reviewed" },
    { done: signed, label: "Sign the report", detail: signed ? "Signed" : "Both parties sign one SHA-256" },
  ];
  return (
    <div>
      <SectionTitle eyebrow="Your checklist" title="Tenancy record" />
      <div className="card p-4">
        <ol className="space-y-3.5">
          {steps.map((s) => (
            <li key={s.label} className="flex gap-3">
              {s.done ? <CheckCircle2 className="mt-0.5 size-[18px] text-ok" /> : s.active ? <Loader2 className="mt-0.5 size-[18px] animate-spin text-signal" /> : <Circle className="mt-0.5 size-[18px] text-line" />}
              <div>
                <div className={cn("text-[13px] font-medium", s.done && "text-ink-2")}>{s.label}</div>
                <div className="text-[12px] text-ink-3">{s.detail}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Portfolio() {
  const current = getProperty();
  return (
    <div>
      <SectionTitle eyebrow="Portfolio" title="Properties" />
      <div className="card divide-y divide-line">
        {getProperties().map((p) => (
          <div key={p.id} className="flex items-center gap-3 p-3">
            {p.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.cover} alt="" className="size-10 rounded-lg object-cover" />
            ) : (
              <span className="grid size-10 place-items-center rounded-lg bg-surface-2 text-ink-3"><Building2 className="size-4" /></span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{p.address_label} <span className="font-normal text-ink-3">· {p.unit_label}</span></div>
              <div className="text-[12px] text-ink-3">{p.id === current.id ? "Selected" : "Switch from the sidebar"}</div>
            </div>
            {p.status === "move_out_in_progress" && <span className="chip border-signal/30 text-signal">Move-out</span>}
            {p.status === "no_inspections" && <span className="chip"><CircleDashed className="size-3" /> No baseline yet</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
