import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { getSessionUser, canUserAccessProperty, forbiddenResponse } from "@/lib/auth";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const propertyId = body?.property_id || "prop-381";
    const inspectionId = body?.inspection_id || undefined;

    const user = await getSessionUser(req);
    if (user) {
      const authorized = await canUserAccessProperty(user, propertyId);
      if (!authorized) {
        return forbiddenResponse("You do not have authorization to create share links for this property.");
      }
    }

    const token = crypto.randomBytes(16).toString("hex");
    const db = getDatabase();
    await db.createShareLink(propertyId, token, inspectionId, user?.id);

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
