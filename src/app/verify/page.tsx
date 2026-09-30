"use client";

import Link from "next/link";
import { useState } from "react";
import { BadgeCheck, FileSearch, Fingerprint, Loader2, ShieldQuestion, Upload } from "lucide-react";
import { cn, fmtDate, INSPECTION_LABEL, sha256Hex } from "@/lib/utils";

type Result = { name: string; sha256: string; ms: number; match: false } | { name: string; sha256: string; ms: number; match: true; room: string; inspection_type: string; captured_at: string; registered_at: string };

/**
 * Public verification: "is this exact file the photo on record?" The file is hashed in the
 * browser and never uploaded — only its SHA-256 is sent.
 */
export default function VerifyPage() {
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function check(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const f of Array.from(files).slice(0, 10)) {
        const t0 = performance.now();
        const sha256 = await sha256Hex(await f.arrayBuffer());
        const ms = performance.now() - t0;
        const r = await fetch("/api/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sha256 }) });
        const b = await r.json();
        if (!r.ok) throw new Error(b.error || "Verification failed");
        setResults((rs) => [{ name: f.name, sha256, ms, ...b }, ...rs]);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-12">
      <Link href="/welcome" className="text-[13px] font-semibold tracking-tight">RentalMove</Link>
      <div className="eyebrow mb-3 mt-10">Public verification</div>
      <h1 className="h-display text-[48px] md:text-[60px]">Is this the <em>original</em>?</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-2">Drop a photo from a RentalMove report. It is hashed right here in your browser — the file never leaves your device — and the SHA-256 is checked against the record.</p>

      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void check(e.dataTransfer.files); }}
        className={cn("mt-8 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition", drag ? "border-signal bg-signal/[.04]" : "border-line hover:bg-surface")}
      >
        {busy ? <Loader2 className="mb-3 size-6 animate-spin text-ink-3" /> : <Upload className="mb-3 size-6 text-ink-3" />}
        <span className="text-[15px] font-semibold">{busy ? "Hashing and checking…" : "Drop photos or click to choose"}</span>
        <span className="mt-1 text-[12.5px] text-ink-3">JPEG / PNG / HEIC · up to 10 at a time</span>
        <input type="file" accept="image/*" multiple hidden onChange={(e) => void check(e.target.files)} />
      </label>
      {error && <p className="mt-4 rounded-lg bg-danger/[.07] px-3 py-2 text-[13px] text-danger">{error}</p>}

      <ul className="mt-6 space-y-3">
        {results.map((r, i) => (
          <li key={i} className={cn("card flex gap-4 p-4 animate-fade-up", r.match ? "border-ok/40" : "border-warn/40")}>
            <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", r.match ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn")}>{r.match ? <BadgeCheck className="size-5" /> : <ShieldQuestion className="size-5" />}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold">{r.match ? "Matches the photo on record" : "No record of this exact file"}</div>
              <div className="truncate text-[12px] text-ink-3">{r.name}</div>
              {r.match ? (
                <div className="mt-1 text-[12.5px] text-ink-2">{r.room} · {INSPECTION_LABEL[r.inspection_type] ?? r.inspection_type} · captured {fmtDate(r.captured_at)}</div>
              ) : (
                <div className="mt-1 text-[12.5px] text-ink-2">It may have been edited, re-saved or resized — any change to the bytes changes the hash. The original stays in the owner&apos;s record.</div>
              )}
              <div className="mt-2 flex items-center gap-1 break-all font-mono text-[10.5px] text-ink-3"><Fingerprint className="size-3 shrink-0" /> {r.sha256} · {r.ms.toFixed(0)} ms</div>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-10 flex items-start gap-2 text-[12px] leading-relaxed text-ink-3"><FileSearch className="mt-0.5 size-3.5 shrink-0" /> A match reveals only the room, inspection type and date — never the address. Download the original from Cloudinary (not a resized preview) to get a matching hash.</p>
    </main>
  );
}
