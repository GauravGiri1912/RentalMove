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

/** Stable id of a checklist item ("Shower or bath" -> "shower_or_bath"); what a photo is filed under. */
export const itemKey = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/** A person's decision that an item will not be photographed: skipped (with a reason) or not applicable. */
export interface Resolution { kind: "skip" | "na"; reason: string; by?: string | null; at?: string }

/** What one photo contributes: the item its photographer filed it under, and what the vision model saw in it. */
export interface PhotoInfo { id: string; slot?: string | null; areas?: string[] | null }

export interface CoverageItem {
  key: string;
  label: string;
  why: string;
  /** Photographed: a photo was filed under this item, or the vision model saw the area in some photo. */
  covered: boolean;
  source: "declared" | "seen" | null;
  /** Set only when NOT photographed but a person said why. */
  resolved: Resolution | null;
  /** The model analysed the photo filed under this item and could not see it there. */
  check: string | null;
}

export interface CoverageResult { total: number; covered: number; skipped: number; items: CoverageItem[] }

/**
 * The room's required items vs what the visit's photos show. Two independent sources:
 * the photographer files each photo under an item (it is what they say they shot)
 * and the vision model reports which areas it can see (used to fill gaps and to cross-check).
 */
export function computeCoverage(category: string, photos: PhotoInfo[], resolutions: Record<string, Resolution> = {}): CoverageResult {
  const items: CoverageItem[] = (CHECKLIST[category] ?? []).map((i) => {
    const key = itemKey(i.label);
    const filed = photos.filter((p) => p.slot === key);
    const seen = photos.some((p) => p.areas?.some((a) => (i.areas as string[]).includes(a)));
    const covered = filed.length > 0 || seen;
    const analysed = filed.filter((p) => Array.isArray(p.areas));
    const check = !seen && filed.length > 0 && analysed.length === filed.length
      ? `The vision model could not see ${i.label.toLowerCase()} in the photo filed under it. Check it is the right photo.` : null;
    return { key, label: i.label, why: i.why, covered, source: filed.length ? ("declared" as const) : seen ? ("seen" as const) : null, resolved: !covered ? resolutions[key] ?? null : null, check };
  });
  return { total: items.length, covered: items.filter((i) => i.covered).length, skipped: items.filter((i) => i.resolved).length, items };
}

/** Every item is either photographed or has a recorded reason. */
export const isResolved = (r: CoverageResult) => r.total > 0 && r.items.every((i) => i.covered || i.resolved);

export function coverageFor(category: string, seen: string[]): CoverageResult {
  return computeCoverage(category, [{ id: "seen", areas: seen }]);
}

/** Keeps only known area names (the model's output is untrusted). */
export function cleanAreas(raw: unknown): Area[] {
  if (!Array.isArray(raw)) return [];
  const ok = new Set<string>(AREAS);
  return [...new Set(raw.map((x) => String(x).toLowerCase().trim().replace(/[\s-]+/g, "_")).filter((x) => ok.has(x)))] as Area[];
}
