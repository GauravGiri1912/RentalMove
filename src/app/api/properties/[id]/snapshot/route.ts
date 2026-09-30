import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserOrThrow, canUserAccessProperty, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";
import { buildSnapshot } from "@/lib/snapshot";
import { recoverStalledAssets } from "@/lib/pipeline";

/**
 * GET /api/properties/:id/snapshot
 * Everything a property page renders: rooms, inspections, photos (with fingerprints),
 * findings (with pre-existing matches), comparisons, activity, positions, threads,
 * signatures, share links and the report content hash.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getAuthenticatedUserOrThrow(req);
    if (!(await canUserAccessProperty(user, id))) return forbiddenResponse("You do not have access to this property.");
    const snapshot = await buildSnapshot(id, user);
    if (!snapshot) return NextResponse.json({ error: "Property not found" }, { status: 404 });
    recoverStalledAssets(snapshot.assets).catch((err) => console.warn("[Snapshot] Stalled-asset recovery failed:", err));
    return NextResponse.json({ ...snapshot, user }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    console.error("Snapshot error:", err);
    return NextResponse.json({ error: "Failed to load property", message: err?.message || String(err) }, { status: 500 });
  }
}
