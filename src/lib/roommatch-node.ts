/**
 * roommatch-node.ts — runs the room-match check for one photo (server only, pixels only:
 * no model calls, so it works even when the vision quota is used up).
 */

import { getDatabase } from "./db";
import { appendEvent, deriveFingerprints, listEvents } from "./events";
import { hamming } from "./fingerprint";
import { loadGray } from "./pixel-node";
import { pixelUrl, propertyIdForInspection } from "./grounding";
import { viewMatch } from "./measure-node";
import { decideMatch } from "./roommatch";
import type { Asset } from "./schemas";

/** Reference = the earliest photo of the same room (any visit) that is not this one. */
async function referenceFor(asset: Asset, propertyId: string): Promise<Asset | null> {
  const db = getDatabase();
  const insps = await db.getInspections(propertyId);
  const when = new Map(insps.map((i) => [i.id, i.captured_at]));
  const sameRoom = (await db.getAssetsForInspections(insps.map((i) => i.id)))
    .filter((a) => a.room_id === asset.room_id && a.id !== asset.id && (a.resource_type ?? "image") === "image")
    .sort((a, b) => (when.get(a.inspection_id) ?? "").localeCompare(when.get(b.inspection_id) ?? "") || a.created_at.localeCompare(b.created_at));
  // Never use a photo that itself failed the check as the reference.
  const events = await listEvents(propertyId, ["roommatch"]);
  const bad = new Set(events.filter((e) => e.payload.verdict === "mismatch").map((e) => e.resource_id));
  const earlier = sameRoom.filter((a) => !bad.has(a.id));
  const mine = new Date(when.get(asset.inspection_id) ?? 0).getTime();
  return earlier.find((a) => new Date(when.get(a.inspection_id) ?? 0).getTime() <= mine && a.created_at < asset.created_at) ?? earlier[0] ?? null;
}

export async function checkRoomMatch(asset: Asset, propertyId?: string | null): Promise<{ verdict: string; view: number | null; phash: number | null } | null> {
  const pid = propertyId ?? (await propertyIdForInspection(asset.inspection_id));
  if (!pid) return null;
  const ref = await referenceFor(asset, pid);
  const base = { property_id: pid, type: "roommatch" as const, resource_id: asset.id, actor_id: null, actor_name: "RentalMove", actor_role: "system" as const };
  if (!ref) {
    await appendEvent({ ...base, payload: { verdict: "first", ref: null, view: null, phash: null } });
    return { verdict: "first", view: null, phash: null };
  }
  const g1 = await loadGray(pixelUrl(ref.cloudinary_public_id || ref.secure_url));
  const g2 = await loadGray(pixelUrl(asset.cloudinary_public_id || asset.secure_url), g1.w, g1.h);
  const view = viewMatch(g1, g2);
  const fp = deriveFingerprints(await listEvents(pid, ["fingerprint"]));
  const phash = fp[asset.id]?.phash && fp[ref.id]?.phash ? hamming(fp[asset.id].phash, fp[ref.id].phash) : null;
  const d = decideMatch(view, phash);
  await appendEvent({ ...base, payload: { verdict: d.verdict, reason: d.reason, ref: ref.id, view, phash } });
  return { verdict: d.verdict, view, phash };
}
