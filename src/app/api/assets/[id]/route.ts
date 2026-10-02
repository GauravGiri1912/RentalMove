import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserOrThrow, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";
import { assetWithProperty } from "@/lib/access";
import { getDatabase } from "@/lib/db";
import { appendEvent, deriveSubmitted, listEvents } from "@/lib/events";
import { can } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { ensureCloudinaryConfig, isCloudinaryConfigured } from "@/lib/media";
import { v2 as cloudinary } from "cloudinary";

/**
 * DELETE /api/assets/:id — removes a photo from a visit that is still a DRAFT.
 *
 * Allowed only while the visit is being captured (status in_progress, not submitted) and before anyone has made a
 * decision on a finding from this photo. After submission or a review decision the photo is evidence and stays.
 * The image and its findings are deleted; an audit entry (who, when, the photo's fingerprint) is kept.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = await rateLimit(req, { limit: 60, windowMs: 3_600_000, prefix: "asset-remove" });
  if (!rl.success) return rl.response;
  try {
    const { id } = await params;
    const user = await getAuthenticatedUserOrThrow(req);
    if (!can(user, "capture:use")) return forbiddenResponse("You cannot change photos in this visit.");
    const found = await assetWithProperty(user, id);
    if (!found) return forbiddenResponse("You do not have access to this photo.");
    const { asset, propertyId } = found;
    const db = getDatabase();
    const insp = await db.getInspectionById(asset.inspection_id);
    if (!insp || insp.status !== "in_progress") return NextResponse.json({ error: "This visit is already complete, so its photos are kept as evidence." }, { status: 409 });
    if (deriveSubmitted(await listEvents(propertyId, ["coverage"]))[insp.id]) return NextResponse.json({ error: "This visit was already submitted, so its photos are locked. Ask the owner to reopen it." }, { status: 409 });
    const reviewed = (await db.getObservationsForAssets([asset.id])).some((o) => o.review_status !== "pending");
    if (reviewed) return NextResponse.json({ error: "A finding from this photo has already been reviewed, so the photo is kept as evidence." }, { status: 409 });

    if (!db.deleteAsset || !(await db.deleteAsset(asset.id))) return NextResponse.json({ error: "Could not remove the photo. Please try again." }, { status: 500 });
    await appendEvent({ property_id: propertyId, type: "removal", resource_id: asset.id, actor_id: user.id, actor_name: user.name, actor_role: user.role, payload: { room_id: asset.room_id, inspection_id: asset.inspection_id, sha256: asset.sha256 ?? null, public_id: asset.cloudinary_public_id } });
    if (isCloudinaryConfigured()) { ensureCloudinaryConfig(); await cloudinary.uploader.destroy(asset.cloudinary_public_id, { invalidate: true }).catch((e: any) => console.warn("[remove] Cloudinary:", e?.message ?? e)); }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    return NextResponse.json({ error: "Could not remove the photo", message: err?.message || String(err) }, { status: 500 });
  }
}
