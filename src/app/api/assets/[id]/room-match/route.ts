import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserOrThrow, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";
import { assetWithProperty } from "@/lib/access";
import { appendEvent } from "@/lib/events";
import { rateLimit } from "@/lib/rate-limit";
import { checkRoomMatch } from "@/lib/roommatch-node";

const Body = z.object({ action: z.enum(["check", "confirm"]) });

/**
 * POST /api/assets/:id/room-match
 *   check    (re)run the "does this photo show this room?" check (pixels only)
 *   confirm  a person confirms the photo shows the room it was filed under
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = await rateLimit(req, { limit: 30, windowMs: 60_000, prefix: "room-match" });
  if (!rl.success) return rl.response;
  try {
    const { id } = await params;
    const user = await getAuthenticatedUserOrThrow(req);
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const found = await assetWithProperty(user, id);
    if (!found) return forbiddenResponse("You do not have access to this photo.");
    if (parsed.data.action === "check") {
      const r = await checkRoomMatch(found.asset, found.propertyId);
      return NextResponse.json({ ok: true, ...r });
    }
    const event = await appendEvent({ property_id: found.propertyId, type: "roommatch", resource_id: id, actor_id: user.id, actor_name: user.name, actor_role: user.role, payload: { action: "confirm" } });
    return NextResponse.json({ ok: true, event });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    return NextResponse.json({ error: "Room check failed", message: err?.message || String(err) }, { status: 500 });
  }
}
