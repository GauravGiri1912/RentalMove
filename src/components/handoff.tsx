"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { CheckCircle2, Loader2, Smartphone, X, AlertTriangle, Radio } from "lucide-react";
import { api, useStudio } from "./providers";
import { CopyButton } from "./hood";
import { getAssets, getProperty, getRoom } from "@/lib/view";
import { cn } from "@/lib/utils";

/**
 * "Phone" button: shows a QR code for a 15-minute, single-room capture link. The laptop
 * then watches the live stream and confirms when the phone's photo arrives.
 */
export function HandoffButton({ inspectionId, roomId }: { inspectionId: string; roomId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-outline h-9" disabled={!inspectionId || !roomId} title="Capture with your phone">
        <Smartphone className="size-4" /> Phone
      </button>
      {/* Portal to <body>: an animated (transformed) ancestor would otherwise trap the fixed
          overlay inside itself, pushing the dialog off screen. */}
      {open && typeof document !== "undefined" && createPortal(<HandoffDialog inspectionId={inspectionId} roomId={roomId} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function HandoffDialog({ inspectionId, roomId, onClose }: { inspectionId: string; roomId: string; onClose: () => void }) {
  const { live, view } = useStudio();
  const [qr, setQr] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [expires, setExpires] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const startIds = useRef<Set<string>>(new Set(getAssets().map((a) => a.id)));
  const room = getRoom(roomId);
  const isLocal = typeof window !== "undefined" && /^(localhost|127\.|\[::1\])/.test(window.location.hostname);

  useEffect(() => {
    (async () => {
      try {
        const r = await api<{ path: string; expires_at: string }>("/api/handoff", { method: "POST", json: { property_id: getProperty().id, inspection_id: inspectionId, room_id: roomId } });
        const u = `${window.location.origin}${r.path}`;
        setUrl(u);
        setExpires(new Date(r.expires_at).getTime());
        setQr(await QRCode.toDataURL(u, { margin: 1, width: 440, color: { dark: "#141518", light: "#ffffff" } }));
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    })();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [inspectionId, roomId]);

  // A new photo for this room + inspection that wasn't there when the dialog opened.
  const arrived = view?.assets.find((a) => !startIds.current.has(a.id) && a.room_id === roomId && a.inspection_id === inspectionId);
  const left = Math.max(0, Math.round((expires - now) / 1000));

  return (
    <div className="fixed inset-0 z-50 flex overflow-y-auto bg-black/40 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className="card m-auto w-full max-w-md overflow-hidden shadow-lift animate-fade-up" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Capture with your phone">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="grid size-8 place-items-center rounded-lg bg-ink text-bg"><Smartphone className="size-4" /></span>
          <div className="flex-1">
            <div className="text-[14px] font-semibold">Capture {room.name.toLowerCase()} with your phone</div>
            <div className="text-[12px] text-ink-3">Scan, shoot, and it appears here — no login on the phone.</div>
          </div>
          <button onClick={onClose} className="btn-ghost px-2" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="p-5">
          {error ? (
            <p className="text-[13px] text-danger">{error}</p>
          ) : arrived ? (
            <div className="py-6 text-center animate-fade-up">
              <CheckCircle2 className="mx-auto mb-2 size-10 text-ok" />
              <div className="text-[15px] font-semibold">Photo received from your phone</div>
              <p className="mt-1 text-[12.5px] text-ink-3">{arrived.analysis_status === "done" ? "Analysed." : "Analysing now — findings will appear in a moment."}</p>
              <button onClick={onClose} className="btn-primary mt-4">Done</button>
            </div>
          ) : (
            <>
              <div className="mx-auto grid aspect-square w-full max-w-[260px] place-items-center rounded-2xl border border-line bg-white p-3">
                {qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} alt="QR code for the phone capture link" className="h-full w-full" />
                ) : <Loader2 className="size-6 animate-spin text-ink-3" />}
              </div>
              <div className="mt-3 flex items-center justify-between text-[12px] text-ink-3">
                <span className={cn("inline-flex items-center gap-1", live ? "text-ok" : "")}><Radio className="size-3.5" /> {live ? "Listening for the photo…" : "Live sync reconnecting…"}</span>
                <span className="font-mono">{left > 0 ? `expires ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "expired"}</span>
              </div>
              {url && <div className="mt-2 flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1"><code className="flex-1 truncate font-mono text-[10.5px]">{url}</code><CopyButton text={url} label="" /></div>}
              {isLocal && (
                <p className="mt-3 flex gap-2 rounded-lg bg-warn/[.08] p-2.5 text-[11.5px] leading-relaxed text-warn">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> Your phone can&apos;t open “localhost”. Open this app via your computer&apos;s network address (e.g. http://192.168.x.x:3000, same Wi-Fi) or the deployed URL, then create the code again.
                </p>
              )}
              <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">The link works for 15 minutes and only for this room and visit. It is signed by the server, so it can&apos;t be edited to reach anything else.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
