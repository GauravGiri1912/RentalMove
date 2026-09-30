"use client";

// Present mode: a narrated, video-like walkthrough. Each page is a chapter that opens with a
// title card saying what the page is for, then a few "beats" that scroll to one part of the
// page, dim everything else, and explain it in plain words. Beats last long enough to read
// (by word count) and the viewer can change speed, pause, or step through.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import { useStudio } from "./providers";
import { getObservations, hasView } from "@/lib/view";
import { trendOf } from "@/lib/insights";
import { cn } from "@/lib/utils";

interface Beat {
  text: string;
  /** CSS selector to spotlight; omitted = no spotlight. */
  target?: string;
  /** Run when the beat starts: click a selector, or send an in-page event. */
  click?: string;
  event?: string;
}
interface Chapter { name: string; purpose: string; href: string | (() => string); beats: Beat[] }

/** The finding with the clearest growth, for the Review chapter (falls back to the queue). */
function reviewHref() {
  if (!hasView()) return "/review";
  const grown = getObservations().find((o) => trendOf(o)?.kind === "grew");
  return grown ? `/review?o=${grown.id}` : "/review";
}

export const CHAPTERS: Chapter[] = [
  {
    name: "RentalMove", purpose: "A photo record of a rental home that tenant and owner can both trust.", href: "/welcome",
    beats: [{ target: "h1", text: "Moving out often ends in an argument about the deposit: was that mark there before? RentalMove keeps a sealed photo record of every room, from move-in to move-out, that both sides can check." }],
  },
  {
    name: "Overview", purpose: "The home at a glance.", href: "/",
    beats: [
      { target: "[data-tour=ov-hero]", text: "This is the property dashboard. It shows the latest visit — here, the move-out — and how many changes since move-in still need a person to look at them." },
      { target: "[data-tour=ov-stats]", text: "The key numbers: rooms captured, changes found, findings waiting for review, and whether the report has been signed." },
      { target: "[data-tour=ov-rooms]", text: "Every room card opens that room's full history. Recent activity on the right shows each step the system took, as it happened." },
    ],
  },
  {
    name: "Capture", purpose: "Take photos that can be compared later.", href: "/capture",
    beats: [
      { target: "[data-tour=cap-frame]", text: "When you photograph a room, a faded copy of the move-in photo sits behind the camera so you can stand in the same spot. A live guide says “pan left” or “step back” until the view lines up." },
      { target: "[data-testid=coverage]", text: "The checklist shows what this room's photos should include — ceiling, floor, windows — and flags anything missing, with the reason it matters." },
      { target: "[data-tour=cap-pipeline]", text: "Every photo goes through these steps: a quality check on the device, a SHA-256 fingerprint of the original file, a signed upload straight to Cloudinary, then AI analysis." },
      { target: "button[title='Capture with your phone']", text: "No camera on the laptop? “Phone” shows a QR code. Scan it, take the photo on your phone, and it appears here live — no login on the phone." },
      { target: "[role=dialog][aria-label='Capture with your phone']", click: "button[title='Capture with your phone']", text: "The link inside the QR code is signed by the server, works for 15 minutes, and only for this one room." },
    ],
  },
  {
    name: "Compare", purpose: "What changed between two visits — and exactly where.", href: "/compare?room=room-kitchen",
    beats: [
      { target: "[data-tour=cmp-viewer]", text: "The move-in and move-out photos of the same room. Drag the slider to compare them." },
      { target: "[data-tour=cmp-viewer]", event: "compare:diff", text: "Pixel view: the photos are aligned and the lighting is evened out, so only real changes light up. The AI says what changed; the pixels say exactly where." },
      { target: "[data-tour=cmp-ai]", text: "The AI comparison lists each change as new, worse, or found only by pixels. It describes what it sees and never says who is to blame." },
    ],
  },
  {
    name: "A room through time", purpose: "Every visit of one room, in order.", href: "/rooms/room-bathroom",
    beats: [
      { target: "[data-tour=room-tm]", event: "room:play", text: "The room's time machine plays from move-in to move-out. Each finding appears at the visit where it was first seen." },
      { target: "[data-tour=room-history]", text: "Below: findings per visit and how much of the room each visit's photos covered. Growth is measured too — this grout stain grew about three times between the last two visits." },
    ],
  },
  {
    name: "Review", purpose: "People decide, not the AI.", href: reviewHref,
    beats: [
      { target: "[data-tour=rv-photo]", text: "Every AI finding is checked by a person. The box shows exactly where the change is, and the chip shows the capture time stored inside the photo file." },
      { target: "[data-testid=finding-facts]", text: "Here: the size in centimetres once a scale is set, how much it grew since the last visit, and neutral context on whether this is typical of everyday use. It never says who is responsible." },
      { target: "[data-tour=rv-queue]", text: "Weak findings go to the “Not sure” tab instead of being shown as fact — for example when the pixels show no change at that spot." },
      { target: "[data-tour=rv-decide]", text: "One key decides each finding: A to accept, R to reject, E to edit. Only accepted findings reach the report." },
      { target: "[data-testid=repair-panel]", text: "The owner can turn a finding into a repair job. A repair photo taken from the same spot is checked automatically: is the change really gone?" },
      { target: "[data-testid=voice-idle]", text: "Tenant and owner can agree, dispute, write — or leave a voice note in English or Hindi, transcribed by the browser." },
    ],
  },
  {
    name: "Repairs", purpose: "Repairs, with proof.", href: "/repairs",
    beats: [{ target: "h1", text: "All repair jobs on one board: requested, in progress and repaired — each with its before and after photos and the automatic check." }],
  },
  {
    name: "Evidence report", purpose: "One document both sides can check and sign.", href: "/report",
    beats: [
      { target: "[data-tour=rep-header]", text: "The report contains only findings a person has accepted. Faces are pixelated by Cloudinary before anything is shared." },
      { target: "[data-tour=rep-header]", click: "[data-testid=lang-hi]", text: "One click switches the report to Hindi. The report's own wording is translated by hand; the AI's descriptions are machine-translated and marked as such." },
      { target: "[data-tour=rep-integrity]", click: "[data-testid=lang-en]", text: "Every photo's SHA-256 fingerprint is listed with the capture time from the file. Anyone can drop a photo on the Verify page to prove it is the original." },
      { target: "[data-tour=rep-signoff]", text: "Tenant and owner sign the report's fingerprint. If anything changes afterwards, the signature visibly breaks." },
    ],
  },
  {
    name: "Re-let studio", purpose: "From evidence to a listing.", href: "/relet",
    beats: [{ target: "[data-tour=relet-img]", text: "The same originals become listing photos with Cloudinary's generative AI — clearly watermarked, and never allowed back into the evidence." }],
  },
  {
    name: "Media lab", purpose: "One original; every version is a URL.", href: "/lab",
    beats: [
      { target: "[data-tour=lab-img]", text: "Every version of a photo — resized, cropped, enhanced — is a Cloudinary URL on top of the untouched original." },
      { target: "[data-tour=lab-url]", text: "Change a setting and the URL, file size and format update live, measured on real delivery." },
    ],
  },
  {
    name: "That's RentalMove", purpose: "One honest record of a home, from move-in to move-out.", href: "/",
    beats: [{ text: "Photos checked on capture, changes found by AI and pixels, every decision made by a person, and a report both sides can verify. Thank you for watching." }],
  },
];

/** Every beat in order, with its chapter. The tour's `step` indexes this list. */
const FLAT = CHAPTERS.flatMap((c, ci) => c.beats.map((b, bi) => ({ ...b, ci, bi })));

const CARD_MS = 2800;
const SPEEDS = [0.75, 1, 1.5] as const;
/** Reading time: about 3 words per second, never shorter than 5.5 s. */
const readMs = (text: string) => Math.min(12000, Math.max(5500, 2200 + text.split(/\s+/).length * 330));

export function TourOverlay() {
  const { tour, setTour } = useStudio();
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const [ready, setReady] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [speed, setSpeed] = useState<number>(1);
  const targetEl = useRef<Element | null>(null);
  const beat = FLAT[Math.min(tour.step, FLAT.length - 1)];
  const chapter = CHAPTERS[beat.ci];
  const showsCard = beat.bi === 0;
  const total = (showsCard ? CARD_MS : 0) + readMs(beat.text);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("present")) setTour({ active: true, step: 0, playing: true });
    try { const s = Number(localStorage.getItem("rm:tour-speed")); if (SPEEDS.includes(s as any)) setSpeed(s); } catch {}
  }, [setTour]);
  const changeSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed as any) + 1) % SPEEDS.length];
    setSpeed(next);
    try { localStorage.setItem("rm:tour-speed", String(next)); } catch {}
  };

  // Navigate when entering a chapter.
  useEffect(() => {
    if (!tour.active || beat.bi !== 0) return;
    const href = typeof chapter.href === "function" ? chapter.href() : chapter.href;
    if (window.location.pathname + window.location.search !== href) router.push(href);
  }, [tour.active, beat.ci]); // eslint-disable-line react-hooks/exhaustive-deps

  // Set up the beat: wait for its target, scroll to it, run its action. The clock starts
  // only once the page is ready, so slow loads never cut a caption short.
  useEffect(() => {
    if (!tour.active) return;
    setElapsed(0);
    setReady(false);
    setRect(null);
    targetEl.current = null;
    let cancelled = false;
    let clicked = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const t0 = performance.now();
    const find = () => {
      if (cancelled) return;
      if (beat.click) {
        const c = document.querySelector(beat.click) as HTMLElement | null;
        if (c && !clicked) { clicked = true; c.click(); }
      }
      const el = beat.target ? document.querySelector(beat.target) : null;
      const loading = document.body.innerText.includes("Loading your property memory");
      if ((beat.target && !el) || loading) {
        if (performance.now() - t0 < 8000) { timers.push(setTimeout(find, 200)); return; }
      }
      targetEl.current = el;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (beat.event) timers.push(setTimeout(() => window.dispatchEvent(new CustomEvent("rm:tour", { detail: beat.event })), 900));
      setReady(true);
    };
    timers.push(setTimeout(find, showsCard ? 600 : 150));
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [tour.active, tour.step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the spotlight on the target while the page scrolls or animates.
  useEffect(() => {
    if (!tour.active || !ready) return;
    let raf = 0;
    const loop = () => {
      const el = targetEl.current;
      setRect(el && el.isConnected ? el.getBoundingClientRect() : null);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tour.active, ready, tour.step]);

  // Clock.
  useEffect(() => {
    if (!tour.active || !tour.playing || !ready) return;
    const base = elapsed;
    const start = performance.now();
    const id = setInterval(() => {
      const e = base + (performance.now() - start) * speed;
      setElapsed(e);
      if (e >= total) {
        clearInterval(id);
        if (tour.step < FLAT.length - 1) setTour({ step: tour.step + 1 });
        else setTour({ playing: false });
      }
    }, 50);
    return () => clearInterval(id);
  }, [tour.active, tour.playing, tour.step, ready, speed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!tour.active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTour({ active: false });
      if (e.key === "ArrowRight" && e.shiftKey) setTour({ step: Math.min(FLAT.length - 1, tour.step + 1) });
      if (e.key === "ArrowLeft" && e.shiftKey) setTour({ step: Math.max(0, tour.step - 1) });
      if (e.key === "p") setTour({ playing: !tour.playing });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tour, setTour]);

  if (!tour.active) return null;
  const inCard = showsCard && elapsed < CARD_MS && ready;
  const pad = 10;
  const chapterBeats = chapter.beats.length;
  const chapterDone = (ci: number) => (ci < beat.ci ? 1 : ci > beat.ci ? 0 : (beat.bi + Math.min(1, elapsed / total)) / chapterBeats);

  return (
    <div className="no-print">
      {/* Spotlight: a rounded hole in a dim layer, following the target. */}
      {!inCard && rect && rect.width > 0 && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[65] rounded-2xl ring-2 ring-signal/80 transition-all duration-500 ease-out"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: "0 0 0 9999px rgba(10,10,12,.55)" }}
        />
      )}

      {/* Chapter title card. */}
      {inCard && (
        <div className="pointer-events-none fixed inset-0 z-[66] grid place-items-center bg-[#0b0c0e]/80 backdrop-blur-sm" data-testid="tour-card">
          <div className="px-6 text-center text-white animate-fade-up" key={beat.ci}>
            <div className="font-mono text-[12px] uppercase tracking-[0.3em] text-white/50">Chapter {beat.ci + 1} of {CHAPTERS.length}</div>
            <div className="mt-3 font-display text-[56px] leading-none md:text-[80px]">{chapter.name}</div>
            <p className="mx-auto mt-4 max-w-xl text-[18px] text-white/75">{chapter.purpose}</p>
          </div>
        </div>
      )}

      {/* Caption bar. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[70] flex justify-center px-4">
        <div className="pointer-events-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-[#111214]/92 text-white shadow-2xl backdrop-blur-xl" data-testid="tour-bar">
          <div className="flex gap-1 px-4 pt-3">
            {CHAPTERS.map((c, ci) => (
              <button key={c.name} onClick={() => setTour({ step: FLAT.findIndex((b) => b.ci === ci) })} className="h-1 flex-1 overflow-hidden rounded-full bg-white/15" aria-label={`Chapter ${ci + 1}: ${c.name}`} title={c.name}>
                <span className="block h-full bg-white transition-[width] duration-100" style={{ width: `${chapterDone(ci) * 100}%` }} />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 px-5 py-4">
            <div className="min-w-0 flex-1" key={tour.step}>
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">
                {String(beat.ci + 1).padStart(2, "0")} · {chapter.name}{chapterBeats > 1 ? ` · ${beat.bi + 1}/${chapterBeats}` : ""}
              </div>
              <p className={cn("mt-1 text-[15px] leading-relaxed text-white/90 transition-opacity duration-500", ready ? "opacity-100" : "opacity-40")} data-testid="tour-text">{beat.text}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button onClick={changeSpeed} className="h-8 rounded-full px-2.5 font-mono text-[11px] text-white/70 hover:bg-white/10 hover:text-white" aria-label="Playback speed" title="Playback speed" data-testid="tour-speed">{speed}×</button>
              <button onClick={() => setTour({ step: Math.max(0, tour.step - 1) })} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Previous"><ChevronLeft className="size-4" /></button>
              <button onClick={() => setTour({ playing: !tour.playing })} className="grid size-10 place-items-center rounded-full bg-white text-black" aria-label={tour.playing ? "Pause" : "Play"}>{tour.playing ? <Pause className="size-4" /> : <Play className="ml-0.5 size-4" />}</button>
              <button onClick={() => setTour({ step: Math.min(FLAT.length - 1, tour.step + 1) })} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Next"><ChevronRight className="size-4" /></button>
              <button onClick={() => setTour({ active: false })} className="ml-1 grid size-9 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white" aria-label="Exit tour"><X className="size-4" /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
