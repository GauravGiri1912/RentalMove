import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { runAnalysisForAsset } from "@/lib/pipeline";
import { getDatabase as getDB } from "@/lib/db";
import {
  getAuthenticatedUserOrThrow,
  canUserAccessProperty,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth";

/**
 * POST /api/assets/[id]/analyze
 * Manually triggers or retries AI analysis for an asset.
 * Requires authentication and property access authorization.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const user = await getAuthenticatedUserOrThrow(req);

    const db = getDatabase();
    const asset = await db.getAssetById(id);

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    // Look up the property via inspection to verify access
    const inspections = await db.getInspections(
      // We need the property_id — query via inspection
      (await db.getAssetById(id))?.inspection_id || ""
    );

    // Find the property_id from the inspection
    const allProps = await db.listProperties(user.id, user.role);
    let propertyId: string | null = null;
    for (const prop of allProps) {
      const inspList = await db.getInspections(prop.id);
      if (inspList.some((i) => i.id === asset.inspection_id)) {
        propertyId = prop.id;
        break;
      }
    }

    if (!propertyId) {
      return forbiddenResponse("You do not have access to this asset.");
    }

    const authorized = await canUserAccessProperty(user, propertyId);
    if (!authorized) {
      return forbiddenResponse("You do not have access to this asset.");
    }

    // Reset status to queued for manual retry
    await db.updateAssetStatus(asset.id, "queued", null);
    runAnalysisForAsset(asset.id).catch((err) => {
      console.error(`[Analyze] Background analysis failed for asset ${asset.id}:`, err);
    });

    return NextResponse.json({
      asset: { ...asset, analysis_status: "queued" },
      message: "Analysis queued",
    });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    console.error("Manual analysis retry error:", err);
    return NextResponse.json(
      { error: "Failed to run analysis", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
