import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserOrThrow, invalidateAuthCaches, unauthorizedResponse } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { appendEvent, deriveInvites, listEvents } from "@/lib/events";
import { rateLimit } from "@/lib/rate-limit";
import { verifyInvite } from "@/lib/invite-crypto";

/**
 * POST /api/invites/:token/accept — the signed-in person joins the property as a TENANT. The role is not
 * chosen by them: it follows from the invitation. Single use: the first acceptance wins.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(req, { limit: 20, windowMs: 3_600_000, prefix: "invite-accept" });
  if (!rl.success) return rl.response;
  try {
    const user = await getAuthenticatedUserOrThrow(req);
    const { token } = await params;
    const claims = verifyInvite(token);
    if (!claims) return NextResponse.json({ error: "This invitation link is not valid or has expired." }, { status: 404 });
    const admin = createSupabaseAdminClient();
    const { data: prop } = await admin.from("properties").select("id, owner_id").eq("id", claims.p).maybeSingle();
    if (!prop) return NextResponse.json({ error: "This property no longer exists." }, { status: 404 });
    if (prop.owner_id === user.id) return NextResponse.json({ error: "You own this property, so you cannot join it as a tenant." }, { status: 409 });
    if (user.role === "owner") return NextResponse.json({ error: "This account manages properties of its own. Use a different account to join as a tenant." }, { status: 409 });

    const inv = deriveInvites(await listEvents(claims.p, ["invite"])).find((i) => i.id === claims.id);
    if (!inv) return NextResponse.json({ error: "This invitation no longer exists." }, { status: 404 });
    if (inv.status === "accepted" && inv.accepted_by_id === user.id) return NextResponse.json({ ok: true, already: true, property_id: claims.p });
    if (inv.status !== "pending") return NextResponse.json({ error: inv.status === "accepted" ? "This invitation was already used." : inv.status === "revoked" ? "The owner cancelled this invitation." : "This invitation has expired." }, { status: 409 });
    if (inv.email && inv.email !== user.email.trim().toLowerCase()) return NextResponse.json({ error: "This invitation was sent to a different email address. Sign in with that address to accept it." }, { status: 403 });
    if (user.assigned_property_id && user.assigned_property_id !== claims.p) return NextResponse.json({ error: "This account is already a tenant of another property." }, { status: 409 });

    const row = { id: `pt-${crypto.randomBytes(6).toString("hex")}`, property_id: claims.p, tenant_id: user.id };
    const { error: insErr } = await admin.from("property_tenants").insert(row);
    if (insErr && !/duplicate|unique/i.test(insErr.message)) throw new Error(insErr.message);
    await appendEvent({ property_id: claims.p, type: "invite", resource_id: null, actor_id: user.id, actor_name: user.name, actor_role: "tenant", payload: { action: "accept", id: claims.id } });

    // Two people opening the same link at once: only the first recorded acceptance keeps the place.
    const after = deriveInvites(await listEvents(claims.p, ["invite"])).find((i) => i.id === claims.id);
    if (after?.accepted_by_id !== user.id) {
      if (!insErr) await admin.from("property_tenants").delete().eq("id", row.id);
      return NextResponse.json({ error: "This invitation was already used." }, { status: 409 });
    }
    invalidateAuthCaches();
    return NextResponse.json({ ok: true, property_id: claims.p });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    console.error("Invite accept error:", err);
    return NextResponse.json({ error: "Could not accept the invitation", message: err?.message || String(err) }, { status: 500 });
  }
}
