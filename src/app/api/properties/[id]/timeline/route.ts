import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { getSessionUser, canUserAccessProperty, forbiddenResponse } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getSessionUser(req);

    if (user) {
      const authorized = await canUserAccessProperty(user, id);
      if (!authorized) {
        return forbiddenResponse("You do not have authorization to view this property's timeline.");
      }
    }

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
