import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const propertyId = body?.property_id || "prop-381";

    const token = crypto.randomBytes(16).toString("hex");
    const db = getDatabase();
    await db.createShareLink(propertyId, token);

    return NextResponse.json({
      token,
      share_url: `/report?token=${token}`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to generate share link", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
