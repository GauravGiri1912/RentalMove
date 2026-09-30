import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { getMediaProvider } from "@/lib/media";
import { ObservationUpdateSchema } from "@/lib/schemas";
import {
  getAuthenticatedUserOrThrow,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth";
import { observationWithProperty } from "@/lib/access";
import { appendEvent } from "@/lib/events";

/**
 * PATCH /api/observations/[id]
 * Updates the review status of an observation.
 * Requires authentication. reviewer_by is always the authenticated user's ID.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Require authentication — reviewer must be a real user
    const user = await getAuthenticatedUserOrThrow(req);

    const body = await req.json();
    const parsed = ObservationUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid observation update payload", details: parsed.error.format() },
        { status: 400 }
      );
    }

    // The finding must belong to a property this user can access (was not checked).
    const found = await observationWithProperty(user, id);
    if (!found) return forbiddenResponse("You do not have access to this finding.");

    const db = getDatabase();
    const media = getMediaProvider();

    const updated = await db.updateObservation(id, {
      review_status: parsed.data.review_status,
      reviewer_note: parsed.data.reviewer_note,
      category: parsed.data.edited_category,
      description: parsed.data.edited_description,
      sub_area: parsed.data.edited_sub_area,
      reviewed_by: user.id, // Always use authenticated user's ID, not client-supplied
      reviewed_at: new Date().toISOString(),
    });

    if (!updated) {
      return NextResponse.json({ error: "Observation not found" }, { status: 404 });
    }

    // Sync review status to Cloudinary Structured Metadata & Managed Tags
    const asset = await db.getAssetById(updated.asset_id);
    if (asset?.cloudinary_public_id) {
      media.updateMetadata(asset.cloudinary_public_id, {
        review_status: updated.review_status,
        issue_category: updated.category,
      }).catch((err) => {
        console.warn("[Observations] Failed to sync metadata to Cloudinary:", err);
      });

      try {
        const { computeManagedTags } = await import("@/lib/tags");
        const allObs = await db.getObservations(updated.asset_id);
        const desiredTags = computeManagedTags(allObs);
        await media.syncManagedTags(asset.cloudinary_public_id, desiredTags);
      } catch (err) {
        console.warn("[Observations] Failed to sync managed tags to Cloudinary:", err);
      }
    }

    await appendEvent({
      property_id: found.propertyId,
      type: "pipeline",
      resource_id: updated.asset_id,
      actor_id: user.id,
      actor_name: user.name,
      actor_role: user.role,
      payload: { stage: "review", label: `Finding ${updated.review_status}`, detail: `${updated.category} · review_status=${updated.review_status} → Cloudinary` },
    }).catch(() => {});

    return NextResponse.json(updated);
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    console.error("Observation update error:", err);
    return NextResponse.json(
      { error: "Failed to update observation", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
