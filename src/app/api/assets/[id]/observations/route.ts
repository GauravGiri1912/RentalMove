import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { getAuthenticatedUserOrThrow, forbiddenResponse } from "@/lib/auth";
import { authorize } from "@/lib/authorization";
import { appendEvent } from "@/lib/events";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: assetId } = await params;
    const user = await getAuthenticatedUserOrThrow(req);
    const db = getDatabase();

    const asset = await db.getAssetById(assetId);
    if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    const propertyId = (await db.getInspectionById(asset.inspection_id))?.property_id;
    if (!propertyId) return NextResponse.json({ error: "Property not found" }, { status: 404 });

    // Must be able to triage findings to manually create them
    const decision = await authorize({
      user,
      capability: "finding:triage",
      resource: { type: "property", id: propertyId, propertyId },
    });

    if (!decision.allowed) {
      return forbiddenResponse("Only property owners can create manual findings.");
    }

    const body = await req.json();
    const category = body.category || "other";
    const description = body.description || "Manual finding";
    const reviewerNote = body.reviewer_note || undefined;

    const observationPayload = {
      asset_id: assetId,
      source: "human" as const,
      category,
      description,
      confidence: 1.0,
      bbox: [0, 0, 1, 1] as [number, number, number, number],
      sub_area: "general",
      review_status: "accepted" as const, // Auto-accepted since owner created it
      reviewer_note: reviewerNote,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    };

    // Insert into DB
    const observation = await db.createObservation(observationPayload);

    // Sync to Cloudinary
    if (asset.cloudinary_public_id) {
      try {
        const { getMediaProvider } = await import("@/lib/media");
        const media = getMediaProvider();
        media.updateMetadata(asset.cloudinary_public_id, {
          review_status: "accepted",
          issue_category: category,
        }).catch(() => {});
        
        const { computeManagedTags } = await import("@/lib/tags");
        const allObs = await db.getObservations(assetId);
        const desiredTags = computeManagedTags(allObs);
        await media.syncManagedTags(asset.cloudinary_public_id, desiredTags).catch(() => {});
      } catch (err) {
        console.warn("[Observations] Cloudinary sync failed:", err);
      }
    }

    await appendEvent({
      property_id: propertyId,
      type: "decision",
      resource_id: observation.id,
      actor_id: user.id,
      actor_name: user.name,
      actor_role: user.role,
      payload: { 
        status: "accepted",
        category,
        description,
        note: reviewerNote,
        asset_id: assetId,
        manual: true
      },
    }).catch(() => {});

    return NextResponse.json(observation);
  } catch (err: any) {
    console.error("Manual observation error:", err);
    return NextResponse.json(
      { error: "Failed to create manual finding", message: err?.message },
      { status: 500 }
    );
  }
}
