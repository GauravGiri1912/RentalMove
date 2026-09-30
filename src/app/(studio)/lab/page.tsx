"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Gauge, Loader2, RotateCcw, Wand2 } from "lucide-react";
import { PageHeader, Segmented } from "@/components/ui";
import { CopyButton, UrlExplain } from "@/components/hood";
import { getAssets, getRoom } from "@/lib/view";
import { PRESETS, type Preset } from "@/lib/cld";
import { cn, fmtBytes } from "@/lib/utils";
import { useSignedUrls } from "@/lib/use-signed";


type Crop = "none" | "1:1" | "4:3" | "16:9";
interface State {
  crop: Crop;
  width: number;
  brightness: boolean;
  contrast: boolean;
  sharpen: boolean;
  pixelate: boolean;
  improve: boolean;
  grayscale: boolean;
  format: "auto" | "jpg" | "webp" | "avif";
  quality: "auto" | "auto:eco" | "90" | "60";
}

const DEFAULT: State = { crop: "none", width: 1200, brightness: false, contrast: false, sharpen: false, pixelate: false, improve: false, grayscale: false, format: "auto", quality: "auto" };

const FROM_PRESET: Partial<Record<Preset, Partial<State>>> = {
  thumb: { crop: "4:3", width: 480 },
  review: { width: 1600 },
  vlm: { width: 1024, format: "jpg" },
  matched: { crop: "4:3", width: 1200, brightness: true, contrast: true },
  privacy: { pixelate: true, width: 1600 },
  evidence: { width: 1400, sharpen: true },
};

export default function LabPage() {
  const assets = getAssets().filter((a) => a.cloudinary_public_id);
  const [assetId, setAssetId] = useState((assets.find((a) => a.people_detected) ?? assets[0])?.id ?? "");
  const [s, setS] = useState<State>({ ...DEFAULT, pixelate: true });
  const asset = assets.find((a) => a.id === assetId)!;
  // Server-signed (lib/recipes.ts whitelist) so the lab keeps working with Strict Transformations on.
  const recipe = useMemo(() => ({
    kind: "lab" as const,
    crop: s.crop,
    width: s.width,
    effects: (["pixelate", "improve", "brightness", "contrast", "sharpen", "grayscale"] as const).filter((k) => s[k]),
    format: s.format,
    quality: s.quality,
  }), [s]);
  const { urls, error: signError } = useSignedUrls(asset ? [{ asset_id: asset.id, recipe }] : null, 200);
  const url = urls?.[0] ?? "";
  const [metrics, setMetrics] = useState<{ bytes: number; type: string; ms: number } | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let live = true;
    setLoading(true);
    setError(null);
    const t0 = performance.now();
    // Same Accept header a browser <img> sends, so f_auto negotiates the same format.
    fetch(url, { headers: { Accept: "image/avif,image/webp,image/*,*/*;q=0.8" } })
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.headers.get("x-cld-error") ?? r.statusText}`);
        const b = await r.blob();
        if (live) setMetrics({ bytes: b.size, type: b.type, ms: performance.now() - t0 });
      })
      .catch((e) => live && setError(String(e.message ?? e)));
    return () => { live = false; };
  }, [url]);

  const set = (p: Partial<State>) => setS((x) => ({ ...x, ...p }));
  const original = asset.bytes || 1;
  const saved = metrics ? 1 - metrics.bytes / original : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Cloudinary · live"
        title={<>Media <em>lab</em></>}
        lede="Every derived image in RentalMove is a URL recipe applied to one untouched original. Change the recipe; Cloudinary renders it on the edge."
        actions={<button onClick={() => setS(DEFAULT)} className="btn-outline"><RotateCcw className="size-4" /> Reset</button>}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          <div className="card p-2" data-tour="lab-img">
            <div className="checker relative grid min-h-[320px] place-items-center overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {url && <img
                key={url}
                src={url}
                alt="Transformed output"
                onLoad={(e) => { setLoading(false); setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight }); }}
                onError={() => { setLoading(false); }}
                className={cn("max-h-[70vh] w-auto max-w-full transition-opacity duration-300", loading ? "opacity-40" : "opacity-100")}
              />}
              {loading && <div className="absolute inset-0 grid place-items-center"><span className="flex items-center gap-2 rounded-lg bg-black/60 px-3 py-1.5 text-[12px] text-white"><Loader2 className="size-3.5 animate-spin" /> Rendering on Cloudinary…</span></div>}
            </div>
          </div>

          <div className="card p-4" data-tour="lab-url">
            <div className="mb-2 flex items-center justify-between">
              <div className="eyebrow">Delivery URL</div>
              <div className="flex"><CopyButton text={url} /><a href={url} target="_blank" rel="noreferrer" className="btn-ghost h-7 px-2 text-[11.5px]"><ExternalLink className="size-3.5" /> Open</a></div>
            </div>
            <UrlExplain url={url} className="text-[12.5px]" />
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Output" value={metrics ? fmtBytes(metrics.bytes) : "—"} sub={`original ${fmtBytes(original)}`} />
            <Metric label="Saved" value={metrics ? `${Math.max(0, saved * 100).toFixed(0)}%` : "—"} sub={<span className="block h-1 overflow-hidden rounded-full bg-line"><span className="block h-full bg-ok transition-all duration-700" style={{ width: `${Math.max(0, saved * 100)}%` }} /></span>} accent />
            <Metric label="Format" value={metrics ? metrics.type.replace("image/", "") : "—"} sub="negotiated per browser" />
            <Metric label="Size · time" value={dims ? `${dims.w}×${dims.h}` : "—"} sub={metrics ? `${metrics.ms.toFixed(0)} ms incl. transform` : error ?? "…"} />
          </div>
          {error && <p className="text-[12px] text-danger">Cloudinary returned an error: {error}</p>}
          {signError && <p className="text-[12px] text-danger">Could not sign this recipe: {signError}</p>}
        </div>

        <aside className="space-y-4">
          <div className="card p-4">
            <label className="eyebrow mb-1.5 block">Asset</label>
            <select value={assetId} onChange={(e) => setAssetId(e.target.value)} className="input">
              {assets.map((a) => <option key={a.id} value={a.id}>{getRoom(a.room_id).name} · move-in{a.people_detected ? " · has a person" : ""}</option>)}
            </select>
            <div className="mt-2 break-all font-mono text-[10.5px] text-ink-3">{asset.cloudinary_public_id}</div>
          </div>

          <div className="card p-4">
            <div className="eyebrow mb-2">App presets</div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(PRESETS) as Preset[]).map((p) => (
                <button key={p} onClick={() => setS({ ...DEFAULT, ...FROM_PRESET[p] })} className="chip transition hover:border-ink hover:text-ink" title={PRESETS[p].purpose}>{PRESETS[p].label}</button>
              ))}
            </div>
          </div>

          <div className="card space-y-4 p-4">
            <div>
              <div className="eyebrow mb-2">Crop · g_auto</div>
              <Segmented size="sm" value={s.crop} onChange={(v) => set({ crop: v })} options={[{ value: "none", label: "None" }, { value: "1:1", label: "1:1" }, { value: "4:3", label: "4:3" }, { value: "16:9", label: "16:9" }]} />
            </div>
            <label className="block">
              <span className="eyebrow flex justify-between"><span>Width</span><span className="font-mono normal-case tracking-normal text-ink-2">{s.width}px</span></span>
              <input type="range" min={200} max={1600} step={40} value={s.width} onChange={(e) => set({ width: +e.target.value })} className="mt-2 w-full accent-[rgb(var(--signal))]" />
            </label>
            <div>
              <div className="eyebrow mb-2">Effects</div>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  ["pixelate", "Pixelate faces"],
                  ["improve", "Improve"],
                  ["brightness", "Auto brightness"],
                  ["contrast", "Auto contrast"],
                  ["sharpen", "Sharpen"],
                  ["grayscale", "Greyscale"],
                ] as [keyof State, string][]).map(([k, l]) => (
                  <button key={k} onClick={() => set({ [k]: !s[k] } as Partial<State>)} aria-pressed={!!s[k]} className={cn("flex h-9 items-center gap-2 rounded-lg border px-2.5 text-[12px] transition", s[k] ? "border-ink bg-ink text-bg" : "border-line hover:bg-surface-2")}>
                    <Wand2 className="size-3.5" /> {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="eyebrow">Format</span>
                <select value={s.format} onChange={(e) => set({ format: e.target.value as State["format"] })} className="input mt-1">
                  {["auto", "jpg", "webp", "avif"].map((f) => <option key={f} value={f}>f_{f}</option>)}
                </select>
              </label>
              <label className="block"><span className="eyebrow">Quality</span>
                <select value={s.quality} onChange={(e) => set({ quality: e.target.value as State["quality"] })} className="input mt-1">
                  {["auto", "auto:eco", "90", "60"].map((f) => <option key={f} value={f}>q_{f}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-line p-4 text-[12px] leading-relaxed text-ink-3">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-ink-2"><Gauge className="size-3.5" /> Measured, not estimated</div>
            Output size, format and timing come from fetching this exact URL from your browser. Each new recipe uses a small amount of Cloudinary transformation quota.
          </div>
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: boolean }) {
  return (
    <div className="card p-3.5">
      <div className="eyebrow">{label}</div>
      <div className={cn("mt-1.5 font-display text-[28px] leading-none tabular-nums", accent && "text-ok")}>{value}</div>
      {sub && <div className="mt-2 text-[11px] text-ink-3">{sub}</div>}
    </div>
  );
}
