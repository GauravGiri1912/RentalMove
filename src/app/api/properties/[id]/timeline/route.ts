import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDatabase();
    const timeline = await db.getTimeline(id);
    return NextResponse.json(timeline);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to fetch property timeline", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
