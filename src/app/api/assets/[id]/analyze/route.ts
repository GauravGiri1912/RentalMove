import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { runAnalysisForAsset } from "@/lib/pipeline";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDatabase();
    const asset = await db.getAssetById(id);

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    // Reset status to queued for manual retry
    await db.updateAssetStatus(asset.id, "queued", null);
    await runAnalysisForAsset(asset.id);

    const updated = await db.getAssetById(id);
    const observations = await db.getObservations(id);

    return NextResponse.json({
      asset: updated,
      observations,
    });
  } catch (err: any) {
    console.error("Manual analysis retry error:", err);
    return NextResponse.json(
      { error: "Failed to run analysis", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
