/**
 * kit.ts — the free "move-in kit": a tenant with no account photographs every room of a new
 * home, guided by a shot list, and gets a sealed record to keep and send.
 *
 * Pure, browser-safe logic only (rooms, shot lists, text cleanup) — it must not import Node's
 * crypto, or the browser would download a polyfill. Tokens and the sealing hash live in
 * kit-crypto.ts; server-side storage lives in kit-node.ts.
 *
 * Access: the link IS the permission. A *write* token (kept by the tenant) can add photos,
 * seal and delete the kit; a *read* token (for the landlord, family, a deposit scheme) can only
 * open the report. Both are HMACs, so neither can be forged or widened.
 */

import { CHECKLIST, type Area } from "./coverage";
import type { RoomCategory } from "./schemas";

// ---------------------------------------------------------------------------
// Rooms and shot lists
// ---------------------------------------------------------------------------

export const KIT_ROOM_TYPES: { category: RoomCategory; label: string; plural: string; max: number }[] = [
  { category: "living_room", label: "Living room", plural: "Living rooms", max: 3 },
  { category: "kitchen", label: "Kitchen", plural: "Kitchens", max: 2 },
  { category: "bedroom", label: "Bedroom", plural: "Bedrooms", max: 6 },
  { category: "bathroom", label: "Bathroom", plural: "Bathrooms", max: 4 },
  { category: "exterior", label: "Balcony / outdoor", plural: "Balconies / outdoor", max: 2 },
];
export const MAX_KIT_ROOMS = 12;
export const MAX_KIT_PHOTOS = 100;
export const MAX_DAMAGE_SHOTS = 3;

export interface Shot {
  id: string;
  label: string;
  /** What to do, in one sentence. */
  prompt: string;
  /** Why it matters (shown small). */
  tip: string;
  /** Room areas this photo covers (feeds the app's room checklist if the kit is ever opened there). */
  areas: Area[];
}

const PROMPTS: Record<string, string> = {
  "Cabinets": "Photograph the cabinet doors, handles and edges.",
  "Worktop": "Photograph the whole worktop surface from above.",
  "Hob & oven": "Photograph the hob, then open the oven door and photograph inside.",
  "Sink": "Photograph the sink, the taps and the cupboard underneath.",
  "Floor": "Photograph the floor. Stand back so a large part of it is in view.",
  "Ceiling": "Point the camera up: the whole ceiling, corners included.",
  "Shower or bath": "Photograph the shower or bath, the tray and the glass or curtain.",
  "Tiles & grout": "Photograph the tiles and the grout lines, close enough to see the joints.",
  "Toilet": "Photograph the toilet, the seat and the floor around it.",
  "Walls": "Photograph each wall. Stand back so the whole wall fits.",
  "Window & frame": "Photograph the window, its frame and the sill.",
  "Door": "Photograph the door, the handle and the frame.",
};

const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Shot list per room type: a wide shot, then the room's checklist items, then close-ups of existing damage. */
export function shotListFor(category: string): Shot[] {
  const items = CHECKLIST[category] ?? [
    { label: "Walls", areas: ["walls"] as Area[], why: "Scuffs and fixing holes." },
    { label: "Floor", areas: ["floor"] as Area[], why: "Scratches and marks." },
    { label: "Ceiling", areas: ["ceiling"] as Area[], why: "Damp patches and cracks." },
  ];
  return [
    { id: "wide", label: "Whole room", prompt: "Stand in the doorway and photograph the whole room.", tip: "Shows the room is the one you moved into.", areas: [] },
    ...items.map((i) => ({ id: slug(i.label), label: i.label, prompt: PROMPTS[i.label] ?? `Show the ${i.label.toLowerCase()} clearly.`, tip: i.why, areas: i.areas })),
  ];
}

/** Optional extra close-ups of damage that is already there (ids damage-1 … damage-3). */
export const isDamageShot = (id: string) => new RegExp(`^damage-[1-${MAX_DAMAGE_SHOTS}]$`).test(id);

export function isValidShot(category: string, shotId: string): boolean {
  return isDamageShot(shotId) || shotListFor(category).some((s) => s.id === shotId);
}

export function shotLabel(category: string, shotId: string): string {
  if (isDamageShot(shotId)) return `Existing damage ${shotId.split("-")[1]}`;
  return shotListFor(category).find((s) => s.id === shotId)?.label ?? shotId;
}

/** Room list for a kit from "how many of each" counts, named "Bedroom 1", "Bedroom 2"… */
export function buildRooms(counts: Partial<Record<RoomCategory, number>>): { name: string; category: RoomCategory }[] {
  const out: { name: string; category: RoomCategory }[] = [];
  for (const t of KIT_ROOM_TYPES) {
    const n = Math.max(0, Math.min(t.max, Math.floor(counts[t.category] ?? 0)));
    for (let i = 1; i <= n; i++) out.push({ name: n > 1 ? `${t.label} ${i}` : t.label, category: t.category });
  }
  return out.slice(0, MAX_KIT_ROOMS);
}

/** Plain-text cleanup for names typed into the public form. */
export const cleanText = (s: unknown, max: number) => String(s ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
