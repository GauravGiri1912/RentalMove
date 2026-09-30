import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getDatabase } from "@/lib/db";
import { getAuthenticatedUserOrThrow, canUserAccessProperty, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";
import { ShareCreateSchema } from "@/lib/schemas";
import { appendEvent } from "@/lib/events";

/**
 * POST /api/share — creates an unguessable, expiring report link (256-bit token).
 * Optional `recipient` is burned into every shared image as a watermark (leak tracing).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUserOrThrow(req);
    const parsed = ShareCreateSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid request", details: parsed.error.format() }, { status: 400 });
    const { property_id, inspection_id, expires_in_days, recipient } = parsed.data;
    if (!(await canUserAccessProperty(user, property_id))) {
      return forbiddenResponse("You do not have authorization to create share links for this property.");
    }
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + expires_in_days * 864e5).toISOString();
    const link = await getDatabase().createShareLink(property_id, token, inspection_id, user.id, expiresAt);
    await appendEvent({
      property_id,
      type: "share",
      resource_id: link.id ?? token.slice(0, 12),
      actor_id: user.id,
      actor_name: user.name,
      actor_role: user.role,
      payload: { token_hint: token.slice(0, 6), recipient: recipient ?? null, expires_at: expiresAt, pixelate: true },
    });
    const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "";
    return NextResponse.json({ token, expires_at: expiresAt, recipient: recipient ?? null, share_url: `${origin}/r/${token}` }, { status: 201 });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    return NextResponse.json({ error: "Failed to generate share link", message: err?.message || String(err) }, { status: 500 });
  }
}
