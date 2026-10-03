"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, Camera, Check, ChevronDown, Copy, Film, Loader2, Plus, RotateCcw, Send, ShieldCheck, SkipForward, Trash2, Video } from "lucide-react";
import { measureQuality, type Quality } from "@/lib/quality";
import { sha256Hex, cn, fmtDate } from "@/lib/utils";

interface Shot { id: string; label: string; prompt: string; tip: string; status: "done" | "skipped" | "todo"; thumb: string | null }
interface Room { id: string; name: string; category: string; shots: Shot[]; damage: { id: string; thumb: string | null }[]; damage_max: number; photos: number }
interface State {
  name: string; address: string; created_at: string; scope: "w" | "r";
  rooms: Room[]; progress: { done: number; total: number; photos: number };
  sealed: { hash: string; at: string; photos: number; missing: number } | null;
}
type Step = "check" | "seal" | "upload" | "save";
const STEP_TEXT: Record<Step, string> = { check: "Checking the photo…", seal: "Fingerprinting…", upload: "Uploading…", save: "Saving…" };

/** The guided walk: the phone tells you what to photograph, room by room. The link is the permission. */
export default function KitWalk() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [work, setWork] = useState<Record<string, { step: Step; progress: number }>>({});
  const [quality, setQuality] = useState<Record<string, Quality>>({});
  const [problem, setProblem] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const [sealing, setSealing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [videoWork, setVideoWork] = useState<Record<string, { phase: "uploading" | "extracting"; progress: number }>>({});
  const [videoProblem, setVideoProblem] = useState<Record<string, string>>({});
  const videoInput = useRef<HTMLInputElement>(null);
  const videoTarget = useRef<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const target = useRef<{ roomId: string; shotId: string } | null>(null);
  const opened = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/kit/${token}`, { cache: "no-store" });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || "This kit link is not valid.");
      if (b.scope === "r") { router.replace(`/k/${token}/report`); return; }
      setData(b);
      if (!opened.current) {
        opened.current = true;
        setOpen((b.rooms.find((x: Room) => x.shots.some((s) => s.status === "todo")) ?? b.rooms[0])?.id ?? null);
      }
    } catch (e: any) {
      setError(e?.message || "Could not reach the server.");
    }
  }, [token, router]);
  useEffect(() => { void load(); }, [load]);

  const pick = (roomId: string, shotId: string) => { target.current = { roomId, shotId }; input.current?.click(); };

  async function upload(roomId: string, shotId: string, file: File) {
    const key = `${roomId}:${shotId}`;
    const set = (step: Step, progress = 0) => setWork((w) => ({ ...w, [key]: { step, progress } }));
    setProblem((p) => { const { [key]: _x, ...rest } = p; return rest; });
    if (!file.type.startsWith("image/")) { setProblem((p) => ({ ...p, [key]: "Please choose a photo." })); return; }
    if (file.size > 30 * 1024 * 1024) { setProblem((p) => ({ ...p, [key]: "That photo is too large (over 30 MB)." })); return; }
    try {
      set("check");
      try {
        const bmp = await createImageBitmap(file);
        setQuality((q) => ({ ...q, [key]: measureQuality(bmp, bmp.width, bmp.height) }));
      } catch { /* some browsers cannot decode every format; the check is advice only */ }
      set("seal");
      const sha256 = await sha256Hex(await file.arrayBuffer());
      set("upload");
      const sr = await fetch(`/api/kit/${token}/sign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room_id: roomId }) });
      const sig = await sr.json();
      if (!sr.ok) throw new Error(sig.error || "Could not prepare the upload.");
      const up = await new Promise<any>((resolve, reject) => {
        const form = new FormData();
        form.append("file", file);
        for (const k of ["apiKey", "timestamp", "signature", "folder", "tags"]) form.append(k === "apiKey" ? "api_key" : k, String(sig[k]));
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`);
        xhr.upload.onprogress = (e) => e.lengthComputable && set("upload", Math.round((e.loaded / e.total) * 100));
        xhr.onload = () => { try { const b = JSON.parse(xhr.responseText); xhr.status < 300 ? resolve(b) : reject(new Error(b?.error?.message || "Upload failed.")); } catch { reject(new Error("Upload failed.")); } };
        xhr.onerror = () => reject(new Error("No connection. Check your internet and try again."));
        xhr.send(form);
      });
      set("save");
      const rr = await fetch(`/api/kit/${token}/photo`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: roomId, shot_id: shotId, cloudinary_public_id: up.public_id, secure_url: up.secure_url, etag: up.etag, sha256, width: up.width, height: up.height }),
      });
      const rb = await rr.json();
      if (!rr.ok) throw new Error(rb.error || "Could not save the photo.");
      await load();
    } catch (e: any) {
      setProblem((p) => ({ ...p, [key]: e?.message || String(e) }));
    } finally {
      setWork((w) => { const { [key]: _x, ...rest } = w; return rest; });
    }
  }

  async function skip(roomId: string, shotId: string) {
    setProblem((p) => { const { [`${roomId}:${shotId}`]: _x, ...rest } = p; return rest; }); // an old error no longer applies
    const r = await fetch(`/api/kit/${token}/skip`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room_id: roomId, shot_id: shotId }) });
    if (r.ok) await load();
  }

  async function removePhoto(roomId: string, shotId: string) {
    if (!window.confirm("Remove this photo? It is deleted from your kit. You can take a new one.")) return;
    setProblem((p) => { const { [`${roomId}:${shotId}`]: _x, ...rest } = p; return rest; });
    const r = await fetch(`/api/kit/${token}/remove`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room_id: roomId, shot_id: shotId }) });
    if (r.ok) await load();
    else { const b = await r.json().catch(() => ({})); setProblem((p) => ({ ...p, [`${roomId}:${shotId}`]: b.error || "Could not remove the photo." })); }
  }

  async function seal() {
    setSealing(true);
    try {
      const r = await fetch(`/api/kit/${token}/seal`, { method: "POST" });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || "Could not seal the kit.");
      router.push(`/k/${token}/report`);
    } catch (e: any) {
      setConfirm(false);
      setError(e?.message || String(e));
      setSealing(false);
    }
  }

  async function uploadVideo(roomId: string, file: File) {
    setVideoProblem((p) => { const { [roomId]: _x, ...rest } = p; return rest; });
    if (!file.type.startsWith("video/")) { setVideoProblem((p) => ({ ...p, [roomId]: "Please choose a video file." })); return; }
    if (file.size > 200 * 1024 * 1024) { setVideoProblem((p) => ({ ...p, [roomId]: "That video is too large (over 200 MB). Trim it to under 60 seconds." })); return; }
    setVideoWork((w) => ({ ...w, [roomId]: { phase: "uploading", progress: 0 } }));
    try {
      const sr = await fetch(`/api/kit/${token}/video-sign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room_id: roomId }) });
      const sig = await sr.json();
      if (!sr.ok) throw new Error(sig.error || "Could not prepare the upload.");
      const up = await new Promise<any>((resolve, reject) => {
        const form = new FormData();
        form.append("file", file);
        form.append("api_key", String(sig.apiKey));
        form.append("timestamp", String(sig.timestamp));
        form.append("signature", sig.signature);
        form.append("folder", sig.folder);
        form.append("tags", sig.tags);
        form.append("allowed_formats", sig.allowed_formats);
        form.append("max_duration", String(sig.max_duration));
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `https://api.cloudinary.com/v1_1/${sig.cloudName}/video/upload`);
        xhr.upload.onprogress = (e) => e.lengthComputable && setVideoWork((w) => ({ ...w, [roomId]: { phase: "uploading", progress: Math.round((e.loaded / e.total) * 100) } }));
        xhr.onload = () => { try { const b = JSON.parse(xhr.responseText); xhr.status < 300 ? resolve(b) : reject(new Error(b?.error?.message || "Upload failed.")); } catch { reject(new Error("Upload failed.")); } };
        xhr.onerror = () => reject(new Error("No connection. Check your internet and try again."));
        xhr.send(form);
      });
      setVideoWork((w) => ({ ...w, [roomId]: { phase: "extracting", progress: 0 } }));
      const pr = await fetch(`/api/kit/${token}/video-process`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: roomId, cloudinary_public_id: up.public_id, duration_seconds: up.duration ?? 30 }),
      });
      const pb = await pr.json();
      if (!pr.ok) throw new Error(pb.error || "Frame extraction failed.");
      await load();
    } catch (e: any) {
      setVideoProblem((p) => ({ ...p, [roomId]: e?.message || String(e) }));
    } finally {
      setVideoWork((w) => { const { [roomId]: _x, ...rest } = w; return rest; });
    }
  }

  const pageUrl = typeof window !== "undefined" ? window.location.href : "";
  const copyLink = async () => { try { await navigator.clipboard.writeText(pageUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {} };

  if (error && !data) {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center">
        <div><AlertTriangle className="mx-auto mb-3 size-8 text-warn" /><h1 className="h-display text-[34px]">Link not found</h1><p className="mt-2 text-[14px] text-ink-2">{error}</p><Link href="/kit" className="btn-primary mt-5">Start a new kit</Link></div>
      </main>
    );
  }
  if (!data) return <main className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin text-ink-3" /></main>;

  const { progress, rooms } = data;
  const allRoomsHavePhotos = rooms.every((r) => r.photos > 0);
  const todo = progress.total - progress.done;

  if (data.sealed) {
    return (
      <main className="mx-auto max-w-xl px-5 py-10 text-center">
        <ShieldCheck className="mx-auto mb-3 size-10 text-ok" />
        <h1 className="h-display text-[40px]">Your record is sealed.</h1>
        <p className="mt-2 text-[14px] text-ink-2">Sealed {fmtDate(data.sealed.at, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} · {data.sealed.photos} photos</p>
        <Link href={`/k/${token}/report`} className="btn-signal mt-6 h-12 px-6">Open and send my record</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 pb-32 pt-5">
      <div className="eyebrow">Move-in kit</div>
      <h1 className="h-display mt-1 text-[36px] leading-none">{data.name}&apos;s home</h1>
      <div className="mt-4" aria-label="Progress">
        <div className="mb-1 flex justify-between text-[12px]"><span className="text-ink-3">Photographed</span><span className="font-mono" data-testid="kit-progress">{progress.done} / {progress.total}</span></div>
        <div className="h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-signal transition-[width] duration-500" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
      </div>

      <div className="card mt-4 flex items-center gap-2 p-3 text-[12px] leading-snug text-ink-2">
        <span className="flex-1">This page&apos;s link is how you come back — keep it private.</span>
        <button onClick={copyLink} className="btn-outline h-8 px-2.5 text-[12px]">{copied ? <><Check className="size-3.5" /> Copied</> : <><Copy className="size-3.5" /> Copy</>}</button>
        <a href={`https://wa.me/?text=${encodeURIComponent(`My RentalMove move-in kit (private link): ${pageUrl}`)}`} target="_blank" rel="noreferrer" className="btn-outline h-8 px-2.5 text-[12px]"><Send className="size-3.5" /> To myself</a>
      </div>

      {error && <p className="mt-3 rounded-lg bg-danger/[.07] px-3 py-2 text-[12.5px] text-danger" role="alert">{error}</p>}

      <ul className="mt-5 space-y-3">
        {rooms.map((room) => {
          const done = room.shots.filter((s) => s.status === "done").length;
          const isOpen = open === room.id;
          return (
            <li key={room.id} className="card overflow-hidden" data-testid={`room-${room.category}`}>
              <button onClick={() => setOpen(isOpen ? null : room.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left" aria-expanded={isOpen}>
                <span className={cn("grid size-7 place-items-center rounded-full text-[11px] font-mono", done === room.shots.length ? "bg-ok text-white" : "bg-surface-2 text-ink-2")}>{done === room.shots.length ? <Check className="size-3.5" /> : done}</span>
                <span className="flex-1 text-[15px] font-semibold">{room.name}</span>
                <span className="font-mono text-[12px] text-ink-3">{done}/{room.shots.length}</span>
                <ChevronDown className={cn("size-4 text-ink-3 transition", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="border-t border-line px-4 pb-4">
                  <ul className="divide-y divide-line/70">
                    {room.shots.map((s) => {
                      const key = `${room.id}:${s.id}`, w = work[key], q = quality[key];
                      return (
                        <li key={s.id} className="flex gap-3 py-3" data-testid={`shot-${s.id}`} data-status={s.status}>
                          <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-2 text-ink-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {s.thumb ? <img src={s.thumb} alt="" className="size-full object-cover" /> : <Camera className="size-5" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2"><span className="text-[14px] font-medium">{s.label}</span>{s.status === "done" && <Check className="size-3.5 text-ok" />}{s.status === "skipped" && <span className="chip">skipped</span>}</div>
                            <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{s.prompt}</p>
                            <p className="mt-0.5 text-[11px] leading-snug text-ink-3">{s.tip}</p>
                            {w && <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-ink-2"><Loader2 className="size-3.5 animate-spin" />{STEP_TEXT[w.step]}{w.step === "upload" && w.progress ? ` ${w.progress}%` : ""}</p>}
                            {!w && q && q.verdict !== "ok" && <p className="mt-1.5 text-[12px] text-warn">{q.verdict === "too_dark" ? "Quite dark — a retake with more light would help." : q.verdict === "blurry" ? "A bit blurry — hold steady and retake if you can." : "Overexposed — try again from another angle."}</p>}
                            {problem[key] && <p className="mt-1.5 text-[12px] text-danger" role="alert">{problem[key]}</p>}
                            {!w && (
                              <div className="mt-2 flex gap-2">
                                {s.status === "done" ? (
                                  <>
                                    <button className="btn-ghost h-8 px-2.5 text-[12px]" onClick={() => pick(room.id, s.id)} data-testid={`retake-${s.id}`}><RotateCcw className="size-3.5" /> Retake</button>
                                    <button className="btn-ghost h-8 px-2.5 text-[12px] text-danger" onClick={() => removePhoto(room.id, s.id)} data-testid={`remove-${s.id}`}><Trash2 className="size-3.5" /> Remove</button>
                                  </>
                                ) : (
                                  <>
                                    <button className="btn-signal h-9 px-3.5 text-[13px]" onClick={() => pick(room.id, s.id)} data-testid={`take-${s.id}`}><Camera className="size-4" /> Take photo</button>
                                    {s.status === "todo" && <button className="btn-ghost h-9 px-2.5 text-[12px]" onClick={() => skip(room.id, s.id)}><SkipForward className="size-3.5" /> Skip</button>}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-3 rounded-xl border border-dashed border-line p-3">
                    <div className="text-[13px] font-medium">Damage that is already there</div>
                    <p className="mt-0.5 text-[12px] text-ink-3">Scratches, stains, cracks — photograph them close up so they are on record from day one.</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {room.damage.map((d) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <button key={d.id} onClick={() => pick(room.id, d.id)} className="relative size-14 overflow-hidden rounded-lg bg-surface-2" aria-label="Retake this close-up">{d.thumb && <img src={d.thumb} alt="" className="size-full object-cover" />}</button>
                      ))}
                      {room.damage.length < room.damage_max && (
                        <button className="btn-outline h-9 px-3 text-[12.5px]" onClick={() => pick(room.id, `damage-${room.damage.length + 1}`)} disabled={!!work[`${room.id}:damage-${room.damage.length + 1}`]}>
                          {work[`${room.id}:damage-${room.damage.length + 1}`] ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Add a close-up
                        </button>
                      )}
                    </div>
                    {Object.entries(problem).filter(([k]) => k.startsWith(`${room.id}:damage-`)).map(([k, m]) => <p key={k} className="mt-1.5 text-[12px] text-danger" role="alert">{m}</p>)}
                  </div>

                  {/* ── Film a room (alternative to individual photos) ── */}
                  <div className="mt-3 rounded-xl border border-dashed border-line p-3">
                    <div className="flex items-center gap-2">
                      <Film className="size-4 shrink-0 text-ink-3" />
                      <div className="text-[13px] font-medium">Film a room instead</div>
                    </div>
                    <p className="mt-1 text-[12px] leading-snug text-ink-3">
                      Film a slow 30–45 s walk around the room. We&apos;ll extract the best frame for each checklist item automatically.
                    </p>
                    {videoWork[room.id] ? (
                      <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-2">
                        <Loader2 className="size-3.5 animate-spin" />
                        {videoWork[room.id].phase === "uploading"
                          ? `Uploading… ${videoWork[room.id].progress}%`
                          : "Extracting frames — this takes up to 25 s…"}
                      </p>
                    ) : (
                      <button
                        className="btn-outline mt-2 h-9 px-3 text-[12.5px]"
                        data-testid={`film-${room.id}`}
                        onClick={() => { videoTarget.current = room.id; videoInput.current?.click(); }}
                      >
                        <Video className="size-3.5" /> Film this room
                      </button>
                    )}
                    {videoProblem[room.id] && <p className="mt-1.5 text-[12px] text-danger" role="alert">{videoProblem[room.id]}</p>}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <input ref={input} type="file" accept="image/*" capture="environment" hidden data-testid="kit-file" onChange={(e) => { const f = e.target.files?.[0]; const t = target.current; e.target.value = ""; if (f && t) void upload(t.roomId, t.shotId, f); }} />
      <input ref={videoInput} type="file" accept="video/*" capture="environment" hidden data-testid="kit-video-file" onChange={(e) => { const f = e.target.files?.[0]; const r = videoTarget.current; e.target.value = ""; if (f && r) void uploadVideo(r, f); }} />

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1 text-[12px] leading-snug text-ink-3">{allRoomsHavePhotos ? (todo ? `${todo} item${todo === 1 ? "" : "s"} not photographed yet — you can skip them.` : "Everything is photographed.") : "Add at least one photo in every room to finish."}</div>
          <button className="btn-primary h-11 px-5" disabled={!allRoomsHavePhotos || Object.keys(work).length > 0} onClick={() => setConfirm(true)} data-testid="kit-seal">Seal my record</button>
        </div>
      </div>

      {confirm && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex overflow-y-auto bg-black/50 p-4 backdrop-blur-[2px]" onMouseDown={() => !sealing && setConfirm(false)}>
          <div className="card m-auto w-full max-w-sm p-5" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Seal my record">
            <ShieldCheck className="mb-2 size-6" />
            <h2 className="text-[17px] font-semibold">Seal this record?</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">Sealing fingerprints all {progress.photos} photos together and freezes the kit: you can&apos;t add or replace photos afterwards.{todo ? ` ${todo} item${todo === 1 ? " is" : "s are"} not photographed and will be listed as such.` : ""}</p>
            <div className="mt-4 flex gap-2">
              <button className="btn-outline flex-1" onClick={() => setConfirm(false)} disabled={sealing}>Keep adding</button>
              <button className="btn-primary flex-1" onClick={seal} disabled={sealing} data-testid="kit-seal-confirm">{sealing ? <Loader2 className="size-4 animate-spin" /> : "Seal now"}</button>
            </div>
          </div>
        </div>, document.body)}
    </main>
  );
}
