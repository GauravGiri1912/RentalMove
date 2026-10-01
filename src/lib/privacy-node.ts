/**
 * privacy-node.ts — finding personal items to hide (server only).
 *
 * Prefers Cloudinary OCR (exact text boxes) while the add-on is active and the monthly
 * budget allows; otherwise asks the vision model for papers/screens/photos (approximate,
 * padded boxes, labelled as suggestions). Only geometry is stored — never the text.
 */

import crypto from "crypto";
import { v2 as cloudinary } from "cloudinary";
import { appendEvent, derivePrivacy, listEvents, listEventsOfType } from "./events";
import { ensureCloudinaryConfig, isCloudinaryConfigured } from "./media";
import { GroqVisionProvider, getVisionProvider } from "./vision";
import { withPixelEvidence, mergeBoxes, monthStartIso, ocrBoxes, OCR_MONTHLY_CAP, snapToText, type Box } from "./privacy";
import { loadGray } from "./pixel-node";
import { pixelUrl } from "./grounding";

/** Set once Cloudinary says the account has no OCR subscription (avoids repeated failed calls). */
let ocrUnavailable: string | null = null;

export async function ocrBudget(): Promise<{ used: number; cap: number; available: boolean; reason: string | null }> {
  const used = (await listEventsOfType("privacy", monthStartIso())).filter((e) => e.payload.action === "scan" && e.payload.engine === "ocr").length;
  const reason = !isCloudinaryConfigured() ? "Cloudinary is not configured" : ocrUnavailable ?? (used >= OCR_MONTHLY_CAP ? "Monthly OCR budget used" : null);
  return { used, cap: OCR_MONTHLY_CAP, available: !reason, reason };
}

async function scanWithOcr(publicId: string): Promise<Box[] | null> {
  ensureCloudinaryConfig();
  try {
    const r: any = await cloudinary.uploader.explicit(publicId, { type: "upload", ocr: "adv_ocr" });
    const info = r?.info?.ocr?.adv_ocr;
    if (!info || info.status !== "complete") {
      // The upload API stays silent when the add-on is off; the delivery API names the reason.
      ocrUnavailable = "Cloudinary OCR add-on is not active on this account";
      return null;
    }
    return ocrBoxes(info, r.width, r.height);
  } catch (err: any) {
    const msg = String(err?.error?.message ?? err?.message ?? err);
    if (/subscription|add-?on|not enabled|not allowed/i.test(msg)) ocrUnavailable = "Cloudinary OCR add-on is not active on this account";
    return null;
  }
}

/** Model path; exported for scripts/eval-privacy.ts so the eval runs exactly this code. */
export async function scanWithModel(imageUrl: string, pixelSrc: string | Buffer, size: { width: number; height: number }): Promise<{ bbox: Box; label: string; snapped: boolean }[]> {
  const vision = getVisionProvider();
  if (!(vision instanceof GroqVisionProvider)) throw new Error("No OCR and no vision model available for privacy scanning.");
  const g = await loadGray(pixelSrc);
  // Model says what; pixels confirm and say where: drop textual items with no text-like
  // pixels in their box (hallucinated or repeated boxes), then snap the rest onto the text.
  const items = withPixelEvidence(g, await vision.detectPersonalItems(imageUrl, size));
  return items.map((it) => { const s = snapToText(g, it.bbox); return { bbox: s.bbox, label: it.label, snapped: s.snapped }; });
}

/**
 * Scans a photo and records what to hide. Replaces earlier automatic (ocr/ai) regions of the
 * photo; areas a person drew are kept.
 */
export async function scanForPersonalItems(
  propertyId: string,
  asset: { id: string; cloudinary_public_id: string; width?: number | null; height?: number | null },
  imageUrl: string,
  actor: { id: string | null; name: string | null; role: "tenant" | "owner" | "system" | null },
): Promise<{ engine: "ocr" | "ai"; found: number; note: string | null }> {
  const budget = await ocrBudget();
  let engine: "ocr" | "ai" = "ai";
  let found: { bbox: Box; label: string }[] = [];
  let note: string | null = null;
  if (budget.available) {
    const boxes = await scanWithOcr(asset.cloudinary_public_id);
    if (boxes) {
      engine = "ocr";
      found = boxes.map((b) => ({ bbox: b, label: "text" }));
    }
  }
  if (engine === "ai") {
    note = ocrUnavailable ?? budget.reason ?? null;
    const items = await scanWithModel(imageUrl, pixelUrl(asset.cloudinary_public_id), { width: asset.width || 1200, height: asset.height || 896 });
    const merged = mergeBoxes(items.map((i) => i.bbox), 0.01);
    // Label each merged area with the items inside it ("tablet, paperwork").
    const inside = (i: { bbox: Box }, b: Box) => i.bbox[0] < b[2] && b[0] < i.bbox[2] && i.bbox[1] < b[3] && b[1] < i.bbox[3];
    found = merged.map((b) => ({ bbox: b, label: [...new Set(items.filter((i) => inside(i, b)).map((i) => i.label.replace(/_/g, " ").toLowerCase()))].join(", ").slice(0, 40) || "personal item" }));
  }
  const base = { property_id: propertyId, resource_id: asset.id, actor_id: actor.id, actor_name: actor.name, actor_role: actor.role };
  // A new scan supersedes the previous automatic suggestions, never a person's own boxes.
  const current = derivePrivacy(await listEvents(propertyId, ["privacy"]))[asset.id] ?? [];
  for (const src of ["ocr", "ai"] as const) {
    if (current.some((r) => r.source === src)) await appendEvent({ ...base, type: "privacy", payload: { action: "clear_source", source: src } });
  }
  for (const f of found) {
    await appendEvent({ ...base, type: "privacy", payload: { action: "add", region: { id: `pr-${crypto.randomBytes(5).toString("hex")}`, bbox: f.bbox, source: engine, label: f.label } } });
  }
  await appendEvent({ ...base, type: "privacy", payload: { action: "scan", engine, found: found.length, note } });
  return { engine, found: found.length, note };
}
