// Data-driven floor plan engine with architectural defaults and dynamic synthesis.
// Camera pins record where each room's inspection photo is taken from, so re-captures line up.

export interface PlanRoom {
  /** Room category this plan area represents (mapped to the property's real room ids). */
  category: string | null;
  label: string;
  rect: [number, number, number, number]; // x, y, w, h
  area_m2: number;
}

export interface Pin {
  category: string;
  x: number;
  y: number;
  /** Direction the camera faces, degrees; 0 = east, 90 = south (SVG y-down). */
  angle: number;
  fov: number;
}

export interface DoorOpening {
  gap: [number, number, number, number];
  hinge: [number, number];
  r: number;
  a0: number;
  a1: number;
}

export interface FloorPlanSpec {
  unitLabel: string;
  w: number;
  h: number;
  rooms: PlanRoom[];
  doors: DoorOpening[];
  windows: [number, number, number, number][];
  pins: Pin[];
}

export const PLAN = { w: 1000, h: 640 };

export const PLAN_ROOMS: PlanRoom[] = [
  { category: "living_room", label: "Living room", rect: [40, 40, 460, 560], area_m2: 25.8 },
  { category: "kitchen", label: "Kitchen", rect: [500, 40, 260, 260], area_m2: 6.8 },
  { category: "bathroom", label: "Bathroom", rect: [760, 40, 200, 260], area_m2: 5.2 },
  { category: null, label: "Hall", rect: [500, 300, 460, 80], area_m2: 3.7 },
  { category: "bedroom", label: "Primary bedroom", rect: [500, 380, 460, 220], area_m2: 10.1 },
];

/** Door openings as wall gaps: [x1, y1, x2, y2] along a wall, plus swing arc. */
export const DOORS: DoorOpening[] = [
  { gap: [560, 300, 640, 300], hinge: [560, 300], r: 80, a0: 0, a1: -90 }, // kitchen
  { gap: [800, 300, 870, 300], hinge: [870, 300], r: 70, a0: 180, a1: 270 }, // bathroom
  { gap: [500, 318, 500, 372], hinge: [500, 318], r: 54, a0: 90, a1: 180 }, // living
  { gap: [540, 380, 610, 380], hinge: [540, 380], r: 70, a0: 0, a1: 90 }, // bedroom
  { gap: [960, 310, 960, 370], hinge: [960, 310], r: 60, a0: 90, a1: 180 }, // entry
];

export const WINDOWS: [number, number, number, number][] = [
  [120, 40, 380, 40],
  [40, 200, 40, 420],
  [560, 40, 700, 40],
  [820, 40, 900, 40],
  [700, 600, 900, 600],
];

export const PINS: Pin[] = [
  { category: "kitchen", x: 545, y: 280, angle: -55, fov: 62 },
  { category: "bathroom", x: 780, y: 282, angle: -70, fov: 62 },
  { category: "bedroom", x: 522, y: 580, angle: -22, fov: 66 },
  { category: "living_room", x: 470, y: 575, angle: -128, fov: 70 },
];

export const DEFAULT_PLAN_SPEC: FloorPlanSpec = {
  unitLabel: "Unit 4B",
  w: PLAN.w,
  h: PLAN.h,
  rooms: PLAN_ROOMS,
  doors: DOORS,
  windows: WINDOWS,
  pins: PINS,
};

/**
 * Resolves floor plan specification for a property.
 * If property rooms match standard apartment categories, uses architectural template with dynamic unit label;
 * otherwise synthesizes a data-driven proportional grid layout.
 */
export function getFloorPlanForProperty(
  property?: { unit_label?: string; address_label?: string } | null,
  rooms?: Array<{ id: string; name: string; category: string }>
): FloorPlanSpec {
  const unitLabel = property?.unit_label || "Floor Plan";

  if (!rooms || rooms.length === 0) {
    return { ...DEFAULT_PLAN_SPEC, unitLabel };
  }

  const standardCats = new Set(["living_room", "kitchen", "bathroom", "bedroom"]);
  const hasStandard = rooms.some((r) => standardCats.has(r.category));

  if (hasStandard) {
    return { ...DEFAULT_PLAN_SPEC, unitLabel };
  }

  // Synthesize proportional grid layout for custom properties
  const w = 1000;
  const h = 640;
  const padding = 40;
  const cols = Math.min(rooms.length, 3);
  const rows = Math.ceil(rooms.length / cols);
  const cellW = (w - padding * 2 - (cols - 1) * 20) / cols;
  const cellH = (h - padding * 2 - (rows - 1) * 20) / rows;

  const dynamicRooms: PlanRoom[] = rooms.map((r, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = padding + col * (cellW + 20);
    const y = padding + row * (cellH + 20);
    return {
      category: r.category,
      label: r.name,
      rect: [Math.round(x), Math.round(y), Math.round(cellW), Math.round(cellH)],
      area_m2: Math.round(((cellW * cellH) / 10000) * 10) / 10,
    };
  });

  const dynamicPins: Pin[] = dynamicRooms.map((dr) => ({
    category: dr.category || "unknown",
    x: Math.round(dr.rect[0] + dr.rect[2] * 0.2),
    y: Math.round(dr.rect[1] + dr.rect[3] * 0.8),
    angle: -45,
    fov: 65,
  }));

  return {
    unitLabel,
    w,
    h,
    rooms: dynamicRooms,
    doors: [],
    windows: [],
    pins: dynamicPins,
  };
}

/** The plan applies when the property has room categories to display. */
export function hasPlan(rooms: { category: string }[]): boolean {
  if (!rooms || rooms.length === 0) return false;
  const cats = new Set(rooms.map((r) => r.category));
  return PLAN_ROOMS.some((p) => p.category && cats.has(p.category));
}

export function cone(p: Pin, len = 150) {
  const a = (p.angle * Math.PI) / 180;
  const h = ((p.fov / 2) * Math.PI) / 180;
  const x1 = p.x + Math.cos(a - h) * len, y1 = p.y + Math.sin(a - h) * len;
  const x2 = p.x + Math.cos(a + h) * len, y2 = p.y + Math.sin(a + h) * len;
  return `M${p.x},${p.y} L${x1.toFixed(1)},${y1.toFixed(1)} A${len},${len} 0 0 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`;
}

export function arc(d: DoorOpening) {
  const [hx, hy] = d.hinge;
  const p = (deg: number) => [hx + Math.cos((deg * Math.PI) / 180) * d.r, hy + Math.sin((deg * Math.PI) / 180) * d.r];
  const [sx, sy] = p(d.a0), [ex, ey] = p(d.a1);
  const sweep = d.a1 > d.a0 ? 1 : 0;
  return { leaf: `M${hx},${hy} L${ex.toFixed(1)},${ey.toFixed(1)}`, swing: `M${sx.toFixed(1)},${sy.toFixed(1)} A${d.r},${d.r} 0 0 ${sweep} ${ex.toFixed(1)},${ey.toFixed(1)}` };
}
