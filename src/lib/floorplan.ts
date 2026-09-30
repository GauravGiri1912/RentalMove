// Floor plan of Unit 4B in SVG units (1 unit ≈ 1 cm). Camera pins record where
// each room's inspection photo is taken from, so re-captures line up.

export interface PlanRoom {
  /** Room category this plan area represents (mapped to the property's real room ids). */
  category: string | null;
  label: string;
  rect: [number, number, number, number]; // x, y, w, h
  area_m2: number;
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
export const DOORS: { gap: [number, number, number, number]; hinge: [number, number]; r: number; a0: number; a1: number }[] = [
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

export interface Pin {
  category: string;
  x: number;
  y: number;
  /** Direction the camera faces, degrees; 0 = east, 90 = south (SVG y-down). */
  angle: number;
  fov: number;
}

export const PINS: Pin[] = [
  { category: "kitchen", x: 545, y: 280, angle: -55, fov: 62 },
  { category: "bathroom", x: 780, y: 282, angle: -70, fov: 62 },
  { category: "bedroom", x: 522, y: 580, angle: -22, fov: 66 },
  { category: "living_room", x: 470, y: 575, angle: -128, fov: 70 },
];

/** The plan applies when the property has every room category it draws. */
export function hasPlan(rooms: { category: string }[]): boolean {
  const cats = new Set(rooms.map((r) => r.category));
  return PLAN_ROOMS.every((p) => !p.category || cats.has(p.category));
}

export function cone(p: Pin, len = 150) {
  const a = (p.angle * Math.PI) / 180;
  const h = ((p.fov / 2) * Math.PI) / 180;
  const x1 = p.x + Math.cos(a - h) * len, y1 = p.y + Math.sin(a - h) * len;
  const x2 = p.x + Math.cos(a + h) * len, y2 = p.y + Math.sin(a + h) * len;
  return `M${p.x},${p.y} L${x1.toFixed(1)},${y1.toFixed(1)} A${len},${len} 0 0 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`;
}

export function arc(d: (typeof DOORS)[number]) {
  const [hx, hy] = d.hinge;
  const p = (deg: number) => [hx + Math.cos((deg * Math.PI) / 180) * d.r, hy + Math.sin((deg * Math.PI) / 180) * d.r];
  const [sx, sy] = p(d.a0), [ex, ey] = p(d.a1);
  const sweep = d.a1 > d.a0 ? 1 : 0;
  return { leaf: `M${hx},${hy} L${ex.toFixed(1)},${ey.toFixed(1)}`, swing: `M${sx.toFixed(1)},${sy.toFixed(1)} A${d.r},${d.r} 0 0 ${sweep} ${ex.toFixed(1)},${ey.toFixed(1)}` };
}
