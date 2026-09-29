import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { getMediaProvider } from "@/lib/media";
import { ObservationUpdateSchema } from "@/lib/schemas";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
    });

    if (!updated) {
      return NextResponse.json({ error: "Observation not found" }, { status: 404 });
    }

    // Sync review status to Cloudinary Structured Metadata
    const asset = await db.getAssetById(updated.asset_id);
    if (asset?.cloudinary_public_id) {
      await media.updateMetadata(asset.cloudinary_public_id, {
        review_status: updated.review_status,
        issue_category: updated.category,
      });
    }

    return NextResponse.json(updated);
  } catch (err: any) {
    console.error("Observation update error:", err);
    return NextResponse.json(
      { error: "Failed to update observation", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
