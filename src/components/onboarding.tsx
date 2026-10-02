"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { api, useStudio } from "./providers";
import { OWNERSHIP_NOTE } from "@/lib/roles-copy";
import { cn } from "@/lib/utils";

const ROOMS = [
  { name: "Living Room", category: "living_room" },
  { name: "Kitchen", category: "kitchen" },
  { name: "Bathroom", category: "bathroom" },
  { name: "Bedroom", category: "bedroom" },
] as const;

/** First screen for an account with no property yet: start one (you become its owner), or open an invitation. */
export function Onboarding() {
  const { sessionUser, toast, signOut } = useStudio();
  const [address, setAddress] = useState("");
  const [unit, setUnit] = useState("");
  const [picked, setPicked] = useState<string[]>(ROOMS.map((r) => r.category));
  const [busy, setBusy] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/properties", { method: "POST", json: { address_label: address.trim(), unit_label: unit.trim() || "Main", rooms: ROOMS.filter((r) => picked.includes(r.category)).map((r) => ({ name: r.name, category: r.category })) } });
      window.location.href = "/";
    } catch (err: any) {
      toast({ title: "Could not create the property", detail: err?.message, tone: "danger" });
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-lg" data-testid="onboarding">
      <div className="eyebrow mb-3">Welcome{sessionUser?.name ? `, ${sessionUser.name.split(" ")[0]}` : ""}</div>
      <h1 className="h-display text-[44px]">Let&apos;s set up your <em className="text-signal">first property</em>.</h1>
      <p className="mt-3 text-[14px] leading-relaxed text-ink-2">Add the home you manage, then invite your tenant. You will photograph each room at move-in so every later visit has something to be compared with.</p>

      <form onSubmit={create} className="card mt-6 space-y-4 p-5">
        <label className="block"><span className="eyebrow">Address</span><input required maxLength={120} value={address} onChange={(e) => setAddress(e.target.value)} className="input mt-1 h-10" placeholder="e.g. 12 Park Street" data-testid="onb-address" /></label>
        <label className="block"><span className="eyebrow">Unit <span className="normal-case text-ink-3">(optional)</span></span><input maxLength={40} value={unit} onChange={(e) => setUnit(e.target.value)} className="input mt-1 h-10" placeholder="e.g. Flat 2B" data-testid="onb-unit" /></label>
        <div>
          <span className="eyebrow">Rooms to record</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {ROOMS.map((r) => (
              <button type="button" key={r.category} onClick={() => setPicked((p) => (p.includes(r.category) ? p.filter((x) => x !== r.category) : [...p, r.category]))} className={cn("rounded-lg border px-3 py-1.5 text-[13px]", picked.includes(r.category) ? "border-ink bg-ink text-bg" : "border-line")} data-testid={`onb-room-${r.category}`}>{r.name}</button>
            ))}
          </div>
        </div>
        <button type="submit" disabled={busy || !address.trim() || !picked.length} className="btn-primary h-10 w-full" data-testid="onb-create">{busy ? <Loader2 className="size-4 animate-spin" /> : <Building2 className="size-4" />} Create property</button>
        <p className="text-[11.5px] leading-relaxed text-ink-3" data-testid="ownership-note">{OWNERSHIP_NOTE}</p>
      </form>

      <div className="mt-5 rounded-xl border border-dashed border-line p-4 text-[13px] text-ink-2" data-testid="onb-tenant">
        <div className="font-semibold">Are you a tenant?</div>
        <p className="mt-1 text-ink-3">You do not need to create anything. Open the invitation link your landlord sent you; it adds you to their property as a tenant. Free move-in kit without a landlord account: <Link href="/kit" className="underline">start a kit</Link>.</p>
      </div>
      <button onClick={() => void signOut()} className="mt-4 text-[12px] text-ink-3 underline">Sign out</button>
    </div>
  );
}
