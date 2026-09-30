"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Camera, CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { measureQuality, type Quality } from "@/lib/quality";
import { sha256Hex, INSPECTION_LABEL, fmtDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

/** Phone capture page opened from the laptop's QR code. No login: the signed token is the permission. */
export default function PhoneCapture() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "check" | "seal" | "upload" | "register" | "done" | "fail">("idle");
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [quality, setQuality] = useState<Quality | null>(null);
  const [msg, setMsg] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/handoff/${token}/info`).then(async (r) => {
      const b = await r.json();
      if (!r.ok) setError(b.error || "This link is not valid.");
      else setInfo(b);
    }).catch(() => setError("Could not reach the server."));
  }, [token]);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setPreview(URL.createObjectURL(f));
    try {
      setStep("check");
      const bmp = await createImageBitmap(f);
      const q = measureQuality(bmp, bmp.width, bmp.height);
      setQuality(q);
      setStep("seal");
      const sha256 = await sha256Hex(await f.arrayBuffer());
      setStep("upload");
      const sr = await fetch(`/api/handoff/${token}/sign`, { method: "POST" });
      const sig = await sr.json();
      if (!sr.ok) throw new Error(sig.error || "Could not sign the upload");
      const up = await new Promise<any>((resolve, reject) => {
        const form = new FormData();
        form.append("file", f);
        form.append("api_key", sig.apiKey);
        form.append("timestamp", String(sig.timestamp));
        form.append("signature", sig.signature);
        form.append("folder", sig.folder);
        form.append("tags", sig.tags);
        if (sig.notificationUrl) form.append("notification_url", sig.notificationUrl);
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`);
        xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
        xhr.onload = () => { try { const b = JSON.parse(xhr.responseText); xhr.status < 300 ? resolve(b) : reject(new Error(b?.error?.message || "Upload failed")); } catch { reject(new Error("Upload failed")); } };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(form);
      });
      setStep("register");
      const rr = await fetch(`/api/handoff/${token}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cloudinary_public_id: up.public_id, secure_url: up.secure_url, etag: up.etag, sha256, width: up.width, height: up.height }),
      });
      const rb = await rr.json();
      if (!rr.ok) throw new Error(rb.error || "Could not register the photo");
      setMsg(`sha256 ${sha256.slice(0, 12)}…`);
      setStep("done");
    } catch (e: any) {
      setMsg(e?.message || String(e));
      setStep("fail");
    }
  }

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center">
        <div><AlertTriangle className="mx-auto mb-3 size-8 text-warn" /><h1 className="h-display text-[32px]">Link expired</h1><p className="mt-2 text-[14px] text-ink-2">{error}</p></div>
      </main>
    );
  }
  if (!info) return <main className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin text-ink-3" /></main>;

  const busy = ["check", "seal", "upload", "register"].includes(step);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col p-5">
      <div className="eyebrow">{info.property}</div>
      <h1 className="h-display mt-2 text-[40px]">{info.room}</h1>
      <div className="text-[13px] text-ink-3">{info.inspection ? `${INSPECTION_LABEL[info.inspection.type]} · ${fmtDate(info.inspection.captured_at)}` : ""} · for {info.by}</div>

      <div className="relative mt-5 aspect-[4/3] overflow-hidden rounded-2xl bg-surface-2">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Your photo" className="h-full w-full object-cover" />
        ) : info.ghost_url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={info.ghost_url} alt="Move-in view to match" className="h-full w-full object-cover opacity-70" />
            <span className="absolute left-3 top-3 rounded-md bg-black/60 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white">Match this move-in view</span>
          </>
        ) : (
          <div className="grid h-full place-items-center text-[13px] text-ink-3">First photo of this room</div>
        )}
        {busy && <div className="absolute inset-0 grid place-items-center bg-black/40 text-white"><div className="text-center"><Loader2 className="mx-auto mb-2 size-6 animate-spin" /><div className="text-[13px]">{step === "check" ? "Checking quality" : step === "seal" ? "Sealing SHA-256" : step === "upload" ? `Uploading ${progress}%` : "Registering"}</div></div></div>}
      </div>

      {quality && (
        <div className={cn("mt-3 rounded-lg px-3 py-2 text-[12.5px]", quality.verdict === "ok" ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn")}>
          {quality.verdict === "ok" ? "Good light and sharp." : quality.verdict === "too_dark" ? "Quite dark — a retake with more light would help." : quality.verdict === "blurry" ? "A bit blurry — hold steady and retake if you can." : "Overexposed."}
        </div>
      )}

      {step === "done" ? (
        <div className="mt-6 text-center animate-fade-up">
          <CheckCircle2 className="mx-auto mb-2 size-10 text-ok" />
          <div className="text-[16px] font-semibold">Sent. It&apos;s on the laptop now.</div>
          <div className="mt-1 font-mono text-[11px] text-ink-3">{msg}</div>
          <button onClick={() => { setStep("idle"); setPreview(null); setQuality(null); input.current?.click(); }} className="btn-outline mt-5"><RotateCcw className="size-4" /> Take another</button>
        </div>
      ) : step === "fail" ? (
        <div className="mt-6 text-center">
          <AlertTriangle className="mx-auto mb-2 size-8 text-danger" />
          <div className="text-[14px] font-semibold">Upload failed</div>
          <p className="mt-1 text-[12.5px] text-ink-3">{msg}</p>
          <button onClick={() => { setStep("idle"); setPreview(null); }} className="btn-primary mt-4">Try again</button>
        </div>
      ) : (
        <button onClick={() => input.current?.click()} disabled={busy} className="btn-signal mt-6 h-14 w-full text-[16px]">
          <Camera className="size-5" /> {busy ? "Working…" : "Take photo"}
        </button>
      )}
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      <p className="mt-auto pt-8 text-center text-[11px] text-ink-3">Hashed on this phone before upload · sent straight to Cloudinary · link expires {fmtDate(info.expires_at, { hour: "2-digit", minute: "2-digit" })}</p>
    </main>
  );
}
