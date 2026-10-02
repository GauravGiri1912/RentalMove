"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Camera, ClipboardCheck, Loader2, Minus, Plus, Send, ShieldCheck } from "lucide-react";
import { KIT_ROOM_TYPES, MAX_KIT_ROOMS } from "@/lib/kit";
import { cn, fmtDate } from "@/lib/utils";

const DEFAULTS: Record<string, number> = { living_room: 1, kitchen: 1, bedroom: 1, bathroom: 1, exterior: 0 };
const STORE = "rm:kits";

interface Saved { path: string; name: string; at: string }
const readSaved = (): Saved[] => { try { return JSON.parse(localStorage.getItem(STORE) || "[]"); } catch { return []; } };

/** Public start page of the free move-in kit. No account, no install. */
export default function KitStart() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [rooms, setRooms] = useState<Record<string, number>>(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  useEffect(() => setSaved(readSaved()), []);

  const total = Object.values(rooms).reduce((a, b) => a + b, 0);
  const bump = (cat: string, d: number, max: number) => setRooms((r) => ({ ...r, [cat]: Math.max(0, Math.min(max, (r[cat] ?? 0) + d)) }));

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/kit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, address, rooms }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || "Could not start your kit.");
      try { localStorage.setItem(STORE, JSON.stringify([{ path: b.path, name, at: new Date().toISOString() }, ...readSaved()].slice(0, 5))); } catch {}
      router.push(b.path);
    } catch (err: any) {
      setError(err?.message || String(err));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl px-5 pb-16 pt-6">
      <nav className="mb-10 flex items-center gap-3">
        <Link href="/welcome" className="text-[15px] font-semibold tracking-tight">RentalMove</Link>
        <div className="flex-1" />
        <Link href="/login" className="btn-ghost">Log in</Link>
      </nav>

      <div className="eyebrow mb-3">Free move-in kit · no account needed</div>
      <h1 className="h-display text-[48px] sm:text-[60px]">Protect your <em className="text-signal">deposit</em>.</h1>
      <p className="mt-4 text-[16px] leading-relaxed text-ink-2">
        Photograph every room on the day you move in. You get a sealed, dated record to keep and send to your landlord — so at move-out, &ldquo;it was already like that&rdquo; can be shown, not argued.
      </p>

      <ol className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          { i: ClipboardCheck, t: "Pick your rooms", d: "Tell us what the home has." },
          { i: Camera, t: "Follow the shot list", d: "The phone tells you what to photograph, room by room." },
          { i: Send, t: "Send your record", d: "WhatsApp or email a link. Free." },
        ].map((s, n) => (
          <li key={s.t} className="card p-3.5">
            <div className="mb-2 flex items-center gap-2 text-[12px] text-ink-3"><span className="grid size-6 place-items-center rounded-full bg-surface-2 font-mono text-[11px] text-ink">{n + 1}</span><s.i className="size-3.5" /></div>
            <div className="text-[13.5px] font-semibold">{s.t}</div>
            <div className="mt-0.5 text-[12px] leading-snug text-ink-3">{s.d}</div>
          </li>
        ))}
      </ol>

      <form onSubmit={start} className="card mt-8 space-y-5 p-5" data-testid="kit-form">
        <label className="block">
          <span className="eyebrow">Your name</span>
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" placeholder="e.g. Asha Kumar" required data-testid="kit-name" />
        </label>
        <label className="block">
          <span className="eyebrow">Address <span className="normal-case text-ink-3">(optional)</span></span>
          <input className="input mt-1" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={120} autoComplete="street-address" placeholder="Flat, building, area" data-testid="kit-address" />
        </label>
        <div>
          <span className="eyebrow">Rooms in the home</span>
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
            {KIT_ROOM_TYPES.map((t) => (
              <li key={t.category} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="flex-1 text-[14px]">{t.label}</span>
                <button type="button" onClick={() => bump(t.category, -1, t.max)} disabled={!rooms[t.category]} className="btn-outline size-8 p-0" aria-label={`Fewer ${t.plural}`}><Minus className="size-3.5" /></button>
                <span className="w-5 text-center font-mono text-[14px]" data-testid={`count-${t.category}`}>{rooms[t.category] ?? 0}</span>
                <button type="button" onClick={() => bump(t.category, 1, t.max)} disabled={(rooms[t.category] ?? 0) >= t.max || total >= MAX_KIT_ROOMS} className="btn-outline size-8 p-0" aria-label={`More ${t.plural}`}><Plus className="size-3.5" /></button>
              </li>
            ))}
          </ul>
        </div>
        {error && <p className="rounded-lg bg-danger/[.07] px-3 py-2 text-[12.5px] text-danger" role="alert">{error}</p>}
        <button className="btn-signal h-12 w-full text-[15px]" disabled={busy || total === 0 || name.trim().length < 2} data-testid="kit-start">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <>Start my kit <ArrowRight className="size-4" /></>}
        </button>
        <p className="flex gap-2 text-[11.5px] leading-relaxed text-ink-3"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" /> Your photos stay private to you. You get two links: a private one to add photos (keep it safe) and a read-only one to share the finished record. You can delete the kit and its photos at any time.</p>
      </form>

      {saved.length > 0 && (
        <section className="mt-8" data-testid="kit-saved">
          <div className="eyebrow mb-2">Your kits on this device</div>
          <ul className="space-y-2">
            {saved.map((s) => (
              <li key={s.path}><Link href={s.path} className={cn("card flex items-center gap-3 px-4 py-3 text-[13.5px] transition hover:bg-surface-2/60")}><span className="flex-1 font-medium">{s.name}&apos;s kit</span><span className="text-[12px] text-ink-3">{fmtDate(s.at)}</span><ArrowRight className="size-4 text-ink-3" /></Link></li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
