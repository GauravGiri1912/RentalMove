"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Blend, Columns2, Loader2, Maximize2, ScanLine, SplitSquareHorizontal, Sparkles, Minimize2, ScanSearch, Info } from "lucide-react";
import { CompareViewer, type CompareMode, type DiffStats } from "@/components/compare-viewer";
import { Confidence, Kbd, PageHeader, Segmented } from "@/components/ui";
import { UrlExplain } from "@/components/hood";
import { CompareContext } from "@/components/compare-context";
import { assetFor, comparisonFor, getInspections, getProperty, getRooms } from "@/lib/view";
import { api, useStudio } from "@/components/providers";
import { Empty } from "@/components/ui";
import { GitCompareArrows, Play } from "lucide-react";
import { presetUrl } from "@/lib/cld";
import { cn, fmtDate, INSPECTION_LABEL } from "@/lib/utils";
import type { BBox } from "@/lib/view-types";

export default function ComparePage() {
  return (
    <Suspense fallback={null}>
      <Compare />
    </Suspense>
  );
}

const KIND_STYLE: Record<string, string> = {
  new: "bg-signal text-white",
  worsened: "bg-warn text-white",
  pixel: "bg-surface-2 text-ink-2 border border-line",
};
const KIND_LABEL: Record<string, string> = { new: "new", worsened: "worse", pixel: "pixel only" };

function Compare() {
  const params = useSearchParams();
  const router = useRouter();
  const rooms = getRooms();
  const inspections = getInspections();
  const { toast, refresh } = useStudio();
  // Default room: the first one captured at two or more visits.
  const comparable = rooms.filter((r) => inspections.filter((i) => assetFor(r.id, i.id)).length >= 2);
  const roomId = params.get("room") ?? comparable[0]?.id ?? rooms[0]?.id;
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];
  const available = inspections.filter((i) => assetFor(room.id, i.id));
  const [priorId, setPriorId] = useState(available[0]?.id ?? "");
  const [currentId, setCurrentId] = useState(available[available.length - 1]?.id ?? "");
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<CompareMode>("slider");
  const [focus, setFocus] = useState<BBox | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(0); // 0 = adaptive (engine default)
  const [normalize, setNormalize] = useState(true);
  const [diff, setDiff] = useState<DiffStats | null>(null);

  useEffect(() => {
    setPriorId(available[0]?.id ?? "");
    setCurrentId(available[available.length - 1]?.id ?? "");
    setFocus(null);
    setFocusId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "SELECT") return;
      const m = ({ "1": "slider", "2": "side", "3": "onion", "4": "diff" } as const)[e.key as "1"];
      if (m) setMode(m);
      if (e.key === "Escape") { setFocus(null); setFocusId(null); }
    };
    const onTour = (e: Event) => { if ((e as CustomEvent).detail === "compare:diff") setMode("diff"); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("rm:tour", onTour);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("rm:tour", onTour); };
  }, []);

  const prior = assetFor(room.id, priorId);
  const current = assetFor(room.id, currentId);
  const matchedUrl = useMemo(() => (prior?.cloudinary_public_id ? presetUrl(prior.cloudinary_public_id, "matched") : null), [prior]);

  if (available.length < 2 || !prior || !current) {
    return (
      <div>
        <PageHeader eyebrow={room?.name ?? "Compare"} title={<>What <em>changed</em>?</>} lede="Comparing needs the same room captured at two visits." />
        <Empty icon={<GitCompareArrows className="size-5" />} title={`${room?.name ?? "This room"} has only ${available.length} capture${available.length === 1 ? "" : "s"}`} body="Capture it again at the next visit and it can be compared with move-in." action={<Link href="/capture" className="btn-primary">Capture</Link>} />
      </div>
    );
  }

  const cmp = comparisonFor(room.id, prior.id, current.id);
  const changes = cmp?.changes ?? [];
  const boxes = changes.filter((c) => c.bbox).map((c, i) => ({ id: `c${i}`, bbox: c.bbox!, tone: (c.kind === "pixel" ? "muted" : "signal") as "muted" | "signal" }));
  const analysing = current.analysis_status === "running" || current.analysis_status === "queued";
  const priorInsp = inspections.find((i) => i.id === priorId)!;
  const currentInsp = inspections.find((i) => i.id === currentId)!;

  const runCompare = async () => {
    setRunning(true);
    try {
      await api("/api/comparisons", { method: "POST", json: { prior_asset_id: prior.id, current_asset_id: current.id, property_id: getProperty().id, room_id: room.id } });
      await refresh();
      toast({ title: `${room.name} compared`, detail: "Vision model + pixel grounding", tone: "signal" });
    } catch (e: any) {
      toast({ title: "Comparison failed", detail: e?.message, tone: "danger" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow={`${room.name} · ${INSPECTION_LABEL[priorInsp.type]} → ${INSPECTION_LABEL[currentInsp.type]}`}
        title={<>What <em>changed</em>?</>}
        lede="Two captures of the same room, matched frame for frame. Drag, blend, or let the pixels speak for themselves."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          value={room.id}
          onChange={(v) => router.replace(`/compare?room=${v}`)}
          options={rooms.map((r) => ({ value: r.id, label: r.name }))}
        />
        <div className="flex-1" />
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "slider", label: <><SplitSquareHorizontal className="size-3.5" /> Slider</>, hint: "1" },
            { value: "side", label: <><Columns2 className="size-3.5" /> Side by side</>, hint: "2" },
            { value: "onion", label: <><Blend className="size-3.5" /> Onion skin</>, hint: "3" },
            { value: "diff", label: <><ScanLine className="size-3.5" /> Pixel diff</>, hint: "4" },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <div className="card p-2" data-tour="cmp-viewer">
            <CompareViewer
              aspect={`${prior.width || 1200} / ${prior.height || 896}`}
              mode={mode}
              prior={prior.src}
              current={current.src}
              priorLabel={`${INSPECTION_LABEL[priorInsp.type]} ${new Date(priorInsp.captured_at).getFullYear()}`}
              currentLabel={`${INSPECTION_LABEL[currentInsp.type]} ${new Date(currentInsp.captured_at).getFullYear()}`}
              boxes={mode === "diff" ? [] : boxes}
              focus={focus}
              active={hover ?? focusId}
              onHoverBox={setHover}
              threshold={threshold}
              normalize={normalize}
              onDiff={setDiff}
            />
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-2 pb-1 pt-3 text-[12px] text-ink-3">
              <label className="flex items-center gap-2">
                Before
                <select value={priorId} onChange={(e) => setPriorId(e.target.value)} className="input h-8 w-auto text-[12px]">
                  {available.filter((i) => i.captured_at < currentInsp.captured_at).map((i) => <option key={i.id} value={i.id}>{INSPECTION_LABEL[i.type]} · {fmtDate(i.captured_at, { month: "short", year: "numeric" })}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2">
                After
                <select value={currentId} onChange={(e) => setCurrentId(e.target.value)} className="input h-8 w-auto text-[12px]">
                  {available.filter((i) => i.captured_at > priorInsp.captured_at).map((i) => <option key={i.id} value={i.id}>{INSPECTION_LABEL[i.type]} · {fmtDate(i.captured_at, { month: "short", year: "numeric" })}</option>)}
                </select>
              </label>
              {focus && (
                <button className="btn-ghost h-8 text-[12px]" onClick={() => { setFocus(null); setFocusId(null); }}><Minimize2 className="size-3.5" /> Reset zoom <Kbd>Esc</Kbd></button>
              )}
              <span className="ml-auto hidden items-center gap-1.5 md:flex"><Kbd>1</Kbd><Kbd>2</Kbd><Kbd>3</Kbd><Kbd>4</Kbd> modes</span>
            </div>
          </div>

          <CompareContext roomId={room.id} roomName={room.name} priorInsp={priorInsp} currentInsp={currentInsp} prior={prior} current={current} />

          {mode === "diff" && (
            <div className="card mt-3 grid grid-cols-1 gap-4 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center animate-fade-up">
              <label className="flex items-center gap-3 text-[12px]">
                <span className="w-20 text-ink-3">Sensitivity</span>
                <input type="range" min={0} max={40} value={threshold} onChange={(e) => setThreshold(+e.target.value)} className="flex-1 accent-[rgb(var(--signal))]" aria-label="Threshold (0 = auto)" />
                <span className="w-16 font-mono text-ink-2">{threshold === 0 ? `auto ${diff ? diff.threshold.toFixed(0) : ""}` : threshold}</span>
              </label>
              <label className="flex items-center gap-2 text-[12px] text-ink-2">
                <input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} className="accent-[rgb(var(--signal))]" /> Match exposure
              </label>
              <div className="font-mono text-[11.5px] text-ink-2">
                {diff ? <>{(diff.changedPct * 100).toFixed(2)}% px · {diff.regions.length} region{diff.regions.length === 1 ? "" : "s"} · shift {(diff.alignment.dx * 100).toFixed(1)}%/{(diff.alignment.dy * 100).toFixed(1)}% · ×{diff.alignment.scale.toFixed(3)} · {diff.ms.toFixed(0)} ms</> : "—"}
              </div>
              <p className="text-[12px] leading-relaxed text-ink-3 sm:col-span-3">
                Computed in your browser with the same engine the server uses: align (shift + zoom), local exposure match, misalignment-tolerant difference, then connected regions. Turn off exposure matching to see why it matters — lighting alone lights up the room.
                {diff && diff.regions.length > 0 && (
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {diff.regions.slice(0, 8).map((r, i) => (
                      <button key={i} className="chip hover:border-signal hover:text-signal" onClick={() => { setFocus(r); setFocusId(null); }}>Region {i + 1}</button>
                    ))}
                  </span>
                )}
              </p>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="card p-4" data-tour="cmp-ai">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="size-4 text-signal" />
              <span className="text-[13px] font-semibold">AI comparison</span>
              <span className="ml-auto font-mono text-[10.5px] text-ink-3">{cmp?.model_version}</span>
            </div>
            {running ? (
              <div className="flex items-center gap-2 py-4 text-[13px] text-ink-3"><Loader2 className="size-4 animate-spin text-signal" /> Comparing — vision model, then pixel grounding…</div>
            ) : analysing ? (
              <div className="flex items-center gap-2 py-4 text-[13px] text-ink-3"><Loader2 className="size-4 animate-spin text-signal" /> The newer photo is still being analysed.</div>
            ) : cmp ? (
              <>
                <p className="text-[13.5px] leading-relaxed">{cmp.summary}</p>
                <div className="mt-2 flex items-center justify-between text-[11px] text-ink-3">
                  <span>{fmtDate(cmp.created_at)} · {changes.filter((c) => c.grounded).length}/{changes.length} grounded on pixels</span>
                  <button onClick={runCompare} className="font-medium text-ink-2 hover:text-ink">Run again</button>
                </div>
              </>
            ) : (
              <div>
                <p className="flex gap-2 text-[13px] text-ink-3"><Info className="mt-0.5 size-4 shrink-0" /> No comparison for this pair yet. The vision model describes what changed; the pixel engine pins down where.</p>
                <button onClick={runCompare} className="btn-signal mt-3 w-full"><Play className="size-4" /> Run AI comparison</button>
              </div>
            )}
          </div>

          {changes.length > 0 && (
            <div className="card divide-y divide-line">
              {changes.map((c, i) => {
                const id = `c${i}`;
                const on = focusId === id || hover === id;
                return (
                  <button
                    key={id}
                    onMouseEnter={() => setHover(id)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => { if (focusId === id) { setFocus(null); setFocusId(null); } else { setFocus(c.bbox ?? null); setFocusId(id); if (mode === "diff") setMode("slider"); } }}
                    className={cn("flex w-full gap-3 p-3.5 text-left transition", on && "bg-surface-2/70")}
                  >
                    <span className={cn("mt-0.5 h-5 shrink-0 whitespace-nowrap rounded px-1.5 font-mono text-[10px] uppercase leading-5 tracking-wide", KIND_STYLE[c.kind])}>{KIND_LABEL[c.kind] ?? c.kind}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] leading-snug">{c.description}</div>
                      <div className="mt-1.5 flex items-center justify-between text-[11.5px] text-ink-3">
                        <span className="capitalize">{c.region}</span>
                        <Confidence value={c.confidence} />
                      </div>
                    </div>
                    <Maximize2 className={cn("mt-0.5 size-3.5 shrink-0 transition", on ? "text-ink" : "text-ink-3/50")} />
                  </button>
                );
              })}
            </div>
          )}

          {cmp && cmp.caveats.length > 0 && (
            <div className="rounded-2xl border border-line p-4">
              <div className="eyebrow mb-2 flex items-center gap-1.5"><AlertTriangle className="size-3" /> Caveats</div>
              <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-ink-2">
                {cmp.caveats.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </div>
          )}

          {matchedUrl && (
            <div className="rounded-2xl border border-dashed border-line p-4">
              <div className="eyebrow mb-2">Matched frame · Cloudinary</div>
              <p className="mb-2 text-[12px] leading-relaxed text-ink-3">Both captures go through the same crop and exposure transformation before the model compares them:</p>
              <UrlExplain url={matchedUrl} />
            </div>
          )}

          <Link href="/review" className="btn-primary w-full"><ScanSearch className="size-4" /> Review these findings</Link>
          {prior.staged || current.staged ? <p className="text-center text-[11px] text-ink-3">Later captures are staged demo imagery.</p> : null}
        </aside>
      </div>
    </div>
  );
}

