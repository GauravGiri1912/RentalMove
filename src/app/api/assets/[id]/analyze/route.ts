import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { scheduleAnalysis } from "@/lib/pipeline";
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

    // Find the property that owns this asset's inspection (in parallel across the user's properties)
    const allProps = await db.listProperties(user.id, user.role);
    const inspectionLists = await Promise.all(allProps.map((p) => db.getInspections(p.id)));
    const owner = allProps.find((_, i) => inspectionLists[i].some((insp) => insp.id === asset.inspection_id));
    const propertyId: string | null = owner?.id ?? null;

    if (!propertyId) {
      return forbiddenResponse("You do not have access to this asset.");
    }

    const authorized = await canUserAccessProperty(user, propertyId);
    if (!authorized) {
      return forbiddenResponse("You do not have access to this asset.");
    }

    // Re-running a finished analysis would stack duplicate findings on the photo.
    if (asset.analysis_status === "done" || asset.analysis_status === "completed") {
      return NextResponse.json(
        { error: "Analysis already completed for this asset", asset },
        { status: 409 }
      );
    }

    // Reset status to queued for manual retry
    await db.updateAssetStatus(asset.id, "queued", null);
    scheduleAnalysis(asset.id);

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

/** Vision calls can take several seconds; allow the host to keep the function alive. */
export const maxDuration = 60;
