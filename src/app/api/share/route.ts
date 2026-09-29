import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import {
  getAuthenticatedUserOrThrow,
  canUserAccessProperty,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth";
import crypto from "crypto";
import { z } from "zod";

const CreateShareLinkSchema = z.object({
  property_id: z.string().min(1),
  inspection_id: z.string().optional(),
});

/**
 * POST /api/share
 * Creates a cryptographically random share link for a property/inspection.
 * Requires authentication and property access authorization.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUserOrThrow(req);

    const body = await req.json();
    const parsed = CreateShareLinkSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { property_id, inspection_id } = parsed.data;

    // Verify user can access this property
    const authorized = await canUserAccessProperty(user, property_id);
    if (!authorized) {
      return forbiddenResponse("You do not have authorization to create share links for this property.");
    }

    // Generate cryptographically secure token
    const token = crypto.randomBytes(32).toString("hex"); // 256-bit entropy
    const db = getDatabase();
    await db.createShareLink(property_id, token, inspection_id, user.id);

    return NextResponse.json({
      token,
      share_url: `${process.env.NEXT_PUBLIC_APP_URL}/report?token=${token}`,
    });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    return NextResponse.json(
      { error: "Failed to generate share link", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
