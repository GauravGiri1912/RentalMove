import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserOrThrow, canUserAccessProperty, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";
import { buildSnapshot } from "@/lib/snapshot";
import { appendEvent } from "@/lib/events";

const Body = z.object({
  property_id: z.string().min(1),
  /** The content hash the signer saw. Must equal the server's current hash. */
  hash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
});

/**
 * POST /api/report/sign — tenant or owner signs the current report content hash.
 * hash=null withdraws the caller's signature. A stale hash is rejected (409) so nobody
 * can sign a version of the report they did not see.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUserOrThrow(req);
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid signature request" }, { status: 400 });
    const { property_id, hash } = parsed.data;
    if (!(await canUserAccessProperty(user, property_id))) return forbiddenResponse("You cannot sign this report.");
    if (hash) {
      const snap = await buildSnapshot(property_id, user);
      if (!snap) return NextResponse.json({ error: "Property not found" }, { status: 404 });
      if (snap.report.content_hash !== hash) {
        return NextResponse.json({ error: "The report changed since you loaded it. Reload and review before signing.", current_hash: snap.report.content_hash }, { status: 409 });
      }
    }
    const event = await appendEvent({ property_id, type: "signature", resource_id: property_id, actor_id: user.id, actor_name: user.name, actor_role: user.role, payload: { hash } });
    return NextResponse.json({ ok: true, event });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    return NextResponse.json({ error: "Failed to sign", message: err?.message || String(err) }, { status: 500 });
  }
}
