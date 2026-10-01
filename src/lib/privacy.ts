/**
 * privacy.ts — hide personal items (letters, bills, documents, screens) in shared copies.
 *
 * Areas to hide come from three sources: Cloudinary OCR (precise text boxes, when the add-on
 * is enabled), the vision model (approximate boxes around papers/screens/photos, padded), or
 * a person drawing a box. They are applied as Cloudinary e_pixelate_region steps on every
 * rendition that leaves the app (share links, report evidence images, listing photos). The
 * stored original is never altered, and the text OCR reads is never stored — only boxes.
 * Pure functions here; Cloudinary/model calls live in privacy-node.ts.
 */

export type Box = [number, number, number, number];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const area = (b: Box) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);

/** Grow a box by a fraction of its own size (and at least `min` of the frame) on every side. */
export function pad(b: Box, frac: number, min = 0.01): Box {
  const px = Math.max(min, (b[2] - b[0]) * frac), py = Math.max(min, (b[3] - b[1]) * frac);
  return [clamp01(b[0] - px), clamp01(b[1] - py), clamp01(b[2] + px), clamp01(b[3] + py)];
}

const near = (a: Box, b: Box, gap: number) => a[0] - gap <= b[2] && b[0] - gap <= a[2] && a[1] - gap <= b[3] && b[1] - gap <= a[3];
const union = (a: Box, b: Box): Box => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

/** Merges overlapping/nearby boxes (lines of one letter become one block); keeps at most `max`. */
export function mergeBoxes(boxes: Box[], gap = 0.02, max = 8): Box[] {
  let list = boxes.filter((b) => b[2] > b[0] && b[3] > b[1]).map((b) => [...b] as Box);
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++)
        if (near(list[i], list[j], gap)) { list[i] = union(list[i], list[j]); list.splice(j, 1); merged = true; break outer; }
  }
  // Too many separate areas: merge the smallest into its nearest neighbour until within `max`.
  while (list.length > max) {
    list.sort((a, b) => area(a) - area(b));
    const s = list.shift()!;
    let bi = 0, bd = Infinity;
    list.forEach((b, i) => { const d = Math.hypot((s[0] + s[2]) / 2 - (b[0] + b[2]) / 2, (s[1] + s[3]) / 2 - (b[1] + b[3]) / 2); if (d < bd) { bd = d; bi = i; } });
    list[bi] = union(list[bi], s);
  }
  return list;
}

/**
 * Text boxes from Cloudinary's adv_ocr result (Google Vision format), normalised to 0..1.
 * Uses the word annotations (index 0 is the whole text) and merges them into blocks.
 * Only geometry is returned; the recognised text is deliberately dropped.
 */
export function ocrBoxes(info: any, width: number, height: number): Box[] {
  const words: any[] = info?.data?.[0]?.textAnnotations?.slice(1) ?? [];
  const boxes: Box[] = [];
  for (const w of words) {
    const v: { x?: number; y?: number }[] = w?.boundingPoly?.vertices ?? [];
    if (v.length < 3) continue;
    const xs = v.map((p) => p.x ?? 0), ys = v.map((p) => p.y ?? 0);
    boxes.push([clamp01(Math.min(...xs) / width), clamp01(Math.min(...ys) / height), clamp01(Math.max(...xs) / width), clamp01(Math.max(...ys) / height)]);
  }
  return mergeBoxes(boxes.map((b) => pad(b, 0.15, 0.006)), 0.025);
}

/**
 * Cloudinary steps that pixelate each region. Coordinates are fractions of the image
 * (verified: same result as pixel coordinates, and still correct after a resize), so they
 * hold whatever size or orientation Cloudinary delivers. Values must stay below 1 — Cloudinary
 * reads 1 or more as pixels. Put these first in the chain so every derived copy carries them.
 */
export function pixelateSteps(regions: { bbox: Box }[], width?: number | null, height?: number | null): string[] {
  const block = width && height ? Math.max(10, Math.round(Math.max(width, height) / 60)) : 20;
  const r4 = (v: number) => Math.min(0.9999, Math.max(0, v)).toFixed(4);
  return regions
    .map(({ bbox }) => {
      const x1 = clamp01(bbox[0]), y1 = clamp01(bbox[1]), w = clamp01(bbox[2]) - x1, h = clamp01(bbox[3]) - y1;
      return w >= 0.005 && h >= 0.005 ? `e_pixelate_region:${block},x_${r4(x1)},y_${r4(y1)},w_${r4(w)},h_${r4(h)}` : "";
    })
    .filter(Boolean);
}

/** Findings a hide-region would cover (so a person can decide; evidence must not vanish silently). */
export function coversFinding(region: Box, findings: { id: string; bbox: Box }[], minShare = 0.3): string[] {
  return findings
    .filter((f) => {
      const ix = Math.max(0, Math.min(region[2], f.bbox[2]) - Math.max(region[0], f.bbox[0]));
      const iy = Math.max(0, Math.min(region[3], f.bbox[3]) - Math.max(region[1], f.bbox[1]));
      return area(f.bbox) > 0 && (ix * iy) / area(f.bbox) >= minShare;
    })
    .map((f) => f.id);
}

/**
 * Snaps a loose model box onto the text-like pixels around it ("model says what, pixels say
 * where"). Printed or written text is a dense patch of strong, short edges: cells with many
 * strong gradients are marked and connected into patches. A patch counts only if at least
 * 35% of it lies inside the model's box — floorboards, window bars and furniture edges are
 * edge-dense too, but stretch far beyond the item, so they are rejected — and the result
 * never extends more than half the box's size beyond it (a floor full of findings must not
 * be hidden). Falls back to the padded model box when nothing text-like is found.
 */
export function snapToText(g: { w: number; h: number; data: ArrayLike<number> }, box: Box, opts: { cell?: number; strong?: number; minShare?: number; maxGrow?: number } = {}): { bbox: Box; snapped: boolean } {
  const cell = opts.cell ?? 8, strong = opts.strong ?? 60, minShare = opts.minShare ?? 0.12, maxGrow = opts.maxGrow ?? 2.5;
  const { w, h, data } = g;
  const cols = Math.floor(w / cell), rows = Math.floor(h / cell);
  // Search window (and hard limit for the result): the model box grown by half its size.
  const bw = box[2] - box[0], bh = box[3] - box[1];
  const win: Box = [clamp01(box[0] - bw / 2), clamp01(box[1] - bh / 2), clamp01(box[2] + bw / 2), clamp01(box[3] + bh / 2)];
  const c0 = Math.floor(win[0] * cols), c1 = Math.ceil(win[2] * cols), r0 = Math.floor(win[1] * rows), r1 = Math.ceil(win[3] * rows);
  const hot = new Uint8Array(cols * rows);
  for (let r = r0; r < r1; r++)
    for (let c = c0; c < c1; c++) {
      let n = 0;
      for (let y = r * cell + 1; y < (r + 1) * cell - 1 && y < h - 1; y++)
        for (let x = c * cell + 1; x < (c + 1) * cell - 1 && x < w - 1; x++) {
          const i = y * w + x;
          if (Math.abs(data[i + 1] - data[i - 1]) + Math.abs(data[i + w] - data[i - w]) > strong) n++;
        }
      if (n / (cell * cell) >= minShare) hot[r * cols + c] = 1;
    }
  // Connected patches (8-neighbour, bridging one-cell gaps between words and lines).
  const seen = new Uint8Array(cols * rows);
  const touch: Box = pad(box, 0.05, 0.01);
  let out: Box | null = null;
  for (let s = 0; s < hot.length; s++) {
    if (!hot[s] || seen[s]) continue;
    let x1 = cols, y1 = rows, x2 = 0, y2 = 0, size = 0;
    const stack = [s]; seen[s] = 1;
    while (stack.length) {
      const k = stack.pop()!, cx = k % cols, cy = (k / cols) | 0;
      size++; x1 = Math.min(x1, cx); y1 = Math.min(y1, cy); x2 = Math.max(x2, cx); y2 = Math.max(y2, cy);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < c0 || ny < r0 || nx >= c1 || ny >= r1) continue;
        const ni = ny * cols + nx;
        if (hot[ni] && !seen[ni]) { seen[ni] = 1; stack.push(ni); }
      }
    }
    if (size < 4) continue;
    const b: Box = [x1 / cols, y1 / rows, (x2 + 1) / cols, (y2 + 1) / rows];
    const ix = Math.max(0, Math.min(b[2], touch[2]) - Math.max(b[0], touch[0])), iy = Math.max(0, Math.min(b[3], touch[3]) - Math.max(b[1], touch[1]));
    if (area(b) > 0 && (ix * iy) / area(b) >= 0.35) out = out ? union(out, b) : b;
  }
  // A snap far larger than the model's own box has latched onto something else (window bars,
  // furniture edges): keep the padded model box instead.
  // Margin of at least ~1.5 grid cells: text on a cell boundary (e.g. a last line) can
  // fall just short of the "hot" threshold, and a partly visible line is still readable.
  const clip = (b: Box): Box => [Math.max(b[0], win[0]), Math.max(b[1], win[1]), Math.min(b[2], win[2]), Math.min(b[3], win[3])];
  if (out && area(out) <= maxGrow * Math.max(area(box), 0.004)) return { bbox: clip(pad(out, 0.06, 0.02)), snapped: true };
  return { bbox: pad(box, 0.25, 0.02), snapped: false };
}

/** Share of 8-px cells inside `box` that are dense with strong, short edges (text-like). */
export function textDensity(g: { w: number; h: number; data: ArrayLike<number> }, box: Box, cell = 8, strong = 60, minShare = 0.12): number {
  const cols = Math.floor(g.w / cell), rows = Math.floor(g.h / cell);
  let hot = 0, n = 0;
  for (let r = Math.floor(box[1] * rows); r < Math.ceil(box[3] * rows) && r < rows; r++)
    for (let c = Math.floor(box[0] * cols); c < Math.ceil(box[2] * cols) && c < cols; c++) {
      let k = 0;
      for (let y = r * cell + 1; y < (r + 1) * cell - 1 && y < g.h - 1; y++)
        for (let x = c * cell + 1; x < (c + 1) * cell - 1 && x < g.w - 1; x++) {
          const i = y * g.w + x;
          if (Math.abs(g.data[i + 1] - g.data[i - 1]) + Math.abs(g.data[i + g.w] - g.data[i - g.w]) > strong) k++;
        }
      n++;
      if (k / (cell * cell) >= minShare) hot++;
    }
  return n ? hot / n : 0;
}

/** Items that carry readable content (as opposed to e.g. a framed photo). */
export const TEXTUAL = /letter|bill|paper|document|envelope|note|clipboard|form|receipt|card|id|screen|tablet|phone|laptop|monitor|book|brochure|pamphlet|label|mail/i;
/**
 * Measured on real photos: boxes around real letters/screens/clipboards were 25–35% text-like
 * cells; the model's hallucinated or repeated boxes over bare floor 3–17%; plain floor 1%.
 */
export const MIN_TEXT_DENSITY = 0.2;

/**
 * Keeps a textual item only if its box really contains text-like pixels; non-textual items
 * (framed photos…) are kept as reported, since there is nothing to check them against.
 */
export function withPixelEvidence<T extends { label: string; bbox: Box }>(g: { w: number; h: number; data: ArrayLike<number> }, items: T[]): T[] {
  return items.filter((it) => !TEXTUAL.test(it.label) || textDensity(g, it.bbox) >= MIN_TEXT_DENSITY);
}

/** OCR scans allowed per calendar month (Cloudinary's free add-on plan is 50; keep a margin). */
export const OCR_MONTHLY_CAP = 45;
export const monthStartIso = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
