import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { markPreExisting, reportInspections } from "@/lib/snapshot";
import { getServerSessionUser } from "@/lib/auth";
import { listEvents, deriveFingerprints } from "@/lib/events";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getServerSessionUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    
    const inspectionId = (await params).id;
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = parseInt(url.searchParams.get("limit") || "30", 10);
    const filter = url.searchParams.get("filter") || "all";

    const db = getDatabase();
    
    // First, verify inspection exists and get propertyId
    // Since getInspection doesn't exist, we can get it from assets or we can list inspections?
    // Let's just find property_id by querying inspections directly from DB if needed, but db.getInspections requires propertyId.
    // Let's look at the database schema.
    // Actually, we can just require propertyId in the query string to avoid needing a new DB method.
    const propertyId = url.searchParams.get("propertyId");
    if (!propertyId) return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });

    const inspectionsDesc = await db.getInspections(propertyId);
    const inspections = [...inspectionsDesc].sort((a, b) => a.captured_at.localeCompare(b.captured_at));
    const { baseline } = reportInspections(inspections);

    const relevantInspectionIds = [inspectionId];
    if (baseline && baseline.id !== inspectionId) relevantInspectionIds.push(baseline.id);
    
    // Fetch assets and observations only for the inspections we care about (baseline and current)
    // to avoid massive overfetching from the database.
    const allBaseAssets = await db.getAssetsForInspections(relevantInspectionIds);
    const allObservations = await db.getObservationsForAssets(allBaseAssets.map((a) => a.id));
    
    const markedObservations = markPreExisting(inspections, allBaseAssets, allObservations);
    
    // Now filter for the requested inspection
    const currentAssetIds = new Set(allBaseAssets.filter(a => a.inspection_id === inspectionId).map(a => a.id));
    
    let targetObservations = markedObservations.filter(o => currentAssetIds.has(o.asset_id));
    
    // Sort logic to match the Review page: pending first, then unsure, then pre-existing
    targetObservations.sort((a, b) => {
      const aPending = a.review_status === "pending" ? 0 : 1;
      const bPending = b.review_status === "pending" ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      
      const aUnsure = a.confidence < 0.5 ? 1 : 0; // naive unsure proxy, accurate unsure is in certaintyFor, but we sort generally
      const bUnsure = b.confidence < 0.5 ? 1 : 0;
      if (aUnsure !== bUnsure) return aUnsure - bUnsure;
      
      const aPre = a.pre_existing ? 1 : 0;
      const bPre = b.pre_existing ? 1 : 0;
      return aPre - bPre;
    });

    // Pagination
    const total = targetObservations.length;
    const startIndex = (page - 1) * limit;
    const paginatedObservations = targetObservations.slice(startIndex, startIndex + limit);
    
    // Get related assets (current and baseline)
    const relatedAssetIds = new Set(paginatedObservations.map(o => o.asset_id));
    const currentAssets = allBaseAssets.filter(a => relatedAssetIds.has(a.id));
    
    // Also include baseline assets for the same rooms so the UI can do side-by-side
    const roomIds = new Set(currentAssets.map(a => a.room_id));
    const baselineAssets = baseline ? allBaseAssets.filter(a => a.inspection_id === baseline.id && roomIds.has(a.room_id)) : [];
    
    const combinedAssets = [...currentAssets, ...baselineAssets];
    
    // Add fingerprints for combinedAssets
    const events = await listEvents(propertyId);
    const fps = deriveFingerprints(events);
    const finalAssets = combinedAssets.map((a) => {
      const fp = fps[a.id];
      return {
        ...a,
        bytes: a.bytes ?? fp?.bytes ?? undefined,
        phash: fp?.phash ?? null,
        faces: fp?.faces ?? 0,
        reused_of: fp?.reused_of ?? null,
        reuse_distance: fp?.distance ?? null,
        cloudinary_version: fp?.version ?? null,
        staged: !!fp?.staged,
        exif: fp && "exif" in fp ? fp.exif : undefined,
      };
    });

    return NextResponse.json({
      observations: paginatedObservations,
      assets: finalAssets,
      pagination: {
        page,
        limit,
        total,
        hasMore: startIndex + limit < total
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
