/**
 * pixel-node.ts — server-side loaders for the pixel engine (uses sharp).
 */

import sharp from "sharp";
import { align, diff, ground, warp, describeRegion, lumaFromRGB, toCurrentFrame, type BBox, type Gray } from "./pixel";

export const ANALYSIS_WIDTH = 800;

/** Downloads (or reads) an image and returns its luminance at a fixed width, original aspect. */
export async function loadGray(src: string | Buffer, width = ANALYSIS_WIDTH, height?: number): Promise<Gray> {
  let input: Buffer;
  if (Buffer.isBuffer(src)) input = src;
  else {
    let fetchUrl = src;
    // When fetching from Cloudinary, request an appropriately pre-scaled rendition (up to 1600px)
    // to avoid downloading oversized raw originals (e.g. 10MB+) before Sharp processing
    if (typeof src === "string" && src.includes("/image/upload/") && !src.includes("w_") && !src.includes("c_")) {
      fetchUrl = src.replace("/image/upload/", `/image/upload/c_limit,w_${width * 2},q_auto,f_jpg/`);
    }
    let res = await fetch(fetchUrl);
    if (!res.ok && fetchUrl !== src) {
      // Fall back to original URL if the rendition transformation cannot be served
      res = await fetch(src);
    }
    if (!res.ok) throw new Error(`Image fetch failed ${res.status} for ${src}`);
    input = Buffer.from(await res.arrayBuffer());
  }
  const img = sharp(input).removeAlpha();
  const meta = await img.metadata();
  const h = height ?? Math.round((width * (meta.height ?? width)) / (meta.width ?? width));
  const { data, info } = await img.resize(width, h, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  return lumaFromRGB(data, info.width, info.height, info.channels as 3 | 4);
}

export interface ChangeMap {
  regions: BBox[];
  changedPct: number;
  alignment: { dx: number; dy: number; scale: number; score: number };
}

/**
 * Aligns `current` onto `prior` and returns the regions whose pixels changed.
 * Both are loaded at the prior's aspect so region coordinates are in the prior/current frame.
 */
export async function changeMap(priorSrc: string | Buffer, currentSrc: string | Buffer): Promise<ChangeMap> {
  const prior = await loadGray(priorSrc);
  const current = await loadGray(currentSrc, prior.w, prior.h);
  const t = align(prior, current);
  const aligned = warp(current, t);
  const margin = Math.ceil(Math.max(Math.abs(t.dx), Math.abs(t.dy)) + prior.w * Math.abs(1 - t.scale)) + 3;
  const moved = Math.abs(t.dx) > 0.01 || Math.abs(t.dy) > 0.01 || Math.abs(t.scale - 1) > 1e-6;
  const d = diff(prior, moved ? aligned : current, { margin: moved ? margin : 0, smooth: moved });
  return {
    regions: d.regions,
    changedPct: d.changedPct,
    alignment: { dx: t.dx / prior.w, dy: t.dy / prior.h, scale: t.scale, score: t.score },
  };
}

/** Change regions expressed in the CURRENT photo's frame (where boxes are drawn). */
export function regionsInCurrentFrame(m: ChangeMap): BBox[] {
  return m.regions.map((r) => toCurrentFrame(r, m.alignment));
}

export { ground, describeRegion };
