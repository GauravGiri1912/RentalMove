import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserOrThrow, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";
import { propertyForInspection } from "@/lib/access";
import { getDatabase } from "@/lib/db";
import { visitSubmission } from "@/lib/coverage-node";

/**
 * GET /api/inspections/:id/submission — the visit as submitted: every room, item, photo fingerprint and skip
 * reason, the seal taken at submission, and whether the visit still matches it. Computed on the server.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getAuthenticatedUserOrThrow(req);
    const propertyId = await propertyForInspection(user, id);
    if (!propertyId) return forbiddenResponse("You do not have access to this visit.");
    const insp = await getDatabase().getInspectionById(id);
    const sub = await visitSubmission(propertyId, id);
    return NextResponse.json({ inspection: { id, type: insp?.type, captured_at: insp?.captured_at, status: insp?.status }, property_id: propertyId, ...sub });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    return NextResponse.json({ error: "Could not load the submission", message: err?.message || String(err) }, { status: 500 });
  }
}
