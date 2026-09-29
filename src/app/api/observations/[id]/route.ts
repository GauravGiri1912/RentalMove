import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { getMediaProvider } from "@/lib/media";
import { ObservationUpdateSchema } from "@/lib/schemas";
import {
  getAuthenticatedUserOrThrow,
  unauthorizedResponse,
} from "@/lib/auth";

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
