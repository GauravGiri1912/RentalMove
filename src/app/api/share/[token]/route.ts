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
      return NextResponse.json(
        { error: "Invalid, expired, or revoked share link", valid: false },
        { status: 404 }
      );
    }

    const timeline = await db.getTimeline(link.property_id);

    return NextResponse.json({
      valid: true,
      link,
      timeline,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to validate share token", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const db = getDatabase();

    const revoked = await db.revokeShareLink(token);
    if (!revoked) {
      return NextResponse.json(
        { error: "Share token not found or already revoked" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Share link successfully revoked",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to revoke share link", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
