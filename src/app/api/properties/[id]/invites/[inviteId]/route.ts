import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserOrThrow, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";
import { appendEvent, deriveInvites, listEvents } from "@/lib/events";

/** DELETE /api/properties/:id/invites/:inviteId — revokes a pending invitation (its link stops working). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; inviteId: string }> }) {
  try {
    const { id, inviteId } = await params;
    const user = await getAuthenticatedUserOrThrow(req);
    if (user.role !== "owner" || !(user.owned_properties ?? []).includes(id)) return forbiddenResponse("Only the owner of this property can revoke invitations.");
    const inv = deriveInvites(await listEvents(id, ["invite"])).find((i) => i.id === inviteId);
    if (!inv) return NextResponse.json({ error: "No such invitation." }, { status: 404 });
    if (inv.status !== "pending") return NextResponse.json({ error: `This invitation is already ${inv.status}.` }, { status: 409 });
    await appendEvent({ property_id: id, type: "invite", resource_id: null, actor_id: user.id, actor_name: user.name, actor_role: "owner", payload: { action: "revoke", id: inviteId } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    return NextResponse.json({ error: "Could not revoke the invitation", message: err?.message || String(err) }, { status: 500 });
  }
}
