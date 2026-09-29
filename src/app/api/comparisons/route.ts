import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { getVisionProvider } from "@/lib/vision";
import { getMediaProvider } from "@/lib/media";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prior_asset_id, current_asset_id, property_id, room_id } = body;

    if (!prior_asset_id || !current_asset_id) {
      return NextResponse.json(
        { error: "Both prior_asset_id and current_asset_id are required" },
        { status: 400 }
      );
    }

    const db = getDatabase();
    const media = getMediaProvider();
    const vision = getVisionProvider();

    const prior = await db.getAssetById(prior_asset_id);
    const current = await db.getAssetById(current_asset_id);

    if (!prior || !current) {
      return NextResponse.json({ error: "Assets not found" }, { status: 404 });
    }

    const priorUrl = media.vlmCopy(prior.cloudinary_public_id || prior.secure_url);
    const currentUrl = media.vlmCopy(current.cloudinary_public_id || current.secure_url);

    const comparisonResult = await vision.compareImages({
      priorUrl,
      currentUrl,
      room: prior.room_guess || "room",
    });

    const comparison = await db.createComparison({
      property_id: property_id || "prop-381",
      room_id: room_id || prior.room_id,
      prior_asset_id,
      current_asset_id,
      summary: comparisonResult.summary,
      changes: comparisonResult.changes,
      caveats: comparisonResult.caveats || [],
      model_version: process.env.VISION_MODEL || "mock-vlm-v1",
    });

    return NextResponse.json({
      comparison,
      result: comparisonResult,
    });
  } catch (err: any) {
    console.error("Comparison error:", err);
    return NextResponse.json(
      { error: "Failed to compare images", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
