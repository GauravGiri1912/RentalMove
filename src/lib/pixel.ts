/**
 * pixel.ts — isomorphic pixel engine (no Node or DOM APIs; runs on server and in browser).
 *
 * Vision-language models are good at saying WHAT changed and poor at saying exactly WHERE.
 * This module supplies the "where": it aligns two captures of the same room, normalises
 * exposure, finds regions whose pixels actually changed, and snaps model boxes onto them.
 *
 * All images are single-channel luminance Float32Arrays of equal size (w × h).
 */

export type BBox = [number, number, number, number];

export interface Gray {
  data: Float32Array;
  w: number;
  h: number;
}

export function lumaFromRGB(buf: ArrayLike<number>, w: number, h: number, channels: 3 | 4): Gray {
  const data = new Float32Array(w * h);
  for (let i = 0, k = 0; i < w * h; i++, k += channels) data[i] = 0.299 * buf[k] + 0.587 * buf[k + 1] + 0.114 * buf[k + 2];
  return { data, w, h };
}

function mean(g: Gray): number {
  let s = 0;
  for (let i = 0; i < g.data.length; i++) s += g.data[i];
  return s / g.data.length;
}

/** Bilinear sample with edge clamp. */
function sample(g: Gray, x: number, y: number): number {
  const x0 = Math.max(0, Math.min(g.w - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(g.h - 1, Math.floor(y)));
  const x1 = Math.min(g.w - 1, x0 + 1), y1 = Math.min(g.h - 1, y0 + 1);
  const fx = Math.max(0, Math.min(1, x - x0)), fy = Math.max(0, Math.min(1, y - y0));
  const d = g.data;
  return (d[y0 * g.w + x0] * (1 - fx) + d[y0 * g.w + x1] * fx) * (1 - fy) + (d[y1 * g.w + x0] * (1 - fx) + d[y1 * g.w + x1] * fx) * fy;
}

function downsample(g: Gray, f: number): Gray {
  const w = Math.max(1, Math.floor(g.w / f)), h = Math.max(1, Math.floor(g.h / f));
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) s += g.data[(y * f + dy) * g.w + x * f + dx];
      data[y * w + x] = s / (f * f);
    }
  return { data, w, h };
}

/** Gradient magnitude — alignment on edges is robust to exposure changes. */
function gradient(g: Gray): Gray {
  const out = new Float32Array(g.w * g.h);
  for (let y = 1; y < g.h - 1; y++)
    for (let x = 1; x < g.w - 1; x++) {
      const i = y * g.w + x;
      const gx = g.data[i + 1] - g.data[i - 1];
      const gy = g.data[i + g.w] - g.data[i - g.w];
      out[i] = Math.abs(gx) + Math.abs(gy);
    }
  return { data: out, w: g.w, h: g.h };
}

export interface Transform { dx: number; dy: number; scale: number }

/** Maps a pixel of `ref` into `mov` coordinates: scale about the centre, then shift. */
function mapPoint(t: Transform, w: number, h: number, x: number, y: number): [number, number] {
  return [(x - w / 2) * t.scale + w / 2 + t.dx, (y - h / 2) * t.scale + h / 2 + t.dy];
}

function cost(ref: Gray, mov: Gray, t: Transform, step: number): number {
  let s = 0, n = 0;
  const m = Math.ceil(Math.max(Math.abs(t.dx), Math.abs(t.dy)) + ref.w * Math.abs(1 - t.scale)) + 2;
  for (let y = m; y < ref.h - m; y += step)
    for (let x = m; x < ref.w - m; x += step) {
      const [u, v] = mapPoint(t, ref.w, ref.h, x, y);
      s += Math.abs(ref.data[y * ref.w + x] - sample(mov, u, v));
      n++;
    }
  return n ? s / n : Infinity;
}

/**
 * Finds the shift + scale that best maps `mov` onto `ref` (handheld re-captures).
 * Coarse exhaustive search at 1/4 resolution, then local refinement at full resolution.
 * Handles translation and zoom; rotation/perspective are out of scope (the capture ghost
 * keeps those small). `score` is the fraction of edge mismatch removed (0..1).
 */
export function align(ref: Gray, mov: Gray, opts: { maxShift?: number; scales?: number[] } = {}): Transform & { score: number } {
  const maxShift = opts.maxShift ?? 0.08; // fraction of width
  const scales = opts.scales ?? [0.94, 0.97, 1, 1.03, 1.06];
  const f = 4;
  const r4 = gradient(downsample(ref, f)), m4 = gradient(downsample(mov, f));
  const lim = Math.ceil((maxShift * ref.w) / f);
  let best: Transform = { dx: 0, dy: 0, scale: 1 };
  let bestC = cost(r4, m4, best, 2);
  const identity = bestC;
  for (const scale of scales)
    for (let dy = -lim; dy <= lim; dy += 1)
      for (let dx = -lim; dx <= lim; dx += 1) {
        const c = cost(r4, m4, { dx, dy, scale }, 2);
        if (c < bestC) { bestC = c; best = { dx, dy, scale }; }
      }
  // Refine at full resolution around the coarse optimum.
  const rF = gradient(ref), mF = gradient(mov);
  let t: Transform = { dx: best.dx * f, dy: best.dy * f, scale: best.scale };
  let tc = cost(rF, mF, t, 3);
  // Coordinate descent: integer shifts first, then half-pixel shifts and 0.5% zoom steps.
  for (const [shiftStep, span, scaleStep] of [[1, f, 0.005], [0.5, 1, 0.0025], [0.25, 1, 0.00125]] as const) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const ds of [-scaleStep, 0, scaleStep])
        for (let dy = -span; dy <= span; dy += shiftStep)
          for (let dx = -span; dx <= span; dx += shiftStep) {
            if (!ds && !dx && !dy) continue;
            const cand = { dx: t.dx + dx, dy: t.dy + dy, scale: t.scale + ds };
            const c = cost(rF, mF, cand, 3);
            if (c < tc - 1e-6) { tc = c; t = cand; improved = true; }
          }
    }
  }
  return { ...t, score: identity > 0 ? Math.max(0, Math.min(1, 1 - bestC / identity)) : 0 };
}

/** Resamples `mov` into `ref`'s frame using the transform from align(). */
export function warp(mov: Gray, t: Transform): Gray {
  const out = new Float32Array(mov.w * mov.h);
  for (let y = 0; y < mov.h; y++)
    for (let x = 0; x < mov.w; x++) {
      const [u, v] = mapPoint(t, mov.w, mov.h, x, y);
      out[y * mov.w + x] = sample(mov, u, v);
    }
  return { data: out, w: mov.w, h: mov.h };
}

/** 3×3 box blur — used to equalise sharpness before differencing a resampled image. */
export function blur3(g: Gray): Gray {
  const { w, h, data } = g;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          s += data[yy * w + xx]; n++;
        }
      }
      out[y * w + x] = s / n;
    }
  return { data: out, w, h };
}

/**
 * Local exposure match: scales `b` block-by-block so each block's mean matches `a`'s, with
 * the per-block gains bilinearly interpolated (no seams). Handles uneven lighting changes —
 * a window brighter at one visit, a lamp on at another — that one global gain cannot.
 * Blocks are ≥64 px and use trimmed means, so a small new mark cannot skew them.
 */
export function matchExposure(a: Gray, b: Gray, blocksX = 8): Gray {
  const { w, h } = a;
  const bx = Math.max(1, Math.min(blocksX, Math.floor(w / 64)));
  const by = Math.max(1, Math.round((bx * h) / w));
  // Trimmed mean (middle 60%): as smooth as a mean, but a small new mark falls in the
  // discarded tails instead of skewing the block's gain.
  const trimmed = (vals: number[]) => {
    vals.sort((p, q) => p - q);
    const lo = Math.floor(vals.length * 0.2), hi = Math.max(lo + 1, Math.ceil(vals.length * 0.8));
    let s = 0;
    for (let k = lo; k < hi; k++) s += vals[k];
    return s / (hi - lo);
  };
  const gains = new Float32Array(bx * by);
  for (let j = 0; j < by; j++)
    for (let i = 0; i < bx; i++) {
      const x0 = Math.floor((i * w) / bx), x1 = Math.floor(((i + 1) * w) / bx);
      const y0 = Math.floor((j * h) / by), y1 = Math.floor(((j + 1) * h) / by);
      // Trimmed means: a new mark covering less than ~20% of a block cannot move them.
      const va: number[] = [], vb: number[] = [];
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { va.push(a.data[y * w + x]); vb.push(b.data[y * w + x]); }
      const ma = trimmed(va), mb = trimmed(vb);
      gains[j * bx + i] = mb > 1e-6 ? Math.min(2, Math.max(0.5, ma / mb)) : 1;
    }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const gy = Math.min(by - 1, Math.max(0, (y + 0.5) / (h / by) - 0.5));
    const j0 = Math.floor(gy), j1 = Math.min(by - 1, j0 + 1), fy = gy - j0;
    for (let x = 0; x < w; x++) {
      const gx = Math.min(bx - 1, Math.max(0, (x + 0.5) / (w / bx) - 0.5));
      const i0 = Math.floor(gx), i1 = Math.min(bx - 1, i0 + 1), fx = gx - i0;
      const g = (gains[j0 * bx + i0] * (1 - fx) + gains[j0 * bx + i1] * fx) * (1 - fy) + (gains[j1 * bx + i0] * (1 - fx) + gains[j1 * bx + i1] * fx) * fy;
      out[y * w + x] = b.data[y * w + x] * g;
    }
  }
  return { data: out, w, h };
}

/** How far above the threshold a region's strongest pixel must be (grey levels). */
export const PEAK_MARGIN = 4;

export interface DiffResult {
  /** Denoised absolute difference per pixel (after exposure normalisation). */
  heat: Float32Array;
  changedPct: number;
  regions: BBox[];
  gain: number;
  threshold: number;
}

/**
 * Pixel difference with exposure normalisation (global gain), 3×3 denoise, threshold,
 * then connected components over coarse cells to form change regions.
 */
export function diff(a0: Gray, b0: Gray, opts: { threshold?: number; normalize?: boolean; cell?: number; minCellFrac?: number; margin?: number; smooth?: boolean } = {}): DiffResult {
  // When one image was resampled (aligned), blur both equally so interpolation softness
  // is not mistaken for change.
  const a = opts.smooth ? blur3(a0) : a0;
  const bRaw = opts.smooth ? blur3(b0) : b0;
  // Local (block) exposure match; the global gain below then stays ≈1.
  const b = opts.normalize === false ? bRaw : matchExposure(a, bRaw);
  const { w, h } = a;
  const fixedThreshold = opts.threshold;
  const cell = opts.cell ?? 12;
  const minHits = cell * cell * (opts.minCellFrac ?? 0.04);
  const margin = opts.margin ?? 0; // ignore a border (alignment edge artefacts)
  const gain = opts.normalize === false ? 1 : mean(a) / Math.max(1e-6, mean(b));
  const n = w * h;
  // Neighbourhood-min difference in both directions: a pixel counts as changed if it differs
  // from EVERY pixel in the other image's 3×3 neighbourhood (either way round). Residual
  // misalignment of an edge by a pixel or so is absorbed; a mark present in one image only
  // is not.
  const d = new Float32Array(n);
  const A = a.data, B = b.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const bi = B[i] * gain, ai = A[i];
      let m1 = Infinity, m2 = Infinity;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          const v1 = Math.abs(A[j] - bi); if (v1 < m1) m1 = v1;
          const v2 = Math.abs(ai - B[j] * gain); if (v2 < m2) m2 = v2;
        }
      }
      // A mark present in only one image survives one of the two directions.
      d[i] = Math.max(m1, m2);
    }
  const heat = new Float32Array(n);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += d[(y + dy) * w + x + dx];
      heat[y * w + x] = s / 9;
    }
  // Adaptive threshold: well above the image's own noise floor (median of the heat map).
  let threshold = fixedThreshold ?? 0;
  if (fixedThreshold === undefined) {
    const sample: number[] = [];
    for (let i = 0; i < n; i += 37) sample.push(heat[i]);
    sample.sort((p, q) => p - q);
    threshold = Math.max(9, sample[(sample.length / 2) | 0] * 6);
  }
  const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
  const hits = new Uint16Array(cols * rows);
  // Tight pixel extents of the changed pixels inside each cell.
  const ex1 = new Int32Array(cols * rows).fill(w), ey1 = new Int32Array(cols * rows).fill(h);
  const ex2 = new Int32Array(cols * rows).fill(-1), ey2 = new Int32Array(cols * rows).fill(-1);
  let changed = 0;
  for (let y = margin; y < h - margin; y++)
    for (let x = margin; x < w - margin; x++)
      if (heat[y * w + x] > threshold) {
        changed++;
        const c = ((y / cell) | 0) * cols + ((x / cell) | 0);
        hits[c]++;
        if (x < ex1[c]) ex1[c] = x;
        if (x > ex2[c]) ex2[c] = x;
        if (y < ey1[c]) ey1[c] = y;
        if (y > ey2[c]) ey2[c] = y;
      }
  const hot = new Uint8Array(cols * rows);
  for (let i = 0; i < hot.length; i++) hot[i] = hits[i] > minHits ? 1 : 0;
  const seen = new Uint8Array(cols * rows);
  const regions: BBox[] = [];
  for (let s = 0; s < hot.length; s++) {
    if (!hot[s] || seen[s]) continue;
    let x1 = w, y1 = h, x2 = 0, y2 = 0, size = 0;
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      const cx = c % cols, cy = (c / cols) | 0;
      size++;
      x1 = Math.min(x1, ex1[c]); y1 = Math.min(y1, ey1[c]); x2 = Math.max(x2, ex2[c]); y2 = Math.max(y2, ey2[c]);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const ni = ny * cols + nx;
          if (hot[ni] && !seen[ni]) { seen[ni] = 1; stack.push(ni); }
        }
    }
    // Box = tight extent of changed pixels across the component (not the coarse cells).
    const pad = 3; // small visual margin around the changed pixels
    // A real mark has a strong core; regions that only barely clear the threshold anywhere
    // are lighting/noise at edges (e.g. a bright window) and are dropped.
    let peak = 0;
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) { const v = heat[y * w + x]; if (v > peak) peak = v; }
    if (size >= 2 && peak >= threshold + PEAK_MARGIN) regions.push([Math.max(0, x1 - pad) / w, Math.max(0, y1 - pad) / h, Math.min(w, x2 + 1 + pad) / w, Math.min(h, y2 + 1 + pad) / h]);
  }
  return { heat, changedPct: changed / n, regions, gain, threshold };
}

/** Inverse of toCurrentFrame: a box in the current photo → the same spot in the prior photo. */
export function fromCurrentFrame(b: BBox, t: { dx: number; dy: number; scale: number }): BBox {
  const m = (v: number, d: number) => Math.min(1, Math.max(0, (v - 0.5 - d) / t.scale + 0.5));
  return [m(b[0], t.dx), m(b[1], t.dy), m(b[2], t.dx), m(b[3], t.dy)];
}

/**
 * Affected area inside a box, measured against the surface around it: pixels that differ
 * from the median of a surrounding ring by more than the ring's own spread (robust MAD).
 * Returned as a fraction of the whole frame, so values compare across visits.
 */
export function affectedFraction(g: Gray, box: BBox, ringScale = 1.6): number {
  const { w, h, data } = g;
  const x1 = Math.floor(box[0] * w), y1 = Math.floor(box[1] * h), x2 = Math.ceil(box[2] * w), y2 = Math.ceil(box[3] * h);
  if (x2 <= x1 || y2 <= y1) return 0;
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  const rw = ((x2 - x1) * ringScale) / 2, rh = ((y2 - y1) * ringScale) / 2;
  const rx1 = Math.max(0, Math.floor(cx - rw)), ry1 = Math.max(0, Math.floor(cy - rh));
  const rx2 = Math.min(w, Math.ceil(cx + rw)), ry2 = Math.min(h, Math.ceil(cy + rh));
  const ring: number[] = [];
  for (let y = ry1; y < ry2; y++) for (let x = rx1; x < rx2; x++) if (x < x1 || x >= x2 || y < y1 || y >= y2) ring.push(data[y * w + x]);
  if (ring.length < 20) return 0;
  ring.sort((a, b) => a - b);
  const med = ring[(ring.length / 2) | 0];
  const dev = ring.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  const thr = Math.max(10, 3.5 * 1.4826 * dev[(dev.length / 2) | 0]);
  let hit = 0;
  for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) if (Math.abs(data[y * w + x] - med) > thr) hit++;
  return hit / (w * h);
}

export function iou(a: BBox, b: BBox): number {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return u > 0 ? inter / u : 0;
}

const centre = (b: BBox) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

/**
 * Snaps an approximate (model) box onto the best pixel-change region: highest IoU first,
 * otherwise the nearest region whose centre is within `maxDist` (fraction of the frame).
 * Returns null when no region supports the claim.
 */
export function ground(approx: BBox, regions: BBox[], maxDist = 0.22): { box: BBox; iou: number } | null {
  let best: BBox | null = null, bestIou = 0;
  for (const r of regions) {
    const v = iou(approx, r);
    if (v > bestIou) { bestIou = v; best = r; }
  }
  if (best) return { box: best, iou: bestIou };
  const [ax, ay] = centre(approx);
  let near: BBox | null = null, nd = Infinity;
  for (const r of regions) {
    const [rx, ry] = centre(r);
    const dist = Math.hypot(ax - rx, ay - ry);
    if (dist < nd) { nd = dist; near = r; }
  }
  return near && nd <= maxDist ? { box: near, iou: 0 } : null;
}

/** Coarse box for a model's textual region ("top-left", …) when it gave no coordinates. */
export function regionBox(region?: string): BBox {
  switch ((region || "").toLowerCase()) {
    case "top-left": return [0, 0, 0.5, 0.5];
    case "top-right": return [0.5, 0, 1, 0.5];
    case "bottom-left": return [0, 0.5, 0.5, 1];
    case "bottom-right": return [0.5, 0.5, 1, 1];
    default: return [0, 0, 1, 1];
  }
}

/**
 * Maps a box from the reference (prior) frame into the moving (current) frame, given the
 * normalised alignment returned by changeMap(): x' = (x − ½)·scale + ½ + dx.
 */
export function toCurrentFrame(b: BBox, t: { dx: number; dy: number; scale: number }): BBox {
  const m = (v: number, d: number) => Math.min(1, Math.max(0, (v - 0.5) * t.scale + 0.5 + d));
  return [m(b[0], t.dx), m(b[1], t.dy), m(b[2], t.dx), m(b[3], t.dy)];
}

/** Human-readable location for a box. */
export function describeRegion(b: BBox): string {
  const [cx, cy] = centre(b);
  const v = cy < 0.34 ? "top" : cy > 0.66 ? "bottom" : "centre";
  const hz = cx < 0.34 ? "left" : cx > 0.66 ? "right" : "centre";
  return v === hz ? "centre" : v === "centre" ? `centre-${hz}` : hz === "centre" ? `${v}-centre` : `${v}-${hz}`;
}
