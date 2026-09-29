import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const db = getDatabase();
    const link = await db.getShareLink(token);

    if (!link) {
      return NextResponse.json({ error: "Invalid or expired report link" }, { status: 404 });
    }

    const timeline = await db.getTimeline(link.property_id);

    return NextResponse.json({
      property: timeline.property,
      inspections: timeline.inspections,
      expires_at: link.expires_at,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to load report", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
