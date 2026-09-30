/**
 * fingerprint.ts — perceptual fingerprints for reused-photo detection.
 *
 * Cloudinary computes a 64-bit perceptual hash (phash) for any stored image; near-identical
 * images have hashes a few bits apart even after re-encoding or resizing. At registration we
 * compare the new photo's phash with every other photo of the property: a move-out photo
 * that is really the move-in photo re-uploaded is flagged instead of silently "matching".
 * Face detection (also from Cloudinary) marks photos that need pixelation before sharing.
 */

import { v2 as cloudinary } from "cloudinary";
import { isCloudinaryConfigured } from "./media";
import { appendEvent, deriveFingerprints, listEvents } from "./events";
import { exifFromMetadata, type PhotoExif } from "./phototime";

/** Bits that may differ for two photos to be a re-use CANDIDATE. 64-bit hash. */
export const REUSE_MAX_DISTANCE = 6;

/**
 * Candidates are confirmed on pixels: mean absolute luminance difference after alignment and
 * exposure matching. Measured on the seed set: the same file re-encoded / resized / cropped
 * scores 0.95–1.12; staged re-captures with sensor noise 1.34–1.63. Real phone re-captures
 * (parallax, real lighting) differ far more. The margin is narrow on staged data — documented.
 */
export const REUSE_MAX_MAD = 1.2;

async function pixelMad(publicA: string, publicB: string): Promise<number> {
  const [{ loadGray }, { align, warp, matchExposure }, { pixelUrl }] = await Promise.all([import("./pixel-node"), import("./pixel"), import("./grounding")]);
  const a = await loadGray(pixelUrl(publicA));
  const b = await loadGray(pixelUrl(publicB), a.w, a.h);
  const bw = matchExposure(a, warp(b, align(a, b)));
  const m = 16;
  let sum = 0, n = 0;
  for (let y = m; y < a.h - m; y++) for (let x = m; x < a.w - m; x++) { sum += Math.abs(a.data[y * a.w + x] - bw.data[y * a.w + x]); n++; }
  return sum / n;
}

export function hamming(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

export interface Fingerprint {
  /** Demo photos made by seed/make_staged.py carry context staged=true in Cloudinary. */
  staged: boolean;
  phash: string | null;
  faces: number;
  bytes: number | null;
  version: number | null;
  format: string | null;
  /** Capture time, software and camera from the file's EXIF (no GPS). */
  exif: PhotoExif | null;
}

export async function fetchFingerprint(publicId: string): Promise<Fingerprint> {
  if (!isCloudinaryConfigured()) return { staged: false, phash: null, faces: 0, bytes: null, version: null, format: null, exif: null };
  const r: any = await cloudinary.api.resource(publicId, { phash: true, faces: true, image_metadata: true });
  return {
    staged: r.context?.custom?.staged === "true",
    phash: r.phash ?? null,
    faces: Array.isArray(r.faces) ? r.faces.length : 0,
    bytes: r.bytes ?? null,
    version: r.version ?? null,
    format: r.format ?? null,
    exif: exifFromMetadata(r.image_metadata),
  };
}

/**
 * Fingerprints an asset, checks it against the property's other photos and records the
 * result as a `fingerprint` event. Never throws — fingerprinting is best effort.
 */
export async function fingerprintAsset(
  propertyId: string,
  assetId: string,
  publicId: string,
  sha256?: string | null
): Promise<Record<string, any> | null> {
  try {
    const fp = await fetchFingerprint(publicId);
    let reused_of: string | null = null;
    let distance: number | null = null;
    let mad: number | null = null;
    let similar_to: string | null = null;
    const known = deriveFingerprints(await listEvents(propertyId, ["fingerprint"]));
    // 1. Byte-identical file: always a re-use.
    if (sha256) {
      const same = Object.entries(known).find(([id, o]) => id !== assetId && o.sha256 && o.sha256 === sha256);
      if (same) { reused_of = same[0]; distance = 0; mad = 0; }
    }
    // 2. Perceptual candidate, confirmed on aligned pixels.
    if (!reused_of && fp.phash) {
      const candidates = Object.entries(known)
        .filter(([id, o]) => id !== assetId && o.phash && o.public_id)
        .map(([id, o]) => ({ id, o, d: hamming(fp.phash!, o.phash) }))
        .filter((c) => c.d <= REUSE_MAX_DISTANCE)
        .sort((x, y) => x.d - y.d);
      for (const c of candidates.slice(0, 3)) {
        const m = await pixelMad(c.o.public_id, publicId);
        if (m <= REUSE_MAX_MAD) { reused_of = c.id; distance = c.d; mad = Number(m.toFixed(2)); break; }
        similar_to ??= c.id;
        mad ??= Number(m.toFixed(2));
      }
    }
    const payload = { ...fp, public_id: publicId, sha256: sha256 ?? null, reused_of, distance, mad, similar_to };
    await appendEvent({
      property_id: propertyId,
      type: "fingerprint",
      resource_id: assetId,
      actor_id: null,
      actor_name: "Cloudinary",
      actor_role: "system",
      payload,
    });
    return payload;
  } catch (err: any) {
    console.warn(`[Fingerprint] ${publicId}:`, err?.message || err?.error?.message || err);
    return null;
  }
}
