"use client";

import Link from "next/link";
import { ArrowRight, Camera, EyeOff, Fingerprint, GitCompareArrows, ScanSearch, Search, ShieldCheck, UserCheck, Moon, Sun, Map as MapIcon, History, ScanLine, Sparkles, PenLine, Wand2, Play } from "lucide-react";
import { useStudio } from "@/components/providers";
import { UrlExplain } from "@/components/hood";
import { presetUrl } from "@/lib/cld";

const LIVING = "properties/prop-381/insp-2024-move-in/living_room/living-floor-01";
const KITCHEN_IN = "properties/prop-381/insp-2024-move-in/kitchen/cabinet-base-01";
const KITCHEN_OUT = "properties/prop-381/insp-2026-move-out/kitchen/cabinet-base-03";

export default function Welcome() {
  const { theme, toggleTheme, setTour, status } = useStudio();
  // "/" sends signed-out visitors back here, so "Open studio" only makes sense once signed in.
  const signedIn = status === "ready";
  return (
    <div className="min-h-screen overflow-x-hidden">
      <nav className="mx-auto flex max-w-[1240px] items-center gap-3 px-5 py-5 md:px-8">
        <span className="grid size-8 place-items-center rounded-[9px] bg-ink text-bg">
          <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><rect x="9" y="12" width="6" height="5" rx=".6" className="stroke-signal" /></svg>
        </span>
        <span className="text-[15px] font-semibold tracking-tight">RentalMove</span>
        <div className="flex-1" />
        <button onClick={toggleTheme} className="btn-ghost hidden px-2 sm:inline-flex" aria-label="Toggle theme">{theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}</button>
        <button onClick={() => setTour({ active: true, step: 0, playing: true })} className="btn-outline hidden whitespace-nowrap sm:inline-flex"><Play className="size-4" /> Watch the tour</button>
        {signedIn ? (
          <Link href="/" className="btn-primary whitespace-nowrap" data-testid="nav-studio">Open studio <ArrowRight className="size-4" /></Link>
        ) : (
          <>
            <Link href="/login" className="btn-ghost whitespace-nowrap" data-testid="nav-login">Log in</Link>
            <Link href="/signup" className="btn-primary whitespace-nowrap" data-testid="nav-signup">Sign up</Link>
          </>
        )}
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-[1240px] px-5 pb-16 pt-10 md:px-8 md:pt-16">
        <div className="grid grid-cols-1 items-end gap-10 lg:grid-cols-[1.05fr_1fr]">
          <div className="animate-fade-up">
            <div className="eyebrow mb-5">Visual property memory · built on Cloudinary</div>
            <h1 className="h-display text-[64px] sm:text-[88px] lg:text-[112px]">
              Every room <em className="text-signal">remembers</em>.
            </h1>
            <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-ink-2">
              Photograph a home at move-in. Photograph it again at move-out. RentalMove lines the two up, shows exactly what changed, and hands both sides the same sealed evidence.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/kit" className="btn-signal h-11 px-5 text-[14px]" data-testid="hero-kit"><Camera className="size-4" /> Start your free move-in kit</Link>
              {signedIn ? (
                <Link href="/compare" className="btn-outline h-11 px-5 text-[14px]"><GitCompareArrows className="size-4" /> See a comparison</Link>
              ) : (
                <Link href="/login" className="btn-outline h-11 px-5 text-[14px]" data-testid="hero-demo"><GitCompareArrows className="size-4" /> Try the live demo</Link>
              )}
            </div>
            <p className="mt-3 text-[12.5px] text-ink-3">The kit is free and needs no account: photograph each room on move-in day and get a sealed record to send to your landlord.</p>
          </div>

          <div className="relative animate-fade-up [animation-delay:120ms]">
            <div className="card relative overflow-hidden p-2 shadow-lift">
              <div className="relative aspect-[1200/896] overflow-hidden rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={presetUrl(KITCHEN_OUT, "review")} alt="Kitchen at move-out" className="absolute inset-0 h-full w-full object-cover" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={presetUrl(KITCHEN_IN, "review")} alt="Kitchen at move-in" className="absolute inset-0 h-full w-full animate-sweep-clip object-cover" />
                <div className="absolute inset-y-0 w-px animate-sweep-line bg-white shadow-[0_0_0_1px_rgb(0_0_0/.15)]">
                  <span className="absolute top-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/70 bg-black/40 text-white backdrop-blur-md">
                    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 6-6 6 6 6M15 6l6 6-6 6" /></svg>
                  </span>
                </div>
                <div className="absolute rounded-[3px] border-[1.5px] border-signal" style={{ left: "50.5%", top: "62.5%", width: "10.5%", height: "13.5%" }}>
                  <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-signal px-1.5 py-0.5 font-mono text-[10px] text-white">New · scratches · 88%</span>
                </div>
                <span className="absolute left-3 top-3 rounded-md bg-black/60 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white">Move-in 2024</span>
                <span className="absolute right-3 top-3 rounded-md bg-black/60 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white">Move-out 2026</span>
              </div>
            </div>
            <div className="card absolute -bottom-6 -left-4 hidden w-[260px] p-3 shadow-lift md:block">
              <div className="flex items-center gap-2 text-[12px] font-medium"><Fingerprint className="size-3.5 text-signal" /> Sealed at capture</div>
              <div className="mt-1 font-mono text-[10.5px] leading-relaxed text-ink-3">sha256 65fa16f4a836…</div>
            </div>
          </div>
        </div>
      </section>

      {/* Marquee of what it catches */}
      <div className="border-y border-line bg-surface py-3">
        <div className="flex w-max animate-marquee gap-10 whitespace-nowrap font-display text-[26px] italic text-ink-3">
          {Array.from({ length: 2 }).flatMap((_, k) =>
            ["scuffed baseboards", "cabinet scratches", "grout discolouration", "hairline tile cracks", "wall dents", "floor scratches", "worn paint edges", "patched plaster"].map((t) => (
              <span key={`${k}-${t}`} className="flex items-center gap-10">{t}<span className="text-signal not-italic">·</span></span>
            ))
          )}
        </div>
      </div>

      {/* Three steps */}
      <section className="mx-auto max-w-[1240px] px-5 py-24 md:px-8">
        <div className="eyebrow mb-4">How it works</div>
        <h2 className="h-display max-w-3xl text-[44px] md:text-[60px]">One pipeline from <em>shutter</em> to <em>signed-off</em> evidence.</h2>
        <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
          {[
            { n: "01", icon: Camera, t: "Capture", d: "A ghost of the move-in photo guides the shot. Brightness and sharpness are checked on the phone, and the file is hashed before it leaves." },
            { n: "02", icon: ScanSearch, t: "Understand", d: "Cloudinary derives a capped copy for the vision model, matches frames between visits, and indexes every finding as searchable metadata." },
            { n: "03", icon: UserCheck, t: "Decide", d: "A person accepts, edits or rejects each finding. Only reviewed items reach the report — shared by expiring link, with people pixelated." },
          ].map((s) => (
            <div key={s.n} className="bg-surface p-7">
              <div className="flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-xl bg-surface-2"><s.icon className="size-5" /></span>
                <span className="font-mono text-[12px] text-ink-3">{s.n}</span>
              </div>
              <div className="mt-8 text-[20px] font-semibold tracking-tight">{s.t}</div>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What's inside */}
      <section className="mx-auto max-w-[1240px] px-5 pb-24 md:px-8">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { href: "/map", icon: MapIcon, t: "Home map", d: "A floor plan where every photo is a pin — and every room glows where it changed." },
            { href: "/rooms/room-bathroom", icon: History, t: "Time machine", d: "Drag one slider from move-in to move-out and watch a room age." },
            { href: "/compare?room=room-kitchen", icon: ScanLine, t: "Pixel truth", d: "The model’s claims, re-checked pixel by pixel in the browser." },
            { href: "/?ask=Is%20anything%20disputed%3F", icon: Sparkles, t: "Ask the home", d: "Plain questions, answers that cite the exact photo crops." },
            { href: "/report", icon: PenLine, t: "Two signatures", d: "Tenant and owner sign one SHA-256 of the report — change a word, it breaks." },
            { href: "/relet", icon: Wand2, t: "Evidence → listing", d: "Cloudinary generative AI turns originals into listing photos, labelled in the pixels." },
          ].map((f) => (
            <Link key={f.t} href={f.href} className="card group p-6 transition hover:-translate-y-0.5 hover:shadow-lift">
              <f.icon className="size-5 text-signal" />
              <div className="mt-5 flex items-center justify-between text-[17px] font-semibold tracking-tight">{f.t}<ArrowRight className="size-4 text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-ink" /></div>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{f.d}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Cloudinary section */}
      <section className="bg-ink py-24 text-bg">
        <div className="mx-auto grid grid-cols-1 max-w-[1240px] gap-12 px-5 md:px-8 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-bg/50">The media layer</div>
            <h2 className="h-display mt-4 text-[44px] md:text-[56px]">One original. <em className="text-signal">Every</em> version as a URL.</h2>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-bg/70">The original upload is never modified. Thumbnails, the model&apos;s input, matched frames and privacy copies are transformation URLs, rendered by Cloudinary on first request and cached at the edge.</p>
            <ul className="mt-8 space-y-3 text-[14px] text-bg/80">
              <li className="flex gap-3"><EyeOff className="mt-0.5 size-4 text-signal" /> People in frame are pixelated in shared copies.</li>
              <li className="flex gap-3"><Search className="mt-0.5 size-4 text-signal" /> Plain-language questions become Cloudinary Search expressions.</li>
              <li className="flex gap-3"><ShieldCheck className="mt-0.5 size-4 text-signal" /> Signed uploads — the API secret never touches the browser.</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-bg/10 bg-bg/[.04] p-3">
            <div className="grid grid-cols-2 gap-2">
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={presetUrl(LIVING, "thumb")} alt="Original framing" className="aspect-[4/3] w-full rounded-lg object-cover" loading="lazy" />
                <figcaption className="mt-1.5 font-mono text-[10.5px] text-bg/50">thumb</figcaption>
              </figure>
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={presetUrl(LIVING, "privacy")} alt="People pixelated" className="aspect-[4/3] w-full rounded-lg object-cover" loading="lazy" />
                <figcaption className="mt-1.5 font-mono text-[10.5px] text-bg/50">privacy</figcaption>
              </figure>
            </div>
            <div className="mt-3 rounded-lg bg-black/40 p-3 [&_.text-ink]:text-white [&_.text-ink-3]:text-white/40">
              <UrlExplain url={presetUrl(LIVING, "privacy")} />
            </div>
          </div>
        </div>
      </section>

      {/* Principles */}
      <section className="mx-auto max-w-[1240px] px-5 py-24 md:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1fr_1.4fr]">
          <h2 className="h-display text-[44px] md:text-[56px]">Describes. <em>Never</em> accuses.</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {[
              ["Neutral language", "“Possible scratch on the lower cabinet” — never fault, blame, or cost."],
              ["Humans decide", "Every finding starts as pending. Nothing reaches a report without a person."],
              ["Pre-existing is visible", "Anything already there at move-in is marked, so nobody pays for it twice."],
              ["Evidence you can check", "Each photo’s SHA-256 is printed in the report. Recompute it and compare."],
            ].map(([t, d]) => (
              <div key={t} className="border-t border-line pt-4">
                <div className="text-[15px] font-semibold">{t}</div>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-5 pb-24 md:px-8">
        <div className="card relative overflow-hidden p-10 text-center md:p-16">
          <div className="hairline-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
          <h2 className="h-display relative text-[44px] md:text-[64px]">Capture once. Find instantly.<br /><em className="text-signal">Compare over time.</em></h2>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/kit" className="btn-signal h-11 px-6 text-[14px]">Start your free move-in kit <ArrowRight className="size-4" /></Link>
            {signedIn ? (
              <Link href="/" className="btn-outline h-11 px-6 text-[14px]">Open the studio</Link>
            ) : (
              <Link href="/login" className="btn-outline h-11 px-6 text-[14px]">Log in</Link>
            )}
          </div>
        </div>
        <footer className="mt-10 flex flex-wrap justify-between gap-2 text-[12px] text-ink-3">
          <span>RentalMove · Pixels to Products, Cloudinary AI Hackathon 2026</span>
          <span>Design preview — demo data; later visits are staged images.</span>
        </footer>
      </section>
    </div>
  );
}
