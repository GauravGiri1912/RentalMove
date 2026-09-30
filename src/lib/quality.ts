// Pre-upload quality gate, computed on the device before any bytes leave it.
// Brightness = mean luminance; sharpness = variance of a 3×3 Laplacian.

export interface Quality {
  brightness: number;
  sharpness: number;
  verdict: "ok" | "too_dark" | "blurry" | "overexposed";
}

export const QUALITY_LIMITS = { dark: 55, bright: 235, blur: 40 };

export function measureQuality(source: CanvasImageSource, w: number, h: number): Quality {
  const W = 320, H = Math.round((320 * h) / w);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.drawImage(source, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data;
  const L = new Float32Array(W * H);
  let sum = 0;
  for (let i = 0; i < W * H; i++) {
    L[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    sum += L[i];
  }
  let m = 0, m2 = 0, n = 0;
  for (let y = 1; y < H - 1; y++)
    for (let xx = 1; xx < W - 1; xx++) {
      const i = y * W + xx;
      const v = L[i - W] + L[i + W] + L[i - 1] + L[i + 1] - 4 * L[i];
      m += v; m2 += v * v; n++;
    }
  const brightness = sum / (W * H);
  const mean = m / n;
  const sharpness = m2 / n - mean * mean;
  const verdict = brightness < QUALITY_LIMITS.dark ? "too_dark" : brightness > QUALITY_LIMITS.bright ? "overexposed" : sharpness < QUALITY_LIMITS.blur ? "blurry" : "ok";
  return { brightness, sharpness, verdict };
}
