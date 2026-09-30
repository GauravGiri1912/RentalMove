"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BedDouble, Bath, ExternalLink, Loader2, MapPin, ShieldAlert, Sparkles, SquareStack, Wand2, Lock } from "lucide-react";
import { CompareViewer } from "@/components/compare-viewer";
import { Crop, PageHeader, Segmented } from "@/components/ui";
import { CopyButton, UrlExplain } from "@/components/hood";
import { getAssets, getProperty, getRoom, getRooms } from "@/lib/view";
import { cn } from "@/lib/utils";
import { useSignedUrls } from "@/lib/use-signed";
import { useStudio } from "@/components/providers";
import { Empty } from "@/components/ui";
import type { Recipe } from "@/lib/recipes";

// Generative edits are for marketing only. Every URL here is a server-signed recipe
// (lib/recipes.ts): the "AI-ALTERED" watermark is part of the signed transformation, so it is
// rendered into the pixels by Cloudinary and cannot be stripped by editing the URL.
type Ratio = "3:2" | "1:1" | "4:5";

export default function ReletPage() {
  const { user } = useStudio();
  if (user.role !== "owner") {
    return <Empty icon={<Wand2 className="size-5" />} title="Re-let studio is an owner tool" body="It turns inspection photos into listing photos with Cloudinary generative AI (which spends credits). Evidence photos are never altered." />;
  }
  return <Relet />;
}

function Relet() {
  const assets = getAssets().filter((a) => a.cloudinary_public_id);
  const [assetId, setAssetId] = useState((assets.find((a) => a.people_detected) ?? assets[0])?.id ?? "");
  const [remove, setRemove] = useState(true);
  const [enhance, setEnhance] = useState(true);
  const [ratio, setRatio] = useState<Ratio>("3:2");
  const asset = assets.find((a) => a.id === assetId)!;
  const canRemove = !!asset.people_detected;
  const withPerson = assets.find((a) => a.people_detected);
  const items = useMemo(() => {
    const list: { asset_id: string; recipe: Recipe }[] = [
      { asset_id: asset.id, recipe: { kind: "listing-before", ratio } },
      { asset_id: asset.id, recipe: { kind: "listing", remove: remove && canRemove, enhance, ratio, watermark: true } },
      { asset_id: (withPerson ?? asset).id, recipe: { kind: "listing", remove: !!withPerson, enhance: true, ratio: "3:2", watermark: true } },
    ];
    for (const a of assets.slice(0, 5)) list.push({ asset_id: a.id, recipe: { kind: "tile", size: 160 } });
    return list;
  }, [asset.id, remove, canRemove, enhance, ratio, withPerson?.id, assets.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const { urls, error: signError } = useSignedUrls(items);
  const before = urls?.[0] ?? "";
  const after = urls?.[1] ?? "";
  const artifactUrl = withPerson ? urls?.[2] ?? null : null;
  const tileUrl = (id: string) => urls?.[3 + assets.slice(0, 5).findIndex((a) => a.id === id)];
  const [ready, setReady] = useState(false);
  const [secs, setSecs] = useState(0);

  // Preload the generated image; the first render of a generative recipe can take ~15 s.
  useEffect(() => {
    setReady(false);
    setSecs(0);
    const t0 = Date.now();
    const tick = setInterval(() => setSecs(Math.round((Date.now() - t0) / 1000)), 500);
    if (!after) return () => clearInterval(tick);
    const img = new Image();
    img.onload = () => { setReady(true); clearInterval(tick); };
    img.onerror = () => { setReady(true); clearInterval(tick); };
    img.src = after;
    return () => clearInterval(tick);
  }, [after]);
  const [ar, br] = ratio.split(":").map(Number);

  return (
    <div>
      <PageHeader
        eyebrow="Owner tools · Cloudinary generative AI"
        title={<>From evidence to <em>listing</em>.</>}
        lede="When the tenancy ends, the same originals become listing photos — people removed, light enhanced, cropped for every channel. Evidence is never touched."
      />

      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex gap-3 rounded-2xl border border-ok/25 bg-ok/[.05] p-4">
          <Lock className="mt-0.5 size-4 shrink-0 text-ok" />
          <div className="text-[13px] leading-relaxed"><span className="font-semibold">Evidence copies</span> only ever get <span className="font-mono text-[12px]">e_pixelate_faces</span> — it hides pixels, it never invents them.</div>
        </div>
        <div className="flex gap-3 rounded-2xl border border-warn/30 bg-warn/[.06] p-4">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <div className="text-[13px] leading-relaxed"><span className="font-semibold">Listing copies</span> use generative fill. Cloudinary burns an <span className="font-mono text-[12px]">AI-ALTERED</span> label into every pixel, and they can never be attached to a report.</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          <div className="card p-2" data-tour="relet-img">
            <div className="mx-auto" style={{ maxWidth: `calc(72vh * ${ar / br})` }}>
                  {ready ? (
                    <CompareViewer mode="slider" aspect={`${ar} / ${br}`} prior={before} current={after} priorLabel="Original" currentLabel="Listing" boxes={[]} focus={null} active={null} threshold={20} normalize />
                  ) : (
                    <div className="relative overflow-hidden rounded-xl" style={{ aspectRatio: `${ar} / ${br}` }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={before} alt="Original" className="h-full w-full object-cover opacity-50 blur-[2px]" />
                      <div className="absolute inset-0 grid place-items-center">
                        <div className="flex items-center gap-3 rounded-xl bg-black/65 px-4 py-3 text-white backdrop-blur">
                          <Loader2 className="size-4 animate-spin" />
                          <div>
                            <div className="text-[13px] font-medium">Cloudinary is generating… {secs}s</div>
                            <div className="text-[11.5px] text-white/60">First render of a new recipe takes ~5–15 s, then it&apos;s cached at the edge.</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
            </div>
          </div>

          {signError && <p className="rounded-lg bg-danger/[.07] px-3 py-2 text-[12.5px] text-danger">Could not sign the listing recipe: {signError}</p>}
          <div className="card p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="eyebrow">Listing recipe · signed</div>
              <div className="flex"><CopyButton text={after} /><a href={after} target="_blank" rel="noreferrer" className="btn-ghost h-7 px-2 text-[11.5px]"><ExternalLink className="size-3.5" /> Open</a></div>
            </div>
            <UrlExplain url={after} />
          </div>

          {artifactUrl && <div className="card grid grid-cols-1 gap-5 p-5 md:grid-cols-[200px_1fr] md:items-center">
            <Crop src={artifactUrl} bbox={[0.215, 0.255, 0.3, 0.385]} aspect={1} pad={2.2} className="rounded-xl" alt="Generative artefact" />
            <div>
              <div className="mb-1 flex items-center gap-2 text-[14px] font-semibold"><AlertTriangle className="size-4 text-warn" /> Why generative output is never evidence</div>
              <p className="text-[13px] leading-relaxed text-ink-2">Removing the inspector left her clipboard floating by the window. Generative fill invents plausible pixels — fine for a listing, unacceptable for proof of condition. RentalMove keeps the two on separate URLs and only report-approved presets can reach a report.</p>
            </div>
          </div>}
        </div>

        <aside className="space-y-4">
          <div className="card p-4">
            <div className="eyebrow mb-2">Photo</div>
            <div className="grid grid-cols-4 gap-2">
              {assets.map((a) => (
                <button key={a.id} onClick={() => setAssetId(a.id)} className={cn("overflow-hidden rounded-lg ring-2 transition", a.id === assetId ? "ring-ink" : "ring-transparent opacity-70 hover:opacity-100")} aria-label={getRoom(a.room_id).name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {tileUrl(a.id) ? <img src={tileUrl(a.id)} alt="" className="aspect-square w-full object-cover" /> : <span className="block aspect-square w-full bg-surface-2" />}
                </button>
              ))}
            </div>
            <div className="mt-2 text-[12px] text-ink-3">{getRoom(asset.room_id).name}{asset.people_detected ? " · person in frame" : ""}</div>
          </div>

          <div className="card space-y-4 p-4">
            <Toggle on={remove && canRemove} disabled={!canRemove} onChange={setRemove} title="Remove people" code="e_gen_remove:prompt_person" hint={canRemove ? "Generative fill" : "No person in this photo"} />
            <Toggle on={enhance} onChange={setEnhance} title="Enhance" code="e_enhance" hint="AI exposure, colour and detail" />
            <div>
              <div className="eyebrow mb-2">Channel crop · g_auto</div>
              <Segmented size="sm" value={ratio} onChange={setRatio} options={[{ value: "3:2", label: "Listing 3:2" }, { value: "1:1", label: "Square" }, { value: "4:5", label: "Portrait" }]} />
            </div>
          </div>

          <div className="card overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {artifactUrl ?? urls?.[2] ? <img src={(artifactUrl ?? urls?.[2])!} alt="Listing preview" className="aspect-[3/2] w-full object-cover" /> : <span className="block aspect-[3/2] w-full bg-surface-2" />}
            <div className="p-4">
              <div className="flex items-baseline justify-between">
                <div className="text-[15px] font-semibold">{getProperty().address_label}, {getProperty().unit_label}</div>
                <span className="chip">Available 1 Oct</span>
              </div>
              <div className="mt-1 flex items-center gap-1 text-[12px] text-ink-3"><MapPin className="size-3" /> Listing preview</div>
              <div className="mt-3 flex gap-4 text-[12px] text-ink-2">
                <span className="flex items-center gap-1"><BedDouble className="size-3.5" /> {Math.max(1, getRooms().filter((r) => r.category === "bedroom").length)} bed</span>
                <span className="flex items-center gap-1"><Bath className="size-3.5" /> {Math.max(1, getRooms().filter((r) => r.category === "bathroom").length)} bath</span>
                <span className="flex items-center gap-1"><SquareStack className="size-3.5" /> {getRooms().length} rooms</span>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-3"><Sparkles className="size-3 text-signal" /> Listing mock-up · images AI-altered</div>
            </div>
          </div>
          <p className="px-1 text-[11.5px] leading-relaxed text-ink-3"><Wand2 className="mr-1 inline size-3" />Generative transformations use more Cloudinary credits than standard ones; each recipe is rendered once and then cached.</p>
        </aside>
      </div>
    </div>
  );
}

function Toggle({ on, onChange, title, code, hint, disabled }: { on: boolean; onChange: (v: boolean) => void; title: string; code: string; hint: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} className="flex w-full items-start gap-3 text-left disabled:opacity-50">
      <span className={cn("relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition", on ? "bg-ink" : "bg-line")}>
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-bg shadow transition-all", on ? "left-[18px]" : "left-0.5")} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">{title}</span>
        <span className="block font-mono text-[10.5px] text-signal">{code}</span>
        <span className="block text-[11.5px] text-ink-3">{hint}</span>
      </span>
    </button>
  );
}
