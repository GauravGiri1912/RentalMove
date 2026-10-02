"use client";

import { VisitCompleteness, VisitPhotos } from "@/components/visit";
import { photoAbstain, roomCoverage } from "@/lib/insights";
import { isResolved } from "@/lib/coverage";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle, Camera, CameraOff, Check, CheckCircle2, Circle, Copy, Fingerprint, ImagePlus, Loader2, RotateCcw,
  ScanSearch, Upload, Ghost, Grid3x3, Crosshair, Plus, Smartphone, XCircle, CircleDashed, Lock, Ban,
} from "lucide-react";
import { api, useStudio } from "@/components/providers";
import { CategoryBadge, Confidence, Photo, Segmented } from "@/components/ui";
import { assetFor, assetsFor, getAsset, getCoverageSlot, getInspection, getInspections, getProperty, getRooms, getSubmitted, observationsFor, reportPair } from "@/lib/view";
import { measureQuality, type Quality, QUALITY_LIMITS } from "@/lib/quality";
import { align, lumaFromRGB, warp, type Gray } from "@/lib/pixel";
import { named } from "@/lib/cloudinary-urls";
import { cn, fmtBytes, fmtDate, INSPECTION_LABEL, sha256Hex, shortHash } from "@/lib/utils";
import type { InspectionType } from "@/lib/view-types";
import { HandoffButton } from "@/components/handoff";

type StageKey = "quality" | "seal" | "sign" | "upload" | "register" | "analyze";
type StageState = "idle" | "run" | "done" | "warn" | "fail";
const STAGES: { key: StageKey; label: string; where: string }[] = [
  { key: "quality", label: "Quality check", where: "device" },
  { key: "seal", label: "Seal · SHA-256 of original bytes", where: "device" },
  { key: "sign", label: "Sign upload parameters", where: "server" },
  { key: "upload", label: "Direct upload to Cloudinary", where: "browser → Cloudinary" },
  { key: "register", label: "Register evidence record", where: "server" },
  { key: "analyze", label: "Fingerprint · vision model · pixel grounding", where: "server" },
];

interface Run {
  name: string;
  preview: string;
  stages: Record<StageKey, StageState>;
  detail: Partial<Record<StageKey, string>>;
  progress: number;
  quality?: Quality;
  assetId?: string;
  error?: string;
}

export default function CapturePage() {
  return (
    <Suspense fallback={null}>
      <Capture />
    </Suspense>
  );
}

function Capture() {
  const params = useSearchParams();
  const { toast, refresh, view, user } = useStudio();
  const rooms = getRooms();
  const inspections = getInspections();
  const prop = getProperty();
  const { baseline } = reportPair();
  const [inspId, setInspId] = useState<string>(inspections[inspections.length - 1]?.id ?? "");
  const [roomId, setRoomId] = useState<string>(params.get("room") ?? rooms[0]?.id ?? "");
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];
  // After switching property the remembered visit may belong to the previous one: fall back to this property's latest.
  const insp = inspections.find((i) => i.id === inspId) ?? inspections[inspections.length - 1];
  const ghostAsset = room && baseline && baseline.id !== insp?.id ? assetFor(room.id, baseline.id) : undefined;
  const existing = room && insp ? assetFor(room.id, insp.id) : undefined;
  const cov = room && insp ? roomCoverage(room.id, insp.id, { strict: true }) : null;
  const submitted = insp ? getSubmitted(insp.id) : null;

  const [source, setSource] = useState<"camera" | "upload">("upload");
  const [ghost, setGhost] = useState(0.35);
  const [grid, setGrid] = useState(true);
  const [autoShutter, setAutoShutter] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [liveQuality, setLiveQuality] = useState<Quality | null>(null);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [newType, setNewType] = useState<InspectionType>(inspections.length ? "inspection" : "move_in");
  // The checklist item the next photo is filed under ("" = not decided, "__other" = something off the list).
  const [slot, setSlot] = useState<string>("");
  // Retake: the earlier photo of the chosen item, removed once its replacement has been saved.
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const slotItem = cov?.items.find((i) => i.key === slot) ?? null;
  const [creating, setCreating] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const ghostGray = useRef<Gray | null>(null);
  const steadySince = useRef<number | null>(null);

  // After each photo, move on to the next item that still has neither a photo nor a reason.
  useEffect(() => {
    if (!cov) { setSlot(""); return; }
    setSlot((cur) => cur === "__other" || cov.items.some((i) => i.key === cur && !i.covered && !i.resolved) ? cur : cov.items.find((i) => !i.covered && !i.resolved)?.key ?? "");
  }, [room?.id, insp?.id, cov?.covered, cov?.skipped]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- camera lifecycle -------------------------------------------------------
  useEffect(() => {
    if (source !== "camera") return;
    let live = true;
    setCameraError(null);
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 } } })
      .then((s) => {
        if (!live) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch((e) => setCameraError(e?.name === "NotAllowedError" ? "Camera permission was denied." : "No camera available on this device."));
    return () => { live = false; stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  }, [source]);

  // Ghost reference for the live alignment guide (small, greyscale).
  useEffect(() => {
    ghostGray.current = null;
    if (!ghostAsset) return;
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => { ghostGray.current = toGray(im, GUIDE_W); };
    im.src = named(ghostAsset.cloudinary_public_id, "rm_ghost");
  }, [ghostAsset?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const snap = useCallback(() => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob((b) => b && void process(b, `${room?.category}-${Date.now()}.jpg`), "image/jpeg", 0.92);
  }, [room]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live quality + alignment guide while the camera is open.
  useEffect(() => {
    if (source !== "camera" || run) return;
    const t = setInterval(() => {
      const v = video.current;
      if (!v || !v.videoWidth) return;
      setLiveQuality(measureQuality(v, v.videoWidth, v.videoHeight));
      if (ghostGray.current) {
        const g = computeGuide(ghostGray.current, toGray(v, GUIDE_W, ghostGray.current.h));
        setGuide(g);
        if (autoShutter && g.aligned) {
          steadySince.current ??= Date.now();
          if (Date.now() - steadySince.current > 900) { steadySince.current = null; snap(); }
        } else steadySince.current = null;
      }
    }, 450);
    return () => clearInterval(t);
  }, [source, run, autoShutter, snap]);

  // ---- the real pipeline -----------------------------------------------------
  const process = useCallback(async (blob: Blob, name: string) => {
    if (!room || !insp) return;
    if (submitted) { toast({ title: "This visit was already submitted", detail: "Start a new visit to add more photos.", tone: "danger" }); return; }
    const preview = URL.createObjectURL(blob);
    const stages = Object.fromEntries(STAGES.map((s) => [s.key, "idle"])) as Record<StageKey, StageState>;
    let state: Run = { name, preview, stages, detail: {}, progress: 0 };
    const set = (p: Partial<Run>) => {
      state = { ...state, ...p, stages: { ...state.stages, ...(p.stages ?? {}) }, detail: { ...state.detail, ...(p.detail ?? {}) } };
      setRun(state);
    };
    const stage = (k: StageKey, s: StageState, detail?: string) => set({ stages: { ...state.stages, [k]: s }, ...(detail ? { detail: { [k]: detail } } : {}) });
    const fail = (k: StageKey, msg: string) => { stage(k, "fail", msg); set({ error: msg }); toast({ title: "Capture failed", detail: msg, tone: "danger" }); };
    set({});

    // Pre-validate file format and size limits (UX level)
    if (blob.size > 20 * 1024 * 1024) {
      return fail("quality", "Image exceeds maximum allowed size of 20 MB.");
    }
    if (blob.type && !["image/jpeg", "image/png", "image/webp"].includes(blob.type)) {
      return fail("quality", "Only JPG, PNG, and WebP images are supported.");
    }

    // 1. Quality (device)
    stage("quality", "run");
    const bmp = await createImageBitmap(blob);
    const q = measureQuality(bmp, bmp.width, bmp.height);
    set({ quality: q });
    stage("quality", q.verdict === "ok" ? "done" : "warn", `brightness ${q.brightness.toFixed(0)} · sharpness ${q.sharpness.toFixed(0)} · ${bmp.width}×${bmp.height}`);

    // Pre-scale oversized images (width > 2400px) to optimize upload bandwidth while preserving evidence quality
    let uploadBlob = blob;
    const MAX_WIDTH = 2400;
    if (bmp.width > MAX_WIDTH) {
      const scale = MAX_WIDTH / bmp.width;
      const targetW = MAX_WIDTH;
      const targetH = Math.round(bmp.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(bmp, 0, 0, targetW, targetH);
        const scaledBlob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", 0.92)
        );
        if (scaledBlob) {
          uploadBlob = scaledBlob;
        }
      }
    }

    // 2. Seal (device) — Cryptographic fingerprint of the exact bytes being uploaded
    stage("seal", "run");
    const t0 = performance.now();
    const sha256 = await sha256Hex(await uploadBlob.arrayBuffer());
    stage("seal", "done", `${shortHash(sha256, 16)} · ${(performance.now() - t0).toFixed(1)} ms`);

    // 3. Sign (server)
    stage("sign", "run");
    let sig: any;
    try {
      const mimeFmt = uploadBlob.type.replace("image/", "");
      const fmt = mimeFmt === "jpeg" ? "jpg" : mimeFmt;
      sig = await api("/api/uploads/sign", {
        method: "POST",
        json: {
          property_id: prop.id,
          inspection_id: insp.id,
          room: room.category,
          file_size: uploadBlob.size,
          format: ["jpg", "jpeg", "png", "webp"].includes(fmt) ? fmt : undefined,
        },
      });
    } catch (e: any) { return fail("sign", e.message); }
    stage("sign", "done", `folder=${sig.folder} · tags=${sig.tags}`);

    // 4. Upload (browser → Cloudinary, signed)
    stage("upload", "run");
    let up: any;
    try {
      up = await uploadToCloudinary(uploadBlob, sig, (p) => set({ progress: p }));
    } catch (e: any) { return fail("upload", e.message); }
    stage("upload", "done", `${up.public_id} · ${fmtBytes(up.bytes)} · v${up.version}`);

    // 5. Register (server)
    stage("register", "run");
    let asset: any;
    try {
      asset = await api("/api/assets/register", {
        method: "POST",
        json: { property_id: prop.id, inspection_id: insp.id, room_id: room.id, cloudinary_public_id: up.public_id, secure_url: up.secure_url, etag: up.etag, sha256, width: up.width, height: up.height, captured_at: new Date().toISOString() },
      });
    } catch (e: any) { return fail("register", e.message); }
    set({ assetId: asset.id });
    if (slot && slot !== "__other") {
      try { await api(`/api/inspections/${insp.id}/coverage`, { method: "POST", json: { action: "assign", asset_id: asset.id, item: slot } }); }
      catch (e: any) { toast({ title: "Photo saved, but not filed under the checklist item", detail: e?.message, tone: "danger" }); }
    }
    if (replaceId) {
      try { await api(`/api/assets/${replaceId}`, { method: "DELETE" }); toast({ title: "Photo replaced", detail: "The earlier photo was removed.", tone: "ok" }); }
      catch (e: any) { toast({ title: "New photo saved, but the earlier one could not be removed", detail: e?.message, tone: "danger" }); }
      setReplaceId(null);
    }
    stage("register", "done", `asset ${asset.id} · analysis ${asset.analysis_status}`);
    stage("analyze", "run", "Cloudinary fingerprint → Groq vision → pixel grounding…");
    await refresh();
  }, [room, insp, prop.id, toast, refresh, slot, submitted, replaceId]);

  // Follow the server-side analysis through the live snapshot.
  const liveAsset = run?.assetId && view ? view.assets.find((a) => a.id === run.assetId) : undefined;
  // If the photo this panel is showing is removed (from the photo list), clear the panel instead of leaving it stuck on it.
  const seenRunAsset = useRef<string | null>(null);
  useEffect(() => {
    if (!run?.assetId || !view) return;
    if (liveAsset) seenRunAsset.current = run.assetId;
    else if (seenRunAsset.current === run.assetId) { seenRunAsset.current = null; setRun(null); }
  }, [run?.assetId, liveAsset?.id, view]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!run?.assetId || run.stages.analyze !== "run" || !liveAsset) return;
    if (liveAsset.analysis_status === "done" || liveAsset.analysis_status === "completed") {
      const n = observationsFor(liveAsset.id).length;
      setRun((r) => r && { ...r, stages: { ...r.stages, analyze: "done" }, detail: { ...r.detail, analyze: `${n} finding${n === 1 ? "" : "s"}${liveAsset.reused_of ? " · RE-USED PHOTO" : ""}` } });
      toast({ title: `${room?.name} captured`, detail: `${n} finding${n === 1 ? "" : "s"} · sha256 ${liveAsset.sha256.slice(0, 10)}…`, tone: "signal" });
    } else if (liveAsset.analysis_status === "quota_limited") {
      setRun((r) => r && { ...r, stages: { ...r.stages, analyze: "warn" }, detail: { ...r.detail, analyze: "AI quota limited (daily limit reached; manual retry available)" } });
    } else if (liveAsset.analysis_status === "retryable") {
      setRun((r) => r && { ...r, stages: { ...r.stages, analyze: "warn" }, detail: { ...r.detail, analyze: "Analysis interrupted (retryable)" } });
    } else if (liveAsset.analysis_status === "failed") {
      setRun((r) => r && { ...r, stages: { ...r.stages, analyze: "warn" }, detail: { ...r.detail, analyze: `Analysis failed: ${(liveAsset.analysis_error ?? "").slice(0, 140)}` } });
    }
  }, [liveAsset?.analysis_status, run?.assetId, run?.stages.analyze]); // eslint-disable-line react-hooks/exhaustive-deps
  // Fallback poll in case the live stream is unavailable.
  useEffect(() => {
    if (!run?.assetId || run.stages.analyze !== "run") return;
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [run?.assetId, run?.stages.analyze, refresh]);

  const reuploadBaseline = async () => {
    if (!ghostAsset) return;
    const b = await (await fetch(named(ghostAsset.cloudinary_public_id, "rm_jpeg"))).blob();
    void process(b, "reused-move-in-photo.jpg");
  };

  const onFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (f && f.type.startsWith("image/")) void process(f, f.name);
  };

  const createInspection = async () => {
    setCreating(true);
    try {
      const i = await api<{ id: string }>(`/api/properties/${prop.id}/inspections`, { method: "POST", json: { type: newType, status: "in_progress" } });
      await refresh();
      setInspId(i.id);
      toast({ title: `${INSPECTION_LABEL[newType]} inspection started`, tone: "signal" });
    } catch (e: any) {
      toast({ title: "Could not start the visit", detail: e?.message, tone: "danger" });
    } finally {
      setCreating(false);
    }
  };

  const busy = run && Object.values(run.stages).some((s) => s === "run") && run.stages.analyze !== "run";
  const finished = run && (run.stages.analyze === "done" || run.stages.analyze === "warn" || !!run.error);
  const resultObs = liveAsset ? observationsFor(liveAsset.id) : [];

  if (!room) return <p className="text-ink-3">This property has no rooms yet.</p>;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
        <div>
          <div className="eyebrow mb-2">{prop.address_label} · {insp ? `${INSPECTION_LABEL[insp.type]} · ${fmtDate(insp.captured_at)}` : "no inspection"}</div>
          <h1 className="h-display text-[44px] md:text-[56px]">Capture <em>{room.name.toLowerCase()}</em></h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={insp?.id ?? ""} onChange={(e) => { setInspId(e.target.value); setRun(null); }} className="input h-9 w-auto" aria-label="Inspection">
            {inspections.map((i) => <option key={i.id} value={i.id}>{INSPECTION_LABEL[i.type]} · {fmtDate(i.captured_at, { day: "numeric", month: "short", year: "numeric" })}</option>)}
          </select>
          <Segmented value={source} onChange={(v) => { setSource(v); setGuide(null); }} options={[{ value: "upload", label: <><Upload className="size-3.5" /> Upload</> }, { value: "camera", label: <><Camera className="size-3.5" /> Camera</> }]} />
          <HandoffButton inspectionId={insp?.id ?? inspId} roomId={room.id} />
        </div>
      </div>

      <details className="mb-5 rounded-xl border border-line bg-surface p-3 text-[13px]">
        <summary className="flex cursor-pointer items-center gap-2 font-medium"><Plus className="size-4" /> Start a new visit</summary>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Segmented size="sm" value={newType} onChange={setNewType} options={[{ value: "move_in", label: "Move-in" }, { value: "inspection", label: "Periodic" }, { value: "move_out", label: "Move-out" }]} />
          <button onClick={createInspection} disabled={creating} className="btn-primary h-8 text-[12px]">{creating ? <Loader2 className="size-3.5 animate-spin" /> : "Start"}</button>
          <span className="text-[12px] text-ink-3">as {user.name} · dated today</span>
        </div>
      </details>

      {/* Room stepper */}
      <ol className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {rooms.map((r) => {
          const captured = insp ? assetFor(r.id, insp.id) : undefined;
          const thumbAsset = captured ?? (baseline ? assetFor(r.id, baseline.id) : undefined);
          const rc = insp && insp.status === "in_progress" ? roomCoverage(r.id, insp.id, { strict: true }) : null;
          const done = rc ? isResolved(rc) : !!captured;
          return (
            <li key={r.id}>
              <button onClick={() => { setRoomId(r.id); setRun(null); setGuide(null); }} className={cn("flex w-full items-center gap-2.5 rounded-xl border p-2.5 text-left transition", r.id === room.id ? "border-ink bg-surface shadow-card" : "border-line hover:bg-surface")}>
                {thumbAsset ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={named(thumbAsset.cloudinary_public_id, "rm_tile")} alt="" className="size-9 rounded-md object-cover" />
                ) : <span className="grid size-9 place-items-center rounded-md bg-surface-2"><Camera className="size-4 text-ink-3" /></span>}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium">{r.name}</div>
                  <div className={cn("text-[11px]", rc && !done && captured ? "text-warn" : "text-ink-3")}>{rc ? (done ? "Complete" : captured ? `${rc.covered + rc.skipped}/${rc.total} areas` : "Not started") : captured ? "Captured" : "To do"}</div>
                </div>
                {done ? <CheckCircle2 className="size-4 text-ok" /> : captured ? <CircleDashed className="size-4 text-warn" /> : <Circle className="size-4 text-line" />}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-3">
          <div className="card p-2">
            {finished && liveAsset && liveAsset.analysis_status === "done" ? (
              <Photo src={liveAsset.src} alt="Captured" observations={resultObs} className="aspect-[1200/896]" />
            ) : run ? (
              <Photo src={run.preview} alt="Processing" scanning={run.stages.analyze === "run"} className="aspect-[1200/896]" />
            ) : source === "camera" ? (
              <div data-tour="cap-frame" className="relative aspect-[1200/896] overflow-hidden rounded-xl bg-black">
                {cameraError ? (
                  <div className="absolute inset-0 grid place-items-center p-6 text-center text-white/80">
                    <div><CameraOff className="mx-auto mb-2 size-6" /><div className="text-[14px]">{cameraError}</div><button className="btn mt-3 border border-white/20 text-white hover:bg-white/10" onClick={() => setSource("upload")}>Upload a photo instead</button></div>
                  </div>
                ) : (
                  <video ref={video} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" />
                )}
                {ghostAsset && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ghostAsset.src} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover mix-blend-screen" style={{ opacity: ghost }} />
                )}
                {grid && <GridLines />}
                {liveQuality && <QualityPill q={liveQuality} />}
                {guide && <GuidePill g={guide} />}
                <button onClick={snap} disabled={!!cameraError} aria-label="Take photo" className={cn("absolute bottom-4 left-1/2 grid size-16 -translate-x-1/2 place-items-center rounded-full border-4 bg-white/20 backdrop-blur transition hover:bg-white/35 active:scale-95 disabled:opacity-40", guide?.aligned ? "border-ok" : "border-white/80")}>
                  <span className="size-11 rounded-full bg-white" />
                </button>
              </div>
            ) : (
              <div
                data-tour="cap-frame"
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
                className={cn("relative grid aspect-[1200/896] place-items-center overflow-hidden rounded-xl border-2 border-dashed transition", dragOver ? "border-signal bg-signal/[.04]" : "border-line")}
              >
                {ghostAsset && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ghostAsset.src} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover grayscale" style={{ opacity: ghost * 0.5 }} />
                )}
                {grid && <GridLines dark />}
                <div className="relative px-4 text-center">
                  <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-surface shadow-card"><ImagePlus className="size-5" /></span>
                  <div className="text-[15px] font-semibold">{replaceId ? "Drop the new photo of the " : "Drop a photo of the "}{slotItem ? slotItem.label.toLowerCase() : room.name.toLowerCase()}{slotItem ? ` (${room.name.toLowerCase()})` : ""}</div>
                  <p className="mt-1 text-[13px] text-ink-2">{ghostAsset ? "Match the faded move-in shot behind this box." : "This becomes the baseline for later visits."}</p>
                  {existing && <p className="mt-1 text-[12px] text-warn">This room already has a photo for this visit; a new one is added alongside.</p>}
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <button className="btn-primary" onClick={() => fileInput.current?.click()}>Choose file</button>
                    {ghostAsset && <button className="btn-outline" onClick={reuploadBaseline} title="Uploads the move-in photo again — the pipeline should flag it as re-used"><Copy className="size-4" /> Test: re-upload move-in photo</button>}
                  </div>
                  <input ref={fileInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFiles(e.target.files)} />
                </div>
              </div>
            )}
          </div>

          {!run && (
            <div className="card flex flex-wrap items-center gap-x-6 gap-y-3 p-3">
              <label className="flex flex-1 items-center gap-3 text-[12px] text-ink-2">
                <Ghost className="size-4 text-ink-3" /> Ghost of move-in
                <input type="range" min={0} max={0.8} step={0.01} value={ghost} onChange={(e) => setGhost(+e.target.value)} className="flex-1 accent-[rgb(var(--signal))]" aria-label="Ghost opacity" disabled={!ghostAsset} />
              </label>
              <label className="flex items-center gap-2 text-[12px] text-ink-2">
                <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} className="accent-[rgb(var(--signal))]" /> <Grid3x3 className="size-3.5" /> Grid
              </label>
              {source === "camera" && ghostAsset && (
                <label className="flex items-center gap-2 text-[12px] text-ink-2" title="Takes the photo automatically once the framing matches move-in">
                  <input type="checkbox" checked={autoShutter} onChange={(e) => setAutoShutter(e.target.checked)} className="accent-[rgb(var(--signal))]" /> <Crosshair className="size-3.5" /> Auto-shutter when aligned
                </label>
              )}
            </div>
          )}

          {room && insp && <VisitPhotos roomId={room.id} inspectionId={insp.id} />}

          {finished && (
            <div className="flex flex-wrap gap-2 animate-fade-up">
              <button className="btn-outline" onClick={() => setRun(null)}><RotateCcw className="size-4" /> Capture again</button>
              {rooms.findIndex((r) => r.id === room.id) < rooms.length - 1 && (
                <button className="btn-primary" onClick={() => { setRoomId(rooms[rooms.findIndex((r) => r.id === room.id) + 1].id); setRun(null); }}>Next room: {rooms[rooms.findIndex((r) => r.id === room.id) + 1].name}</button>
              )}
              <Link href="/review" className="btn-ghost"><ScanSearch className="size-4" /> Review findings</Link>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          {insp && <VisitSubmit insp={insp} />}
          {insp && <VisitCompleteness inspectionId={insp.id} />}
          {existing && photoAbstain(existing) && (
            <div className="card border-warn/40 p-4 text-[12.5px]" data-testid="capture-abstain">
              <div className="font-semibold text-warn">The AI could not judge this photo</div>
              <p className="mt-1 text-ink-2">{photoAbstain(existing)}. It made no findings rather than guessing — retake it from closer or with better light.</p>
            </div>
          )}
          {room && insp && <RoomChecklist room={room} insp={insp} slot={slot} onSlot={(k) => { setSlot(k); setReplaceId(null); if (!run || finished) setRun(null); }} onRetake={(k, id) => { setSlot(k); setReplaceId(id); if (!run || finished) setRun(null); }} replacing={!!replaceId} locked={!!submitted} />}
          <div className="card p-4" data-tour="cap-pipeline">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[13px] font-semibold">Pipeline</span>
              {run && <span className="max-w-[220px] truncate font-mono text-[11px] text-ink-3">{run.name}</span>}
            </div>
            <ol>
              {STAGES.map((s, i) => {
                const st = run?.stages[s.key] ?? "idle";
                return (
                  <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < STAGES.length - 1 && <span className={cn("absolute left-[9px] top-6 h-[calc(100%-20px)] w-px", st === "done" ? "bg-ok/40" : "bg-line")} />}
                    <span className="relative mt-0.5 grid size-[19px] shrink-0 place-items-center">
                      {st === "done" ? <CheckCircle2 className="size-[19px] text-ok" /> : st === "run" ? <Loader2 className="size-[19px] animate-spin text-signal" /> : st === "warn" ? <AlertTriangle className="size-[17px] text-warn" /> : st === "fail" ? <XCircle className="size-[18px] text-danger" /> : <Circle className="size-[17px] text-line" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn("text-[13px]", st === "idle" ? "text-ink-3" : "font-medium")}>{s.label}</span>
                        <span className="rounded border border-line px-1 font-mono text-[9.5px] uppercase tracking-wide text-ink-3">{s.where}</span>
                      </div>
                      {s.key === "upload" && st === "run" && (
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-signal transition-[width]" style={{ width: `${run?.progress ?? 0}%` }} /></div>
                      )}
                      {run?.detail[s.key] && <div className="mt-0.5 break-all font-mono text-[10.5px] leading-relaxed text-ink-3">{run.detail[s.key]}</div>}
                    </div>
                  </li>
                );
              })}
            </ol>
            {run?.quality && run.quality.verdict !== "ok" && (
              <p className="mt-3 rounded-lg bg-warn/[.08] p-2.5 text-[12px] text-warn">
                {run.quality.verdict === "too_dark" ? "This photo is too dark to judge surfaces. Turn on a light and retake." : run.quality.verdict === "blurry" ? "This photo looks blurry. Hold steady and retake." : "This photo is overexposed."} It is still kept as evidence.
              </p>
            )}
            {!run && <p className="text-[12px] leading-relaxed text-ink-3">Every step is real. The file goes straight from this browser to Cloudinary with a server-signed request — the API secret never reaches the browser.</p>}
            {busy && <div className="mt-3 h-px w-full overflow-hidden bg-line"><div className="h-full w-1/3 animate-shimmer bg-signal" /></div>}
          </div>

          {liveAsset?.reused_of && (
            <div className="flex gap-3 rounded-2xl border border-danger/30 bg-danger/[.05] p-4 text-[12.5px] animate-fade-up">
              <Copy className="mt-0.5 size-4 shrink-0 text-danger" />
              <div><div className="font-semibold text-danger">Re-used photo detected</div>This is the same image as an earlier capture ({getAsset(liveAsset.reused_of) ? `${INSPECTION_LABEL[getInspections().find((i) => i.id === getAsset(liveAsset.reused_of!)?.inspection_id)?.type ?? "inspection"]} photo` : liveAsset.reused_of}) — it cannot show the room&apos;s current condition.</div>
            </div>
          )}

          {finished && resultObs.length > 0 && (
            <div className="card divide-y divide-line animate-fade-up">
              <div className="p-3.5 text-[13px] font-semibold">What the pipeline found</div>
              {resultObs.map((o) => (
                <div key={o.id} className="p-3.5">
                  <div className="mb-1 flex items-center gap-1.5"><CategoryBadge c={o.category} />{o.pre_existing && <span className="chip">Matches move-in</span>}</div>
                  <p className="text-[12.5px] leading-relaxed">{o.description}</p>
                  <div className="mt-1.5"><Confidence value={o.confidence} /></div>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-2xl border border-dashed border-line p-4 text-[12px] leading-relaxed text-ink-3">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-ink-2"><Fingerprint className="size-3.5" /> Why seal before upload?</div>
            The hash is taken from the bytes on your device. If the stored original ever changes, its hash won&apos;t match the one in the report — and the Verify page will say so.
            <div className="mt-2 font-mono text-[10.5px]">quality limits: dark &lt; {QUALITY_LIMITS.dark} · blur &lt; {QUALITY_LIMITS.blur}</div>
            <div className="mt-1 flex items-center gap-1.5"><Smartphone className="size-3" /> On a phone? Use “Phone” to capture there and watch it arrive here.</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Smart checklist: what this room's photos should show, and what is still missing.
// ---------------------------------------------------------------------------

function RoomChecklist({ room, insp, slot, onSlot, onRetake, replacing, locked }: { room: { id: string; name: string }; insp: { id: string }; slot: string; onSlot: (k: string) => void; onRetake: (k: string, assetId: string) => void; replacing: boolean; locked: boolean }) {
  const { refresh, toast } = useStudio();
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const cov = roomCoverage(room.id, insp.id, { strict: true });
  if (!cov) return null;
  const draft = getInspection(insp.id)?.status === "in_progress";
  const call = async (key: string, json: Record<string, unknown>) => {
    setBusy(key);
    try {
      await api(`/api/inspections/${insp.id}/coverage`, { method: "POST", json });
      await refresh();
      setAsking(null); setReason("");
    } catch (e: any) {
      toast({ title: "Could not update the checklist", detail: e?.message, tone: "danger" });
    } finally { setBusy(null); }
  };
  return (
    <div className="card p-4" data-testid="room-checklist">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[13px] font-semibold">What this room needs</span>
        <span className={cn("chip ml-auto", isResolved(cov) ? "border-ok/40 text-ok" : "border-warn/40 text-warn")} data-testid="checklist-count">{cov.covered}/{cov.total} photographed{cov.skipped ? ` · ${cov.skipped} skipped` : ""}</span>
      </div>
      <p className="mb-3 text-[11.5px] leading-relaxed text-ink-3">{locked ? "This visit was submitted, so the checklist is locked." : "Choose what the next photo shows, then add it. One photo is not enough to judge a room: anything you cannot photograph needs a reason, and the report will say so."}</p>
      <ul className="space-y-2">
        {cov.items.map((i) => {
          const open = !i.covered && !i.resolved;
          return (
            <li key={i.key} className={cn("rounded-lg border p-2.5 text-[12px]", slot === i.key ? "border-ink bg-surface" : "border-line")} data-testid={`item-${i.key}`}>
              <div className="flex items-start gap-2">
                {i.covered ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ok" /> : i.resolved ? <Ban className="mt-0.5 size-3.5 shrink-0 text-ink-3" /> : <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-warn" />}
                <div className="min-w-0 flex-1">
                  <div className={cn("font-medium", !open && "text-ink-2")}>{i.label}
                    {i.covered && <span className="ml-1.5 font-normal text-ink-3">{i.source === "declared" ? "photographed" : "seen in a photo by the vision model"}</span>}
                    {i.resolved && <span className="ml-1.5 font-normal text-ink-3">{i.resolved.kind === "na" ? "not applicable" : "skipped"}{i.resolved.reason && i.resolved.kind === "skip" ? `: ${i.resolved.reason}` : ""}</span>}
                  </div>
                  {open && <div className="text-ink-3">{i.why}</div>}
                  {i.check && <div className="mt-0.5 text-warn" data-testid="item-check">{i.check}</div>}
                </div>
                {!locked && (
                  <div className="flex shrink-0 gap-1">
                    {!i.resolved && <button onClick={() => onSlot(i.key)} className={cn("rounded-md border px-2 py-1 text-[11px]", slot === i.key ? "border-ink bg-ink text-bg" : "border-line hover:border-ink-3")} data-testid={`pick-${i.key}`}>{slot === i.key ? "Next photo" : i.covered ? "Add another" : "Photograph"}</button>}
                    {draft && i.source === "declared" && (() => {
                      const old = assetsFor(room.id, insp.id).find((a) => getCoverageSlot(a.id) === i.key);
                      return old ? <button onClick={() => onRetake(i.key, old.id)} className={cn("rounded-md border px-2 py-1 text-[11px]", slot === i.key && replacing ? "border-ink bg-ink text-bg" : "border-line hover:border-ink-3")} data-testid={`retake-${i.key}`}>{slot === i.key && replacing ? "Retaking" : "Retake"}</button> : null;
                    })()}
                    {open && <button onClick={() => setAsking(asking === i.key ? null : i.key)} className="rounded-md border border-line px-2 py-1 text-[11px] hover:border-ink-3" data-testid={`skip-${i.key}`}>Can&apos;t</button>}
                    {i.resolved && <button onClick={() => call(i.key, { action: "unskip", room_id: room.id, item: i.key })} disabled={busy === i.key} className="rounded-md border border-line px-2 py-1 text-[11px] hover:border-ink-3" data-testid={`undo-${i.key}`}>Undo</button>}
                  </div>
                )}
              </div>
              {asking === i.key && !locked && (
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2">
                  <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Why? e.g. locked cupboard" aria-label="Reason" className="input h-8 min-w-[140px] flex-1 text-[12px]" data-testid="skip-reason" />
                  <button disabled={busy === i.key || reason.trim().length < 3} onClick={() => call(i.key, { action: "skip", room_id: room.id, item: i.key, kind: "skip", reason })} className="btn-primary h-8 text-[11.5px]" data-testid="skip-confirm">Skip with reason</button>
                  <button disabled={busy === i.key} onClick={() => call(i.key, { action: "skip", room_id: room.id, item: i.key, kind: "na" })} className="btn-outline h-8 text-[11.5px]" data-testid="na-confirm">Not in this room</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!locked && <button onClick={() => onSlot("__other")} className={cn("mt-2 text-[11.5px] underline", slot === "__other" && "font-semibold")}>{slot === "__other" ? "Next photo: something else" : "Photograph something else"}</button>}
    </div>
  );
}

/** Submit the visit: allowed only when every room has all items photographed or explained. The server checks again. */
function VisitSubmit({ insp }: { insp: { id: string; status: string } }) {
  const { refresh, toast } = useStudio();
  const [busy, setBusy] = useState(false);
  const sub = getSubmitted(insp.id);
  const rooms = getRooms();
  if (insp.status !== "in_progress" && !sub) return null;
  const rows = rooms.map((r) => { const c = roomCoverage(r.id, insp.id, { strict: true }); return { r, c, ok: c ? isResolved(c) : !!assetFor(r.id, insp.id) }; });
  const open = rows.filter((x) => !x.ok);
  const submit = async () => {
    setBusy(true);
    try {
      await api(`/api/inspections/${insp.id}/coverage`, { method: "POST", json: { action: "submit" } });
      await refresh();
      toast({ title: "Visit submitted", detail: "The checklist is now locked and the owner can review it.", tone: "ok" });
    } catch (e: any) {
      toast({ title: "Not ready to submit", detail: e?.message, tone: "danger" });
    } finally { setBusy(false); }
  };
  return (
    <div className={cn("card p-4", sub && "border-ok/40")} data-testid="visit-submit">
      {sub ? (
        <div className="flex items-start gap-2 text-[12.5px]"><Lock className="mt-0.5 size-4 text-ok" /><div><div className="font-semibold">Submitted{sub.by ? ` by ${sub.by}` : ""}</div><div className="text-ink-3">{fmtDate(sub.at)} · checklist locked</div><Link href={`/submission?visit=${insp.id}`} className="mt-1 inline-block underline" data-testid="view-submission">View what was submitted</Link>{sub.reopen_request && <div className="mt-1 text-info">Reopen requested: &ldquo;{sub.reopen_request.note}&rdquo;</div>}</div></div>
      ) : (
        <>
          <div className="text-[13px] font-semibold">Submit this visit</div>
          <p className="mt-0.5 text-[11.5px] text-ink-3" data-testid="submit-next">What happens next: your record is sealed and locked, and the owner reviews it and decides what goes into the report.</p>
          {open.length ? (
            <p className="mt-1 text-[12px] text-ink-2" data-testid="submit-blockers">Not ready: {open.map((x) => x.c ? `${x.r.name} (${x.c.items.filter((i) => !i.covered && !i.resolved).length} left)` : `${x.r.name} (no photo)`).join(" · ")}</p>
          ) : <p className="mt-1 text-[12px] text-ink-2">Every room is covered or explained. After you submit, this visit&apos;s checklist is locked.</p>}
          <button className="btn-primary mt-3 w-full" disabled={busy || open.length > 0} onClick={submit} data-testid="submit-visit">{busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Submit visit</button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signed direct upload with progress (XHR gives upload progress; fetch does not).
// ---------------------------------------------------------------------------

function uploadToCloudinary(blob: Blob, sig: any, onProgress: (p: number) => void): Promise<any> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", blob);
    form.append("api_key", sig.apiKey);
    form.append("timestamp", String(sig.timestamp));
    form.append("signature", sig.signature);
    form.append("folder", sig.folder);
    form.append("tags", sig.tags);
    if (sig.notificationUrl) form.append("notification_url", sig.notificationUrl);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new Error(body?.error?.message || `Cloudinary upload failed (${xhr.status})`));
      } catch { reject(new Error(`Cloudinary upload failed (${xhr.status})`)); }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(form);
  });
}

// ---------------------------------------------------------------------------
// Live alignment guide — the same pixel engine, on small frames.
// ---------------------------------------------------------------------------

const GUIDE_W = 200;

function toGray(src: CanvasImageSource & { width?: number; height?: number; videoWidth?: number; videoHeight?: number; naturalWidth?: number; naturalHeight?: number }, w: number, hFixed?: number): Gray {
  const sw = src.videoWidth || src.naturalWidth || src.width || w;
  const sh = src.videoHeight || src.naturalHeight || src.height || w;
  const h = hFixed ?? Math.round((w * sh) / sw);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.drawImage(src, 0, 0, w, h);
  return lumaFromRGB(x.getImageData(0, 0, w, h).data, w, h, 4);
}

interface Guide { match: number; dx: number; dy: number; scale: number; hint: string; aligned: boolean }

function computeGuide(ref: Gray, frame: Gray): Guide {
  const t = align(ref, frame, { maxShift: 0.2, scales: [0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15] });
  const w = warp(frame, t);
  // Normalised cross-correlation after alignment = how well the framing matches.
  let ma = 0, mb = 0;
  const n = ref.data.length;
  for (let i = 0; i < n; i++) { ma += ref.data[i]; mb += w.data[i]; }
  ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const a = ref.data[i] - ma, b = w.data[i] - mb; sab += a * b; saa += a * a; sbb += b * b; }
  const match = saa && sbb ? Math.max(0, sab / Math.sqrt(saa * sbb)) : 0;
  const dx = t.dx / ref.w, dy = t.dy / ref.h;
  // Content appears shifted right in the frame → the camera points too far left.
  const hints: string[] = [];
  if (t.scale > 1.04) hints.push("step back");
  else if (t.scale < 0.96) hints.push("step closer");
  if (dx > 0.03) hints.push("pan left");
  else if (dx < -0.03) hints.push("pan right");
  if (dy > 0.03) hints.push("tilt up");
  else if (dy < -0.03) hints.push("tilt down");
  const aligned = match > 0.75 && hints.length === 0;
  return { match, dx, dy, scale: t.scale, hint: hints.length ? hints.join(" · ") : match > 0.75 ? "aligned — hold steady" : "find the move-in view", aligned };
}

function GridLines({ dark }: { dark?: boolean }) {
  const c = dark ? "bg-ink/10" : "bg-white/35";
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className={cn("absolute inset-y-0 left-1/3 w-px", c)} /><div className={cn("absolute inset-y-0 left-2/3 w-px", c)} />
      <div className={cn("absolute inset-x-0 top-1/3 h-px", c)} /><div className={cn("absolute inset-x-0 top-2/3 h-px", c)} />
    </div>
  );
}

function QualityPill({ q }: { q: Quality }) {
  const ok = q.verdict === "ok";
  return (
    <div className={cn("absolute left-3 top-3 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11.5px] text-white backdrop-blur", ok ? "bg-black/50" : "bg-warn/90")}>
      {ok ? <Check className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
      {ok ? "Good light, steady" : q.verdict === "too_dark" ? "Too dark" : q.verdict === "blurry" ? "Hold steady" : "Too bright"}
      <span className="font-mono text-white/70">{q.brightness.toFixed(0)} · {q.sharpness.toFixed(0)}</span>
    </div>
  );
}

function GuidePill({ g }: { g: Guide }) {
  return (
    <div className={cn("absolute right-3 top-3 rounded-lg px-2.5 py-1.5 text-right text-[11.5px] text-white backdrop-blur", g.aligned ? "bg-ok/90" : "bg-black/55")}>
      <div className="flex items-center justify-end gap-1.5 font-medium"><Crosshair className="size-3.5" /> {g.hint}</div>
      <div className="font-mono text-[10px] text-white/75">match {(g.match * 100).toFixed(0)}% · shift {(g.dx * 100).toFixed(0)}/{(g.dy * 100).toFixed(0)}% · ×{g.scale.toFixed(2)}</div>
    </div>
  );
}
