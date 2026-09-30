"use client";

// Voice notes on a finding: record in the browser, transcribe with the browser's own speech
// recognition where available (Chrome / Edge / Safari), upload the audio to Cloudinary with a
// signature scoped to this finding, and post it to the discussion. The transcript is editable
// before posting and is labelled as a browser transcription.

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square, Trash2, Send } from "lucide-react";
import { api, useStudio } from "./providers";
import { cn } from "@/lib/utils";
import type { VoiceClip } from "@/lib/view-types";

const MAX_SECONDS = 120;
const LANGS = [{ id: "en-IN", label: "English" }, { id: "hi-IN", label: "हिन्दी" }] as const;

type Phase = "idle" | "recording" | "review" | "sending";

function speechCtor(): any {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;
}

export function VoiceRecorder({ obsId }: { obsId: string }) {
  const { addComment, toast } = useStudio();
  const [phase, setPhase] = useState<Phase>("idle");
  const [lang, setLang] = useState<(typeof LANGS)[number]["id"]>("en-IN");
  const [secs, setSecs] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [canTranscribe, setCanTranscribe] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const sr = useRef<any>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const started = useRef(0);

  useEffect(() => { setCanTranscribe(!!speechCtor()); }, []);
  useEffect(() => () => { stopAll(); if (preview) URL.revokeObjectURL(preview); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function stopAll() {
    if (timer.current) clearInterval(timer.current);
    try { sr.current?.stop(); } catch {}
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast({ title: "Recording is not supported in this browser", tone: "danger" });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast({ title: "Microphone permission denied", tone: "danger" });
      return;
    }
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const b = new Blob(chunks, { type: r.mimeType || "audio/webm" });
      setBlob(b);
      setPreview(URL.createObjectURL(b));
      setPhase("review");
    };
    rec.current = r;
    setTranscript(""); setInterim(""); setSecs(0);
    r.start(250);
    started.current = Date.now();
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - started.current) / 1000);
      setSecs(s);
      if (s >= MAX_SECONDS) stop();
    }, 250);

    // Recording must work even where speech recognition exists but fails to start
    // (some browsers expose the API without a working service); transcription is optional.
    setPhase("recording");
    try {
      const Ctor = speechCtor();
      if (Ctor) {
        const s = new Ctor();
        s.lang = lang;
        s.continuous = true;
        s.interimResults = true;
        s.onresult = (ev: any) => {
          let fin = "", int = "";
          for (let i = 0; i < ev.results.length; i++) {
            const res = ev.results[i];
            if (res.isFinal) fin += res[0].transcript;
            else int += res[0].transcript;
          }
          setTranscript(fin.trim());
          setInterim(int);
        };
        s.onerror = () => {};
        s.start();
        sr.current = s;
      }
    } catch {
      sr.current = null;
    }
  }

  function stop() {
    stopAll();
    setInterim("");
  }

  function discard() {
    if (preview) URL.revokeObjectURL(preview);
    setBlob(null); setPreview(null); setTranscript(""); setPhase("idle");
  }

  async function send() {
    if (!blob) return;
    setPhase("sending");
    try {
      const sig = await api(`/api/observations/${encodeURIComponent(obsId)}/voice`, { method: "POST" });
      const form = new FormData();
      form.append("file", blob, "voice-note");
      form.append("api_key", sig.apiKey);
      form.append("timestamp", String(sig.timestamp));
      form.append("signature", sig.signature);
      form.append("folder", sig.folder);
      form.append("tags", sig.tags);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/video/upload`, { method: "POST", body: form });
      const up = await res.json();
      if (!res.ok) throw new Error(up?.error?.message || `Upload failed (${res.status})`);
      const text = transcript.trim();
      await addComment(obsId, text, { public_id: up.public_id, url: up.secure_url, duration: Number(up.duration ?? secs), lang, transcribed: !!text && canTranscribe });
      discard();
    } catch (e: any) {
      toast({ title: "Voice note not sent", detail: e?.message, tone: "danger" });
      setPhase("review");
    }
  }

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  if (phase === "idle") {
    return (
      <div className="mt-2 flex items-center gap-2" data-testid="voice-idle">
        <button type="button" onClick={start} className="btn-outline h-8 gap-1.5 px-2.5 text-[12px]" data-testid="voice-start"><Mic className="size-3.5" /> Voice note</button>
        <select value={lang} onChange={(e) => setLang(e.target.value as typeof lang)} className="input h-8 w-auto text-[12px]" aria-label="Voice note language">
          {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
        <span className="text-[10.5px] text-ink-3">{canTranscribe ? "Transcribed by your browser's speech service" : "Audio only — this browser cannot transcribe"}</span>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-line p-2.5" data-testid="voice-panel">
      {phase === "recording" ? (
        <div className="flex items-center gap-2">
          <span className="size-2 animate-pulse rounded-full bg-danger" />
          <span className="font-mono text-[12px]" data-testid="voice-timer">{mmss(secs)} / {mmss(MAX_SECONDS)}</span>
          <button type="button" onClick={stop} className="btn-primary ml-auto h-8 px-2.5 text-[12px]" data-testid="voice-stop"><Square className="size-3.5" /> Stop</button>
        </div>
      ) : (
        preview && <audio controls src={preview} className="h-8 w-full" data-testid="voice-preview" />
      )}
      {(phase !== "recording" || transcript || interim) && canTranscribe && (
        <textarea
          value={phase === "recording" ? `${transcript} ${interim}`.trim() : transcript}
          onChange={(e) => setTranscript(e.target.value)}
          readOnly={phase === "recording"}
          rows={2}
          placeholder={phase === "recording" ? "Listening…" : "No speech recognised — add text or send audio only"}
          className="input mt-2 h-auto py-1.5 text-[12px] leading-relaxed"
          lang={lang}
          data-testid="voice-transcript"
        />
      )}
      {phase !== "recording" && (
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={discard} disabled={phase === "sending"} className="btn-ghost h-8 px-2.5 text-[12px]"><Trash2 className="size-3.5" /> Discard</button>
          <button type="button" onClick={send} disabled={phase === "sending"} className="btn-primary ml-auto h-8 px-2.5 text-[12px]" data-testid="voice-send">
            {phase === "sending" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Send voice note
          </button>
        </div>
      )}
    </div>
  );
}

export function VoiceClipPlayer({ clip, mine }: { clip: VoiceClip; mine: boolean }) {
  return (
    <div className="mb-1" data-testid="voice-clip">
      <audio controls preload="none" src={clip.url} className="h-8 w-56 max-w-full" />
      <div className={cn("mt-0.5 flex items-center gap-1 text-[10px]", mine ? "text-bg/60 justify-end" : "text-ink-3")}>
        <Mic className="size-2.5" /> {Math.round(clip.duration)} s · {clip.lang === "hi-IN" ? "हिन्दी" : "English"}{clip.transcribed ? " · browser transcript" : ""}
      </div>
    </div>
  );
}
