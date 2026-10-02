import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { deriveInvites, listEvents } from "@/lib/events";
import { rateLimit } from "@/lib/rate-limit";
import { verifyInvite } from "@/lib/invite-crypto";

/**
 * GET /api/invites/:token — what an invitation is for, before anyone signs in. Shows only the property's
 * label, the inviter's name and whether the link can still be used.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(req, { limit: 60, windowMs: 60_000, prefix: "invite-preview" });
  if (!rl.success) return rl.response;
  const { token } = await params;
  const claims = verifyInvite(token);
  if (!claims) return NextResponse.json({ valid: false, reason: "This invitation link is not valid or has expired." }, { status: 404 });
  const db = getDatabase();
  const [property, events] = await Promise.all([db.getProperty(claims.p), listEvents(claims.p, ["invite"])]);
  const inv = deriveInvites(events).find((i) => i.id === claims.id);
  if (!property || !inv) return NextResponse.json({ valid: false, reason: "This invitation no longer exists." }, { status: 404 });
  const owner = property.owner_id ? (await db.listUsers()).find((u) => u.id === property.owner_id)?.name ?? null : null;
  return NextResponse.json({
    valid: inv.status === "pending",
    status: inv.status,
    reason: inv.status === "pending" ? null : inv.status === "accepted" ? "This invitation was already used." : inv.status === "revoked" ? "The owner cancelled this invitation." : "This invitation has expired.",
    property: property.address_label,
    invited_by: owner,
    email_restricted: !!inv.email,
  });
}
