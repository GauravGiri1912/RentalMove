import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { buildSharedReport } from "@/lib/shared-report";

/** GET /api/report/:token — same sanitised, pixelated view as /api/share/:token. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const link = await getDatabase().getShareLink(token);
    if (!link) return NextResponse.json({ error: "Invalid or expired report link" }, { status: 404 });
    const report = await buildSharedReport(link);
    if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    return NextResponse.json({ ...report, expires_at: link.expires_at }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to load report", message: err?.message || String(err) }, { status: 500 });
  }
}
