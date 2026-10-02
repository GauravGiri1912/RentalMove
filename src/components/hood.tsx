"use client";

import { useState } from "react";
import { Copy, ExternalLink, X, Cpu, Check } from "lucide-react";
import { useStudio } from "./providers";
import { getAssets, getInspection, getRoom } from "@/lib/view";
import { INSPECTION_LABEL } from "@/lib/utils";
import { explainUrl, PRESETS, presetUrl, type Preset } from "@/lib/cld";
import { cn } from "@/lib/utils";

const SEG_STYLE = {
  base: "text-ink-3",
  cloud: "text-info",
  transform: "text-signal",
  version: "text-ok",
  id: "text-ink",
};

export function UrlExplain({ url, className }: { url: string; className?: string }) {
  return (
    <code className={cn("block break-all font-mono text-[11.5px] leading-[1.6]", className)}>
      {explainUrl(url).map((s, i) => (
        <span key={i} className={SEG_STYLE[s.kind]}>{s.text}</span>
      ))}
    </code>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn-ghost h-7 px-2 text-[11.5px]"
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => {});
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
    >
      {done ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />} {done ? "Copied" : label}
    </button>
  );
}

const STAGES = [
  ["Sign", "Server signs upload params; the API secret never reaches the browser."],
  ["Upload", "Browser uploads straight to Cloudinary into properties/{id}/{inspection}/{room}."],
  ["Seal", "Browser computes SHA-256 of the original bytes before upload."],
  ["Analyse", "Vision model reads the capped model-input derivative, never the original."],
  ["Index", "Findings written back as Cloudinary tags + structured metadata for search."],
  ["Review", "A person accepts, rejects or edits every finding; state syncs back."],
  ["Deliver", "Reports use derived URLs — privacy pixelation, evidence sharpening."],
];

export function HoodDrawer() {
  const { hoodOpen, setHoodOpen } = useStudio();
  const cloudAssets = getAssets().filter((a) => a.cloudinary_public_id);
  const [assetId, setAssetId] = useState(cloudAssets[0]?.id ?? "");
  if (!hoodOpen) return null;
  // A property with no photos yet (a new account) has nothing to show here, and must not crash the whole studio.
  const asset = cloudAssets.find((a) => a.id === assetId) ?? cloudAssets[0];
  if (!asset) return null;
  const pid = asset.cloudinary_public_id!;
  return (
    <div className="fixed inset-0 z-50" onMouseDown={() => setHoodOpen(false)}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      <aside
        className="absolute inset-y-0 right-0 flex w-full max-w-[560px] flex-col border-l border-line bg-bg shadow-lift animate-fade-up"
        onMouseDown={(e) => e.stopPropagation()}
        aria-label="Under the hood"
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="grid size-8 place-items-center rounded-lg bg-ink text-bg"><Cpu className="size-4" /></span>
          <div className="flex-1">
            <div className="text-[14px] font-semibold">Under the hood</div>
            <div className="text-[12px] text-ink-3">Every image you see is a Cloudinary URL. Nothing is re-uploaded.</div>
          </div>
          <button onClick={() => setHoodOpen(false)} className="btn-ghost px-2" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <section>
            <div className="eyebrow mb-3">Pipeline</div>
            <ol className="relative space-y-3 border-l border-line pl-5">
              {STAGES.map(([t, d], i) => (
                <li key={t} className="relative">
                  <span className="absolute -left-[27px] top-0.5 grid size-[15px] place-items-center rounded-full border border-line bg-surface font-mono text-[8.5px] text-ink-2">{i + 1}</span>
                  <div className="text-[13px] font-medium">{t}</div>
                  <div className="text-[12px] text-ink-3">{d}</div>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <div className="eyebrow">Derived URLs · live asset</div>
              <select value={assetId} onChange={(e) => setAssetId(e.target.value)} className="input h-8 w-auto text-[12px]">
                {cloudAssets.map((a) => <option key={a.id} value={a.id}>{getRoom(a.room_id).name} · {INSPECTION_LABEL[getInspection(a.inspection_id)?.type ?? "inspection"]} {new Date(a.captured_at).getFullYear()}</option>)}
              </select>
            </div>
            <div className="mb-3 flex flex-wrap gap-3 text-[10.5px] font-mono">
              <span className="text-info">■ cloud</span><span className="text-signal">■ transformation</span><span className="text-ink">■ public ID</span>
            </div>
            <div className="space-y-2.5">
              {(Object.keys(PRESETS) as Preset[]).map((p) => {
                const url = presetUrl(pid, p);
                return (
                  <div key={p} className="card overflow-hidden">
                    <div className="flex gap-3 p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`${PRESETS[p].label} output`} loading="lazy" className="h-[60px] w-[80px] shrink-0 rounded-md bg-surface-2 object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[13px] font-medium">{PRESETS[p].label} <span className="font-normal text-ink-3">— {PRESETS[p].purpose}</span></div>
                          <div className="flex shrink-0">
                            <CopyButton text={url} label="" />
                            <a href={url} target="_blank" rel="noreferrer" className="btn-ghost h-7 px-2" aria-label="Open"><ExternalLink className="size-3.5" /></a>
                          </div>
                        </div>
                        <UrlExplain url={url} className="mt-1.5" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <div className="eyebrow mb-3">Asset record</div>
            <dl className="card divide-y divide-line font-mono text-[11.5px]">
              {[
                ["public_id", pid],
                ["version", `v${asset.cloudinary_version}`],
                ["dimensions", `${asset.width} × ${asset.height}`],
                ["sha256", asset.sha256],
                ["analysis", asset.analysis_status],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[96px_1fr] gap-3 px-3 py-2">
                  <dt className="text-ink-3">{k}</dt>
                  <dd className="break-all text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </aside>
    </div>
  );
}
