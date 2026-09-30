/**
 * coverage.ts — what each room's photos should show, and what is still missing.
 *
 * The vision model reports which areas are visible in every photo (a fixed vocabulary).
 * Each room type has a checklist; anything not seen in any photo of that visit is a gap,
 * shown with the reason it matters ("mould usually starts on bathroom ceilings").
 */

export const AREAS = [
  "ceiling", "walls", "floor", "window", "door", "skirting", "cabinets", "worktop", "hob_oven",
  "sink", "shower", "bath", "toilet", "tiles_grout", "radiator", "light_fittings", "sockets_switches",
] as const;
export type Area = (typeof AREAS)[number];

export const AREA_LABEL: Record<Area, string> = {
  ceiling: "Ceiling", walls: "Walls", floor: "Floor", window: "Window & frame", door: "Door", skirting: "Skirting boards",
  cabinets: "Cabinets", worktop: "Worktop", hob_oven: "Hob & oven", sink: "Sink", shower: "Shower", bath: "Bath",
  toilet: "Toilet", tiles_grout: "Tiles & grout", radiator: "Radiator", light_fittings: "Light fittings", sockets_switches: "Sockets & switches",
};

interface Item { label: string; areas: Area[]; why: string }

/** Per room type; each item is satisfied when any of its areas is seen. */
export const CHECKLIST: Record<string, Item[]> = {
  kitchen: [
    { label: "Cabinets", areas: ["cabinets"], why: "Doors and edges take the most knocks." },
    { label: "Worktop", areas: ["worktop"], why: "Burns and cuts show up here first." },
    { label: "Hob & oven", areas: ["hob_oven"], why: "Often checked closely at move-out." },
    { label: "Sink", areas: ["sink"], why: "Leaks under and around sinks spread unseen." },
    { label: "Floor", areas: ["floor"], why: "Scratches and water marks." },
    { label: "Ceiling", areas: ["ceiling"], why: "Steam and grease marks collect above the hob." },
  ],
  bathroom: [
    { label: "Shower or bath", areas: ["shower", "bath"], why: "Seals and trays wear first." },
    { label: "Tiles & grout", areas: ["tiles_grout"], why: "Grout discolouration spreads over time." },
    { label: "Toilet", areas: ["toilet"], why: "Cracks and seal condition." },
    { label: "Sink", areas: ["sink"], why: "Chips and leaks." },
    { label: "Floor", areas: ["floor"], why: "Water damage near the shower." },
    { label: "Ceiling", areas: ["ceiling"], why: "Mould usually starts on bathroom ceilings." },
  ],
  bedroom: [
    { label: "Walls", areas: ["walls"], why: "Scuffs and fixing holes." },
    { label: "Floor", areas: ["floor"], why: "Furniture marks." },
    { label: "Window & frame", areas: ["window"], why: "Condensation damages frames." },
    { label: "Door", areas: ["door"], why: "Handles and edges." },
    { label: "Ceiling", areas: ["ceiling"], why: "Damp patches show here first." },
  ],
  living_room: [
    { label: "Walls", areas: ["walls"], why: "Scuffs and fixing holes." },
    { label: "Floor", areas: ["floor"], why: "Scratches and dents from furniture." },
    { label: "Window & frame", areas: ["window"], why: "Condensation damages frames." },
    { label: "Door", areas: ["door"], why: "Handles and edges." },
    { label: "Ceiling", areas: ["ceiling"], why: "Damp patches and cracks." },
  ],
};

export interface CoverageResult { total: number; covered: number; items: { label: string; covered: boolean; why: string }[] }

export function coverageFor(category: string, seen: string[]): CoverageResult {
  const set = new Set(seen);
  const items = (CHECKLIST[category] ?? []).map((i) => ({ label: i.label, why: i.why, covered: i.areas.some((a) => set.has(a)) }));
  return { total: items.length, covered: items.filter((i) => i.covered).length, items };
}

/** Keeps only known area names (the model's output is untrusted). */
export function cleanAreas(raw: unknown): Area[] {
  if (!Array.isArray(raw)) return [];
  const ok = new Set<string>(AREAS);
  return [...new Set(raw.map((x) => String(x).toLowerCase().trim().replace(/[\s-]+/g, "_")).filter((x) => ok.has(x)))] as Area[];
}
