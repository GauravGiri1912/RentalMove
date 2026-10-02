import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserOrThrow, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";
import { appendEvent, deriveInvites, listEvents } from "@/lib/events";
import { rateLimit } from "@/lib/rate-limit";
import { INVITE_TTL_MS, signInvite } from "@/lib/invite-crypto";

const Body = z.object({ email: z.string().email().max(200).optional() });
const MAX_PENDING = 5;

async function asOwner(req: NextRequest, propertyId: string) {
  const user = await getAuthenticatedUserOrThrow(req);
  // Only the property's owner. Derived from the property record, never from a claimed role.
  if (user.role !== "owner" || !(user.owned_properties ?? []).includes(propertyId)) return { user, ok: false as const };
  return { user, ok: true as const };
}

/** GET /api/properties/:id/invites — the owner's invitations (pending ones include the link to send). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { ok } = await asOwner(req, id);
    if (!ok) return forbiddenResponse("Only the owner of this property can see its invitations.");
    const invites = deriveInvites(await listEvents(id, ["invite"])).reverse().map((i) => ({
      ...i,
      path: i.status === "pending" ? `/join/${signInvite({ p: id, id: i.id, exp: Date.parse(i.expires_at) })}` : null,
    }));
    return NextResponse.json({ invites });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    return NextResponse.json({ error: "Could not load invitations", message: err?.message || String(err) }, { status: 500 });
  }
}

/** POST /api/properties/:id/invites { email? } — creates a single-use invitation for a tenant (valid 14 days). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = await rateLimit(req, { limit: 20, windowMs: 3_600_000, prefix: "invite-create" });
  if (!rl.success) return rl.response;
  try {
    const { id } = await params;
    const { user, ok } = await asOwner(req, id);
    if (!ok) return forbiddenResponse("Only the owner of this property can invite a tenant.");
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "That email address does not look right." }, { status: 400 });
    const existing = deriveInvites(await listEvents(id, ["invite"]));
    if (existing.filter((i) => i.status === "pending").length >= MAX_PENDING) return NextResponse.json({ error: `You already have ${MAX_PENDING} open invitations. Revoke one first.` }, { status: 409 });
    const inviteId = crypto.randomBytes(5).toString("hex");
    const exp = Date.now() + INVITE_TTL_MS;
    const email = parsed.data.email?.trim().toLowerCase() ?? null;
    await appendEvent({ property_id: id, type: "invite", resource_id: null, actor_id: user.id, actor_name: user.name, actor_role: "owner", payload: { action: "create", id: inviteId, email, expires_at: new Date(exp).toISOString() } });
    return NextResponse.json({ id: inviteId, email, expires_at: new Date(exp).toISOString(), path: `/join/${signInvite({ p: id, id: inviteId, exp })}` }, { status: 201 });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    return NextResponse.json({ error: "Could not create the invitation", message: err?.message || String(err) }, { status: 500 });
  }
}
