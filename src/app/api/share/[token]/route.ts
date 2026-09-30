import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { getAuthenticatedUserOrThrow, canUserAccessProperty, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";
import { buildSharedReport } from "@/lib/shared-report";

/**
 * GET /api/share/:token — public, read-only report for a valid link.
 * Returns only reviewed findings and pixelated (optionally watermarked) images — never the
 * raw timeline, pending/rejected findings or original URLs.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const link = await getDatabase().getShareLink(token);
    if (!link) {
      return NextResponse.json({ error: "Invalid, expired, or revoked share link", valid: false }, { status: 404 });
    }
    const report = await buildSharedReport(link);
    if (!report) return NextResponse.json({ error: "Report not found", valid: false }, { status: 404 });
    return NextResponse.json({ valid: true, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to validate share token", message: err?.message || String(err) }, { status: 500 });
  }
}

/** DELETE /api/share/:token — revoke. Only the creator or the property's owner (was unauthenticated). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const user = await getAuthenticatedUserOrThrow(req);
    const db = getDatabase();
    const link = await db.getShareLink(token);
    if (!link) {
      return NextResponse.json({ error: "Share token not found or already revoked" }, { status: 404 });
    }
    const isCreator = link.created_by === user.id;
    const isOwner = user.role === "owner" && (await canUserAccessProperty(user, link.property_id));
    if (!isCreator && !isOwner) return forbiddenResponse("Only the link's creator or the property owner can revoke it.");
    await db.revokeShareLink(token);
    return NextResponse.json({ success: true, message: "Share link successfully revoked" });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    return NextResponse.json({ error: "Failed to revoke share link", message: err?.message || String(err) }, { status: 500 });
  }
}
