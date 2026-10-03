import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserOrThrow, canUserAccessProperty, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";
import { buildSnapshot } from "@/lib/snapshot";
import { rateLimit } from "@/lib/rate-limit";
import { assessClaim, parseClaim } from "@/lib/claim";

const Body = z.object({
  property_id: z.string().min(1),
  message: z.string().trim().min(3, "Paste the landlord's message.").max(1500, "That message is too long. Paste just the part about the damage."),
});

/**
 * POST /api/claim { property_id, message }
 *
 * Reads the landlord's message and looks the claim up in the record. The message is NOT stored: it is the other
 * person's words, it is only needed for this lookup, and nothing about it is written to the event log.
 */
export async function POST(req: NextRequest) {
  const rl = await rateLimit(req, { limit: 40, windowMs: 3_600_000, prefix: "claim" });
  if (!rl.success) return rl.response;
  try {
    const user = await getAuthenticatedUserOrThrow(req);
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    if (!(await canUserAccessProperty(user, parsed.data.property_id))) return forbiddenResponse("You do not have access to this property.");

    const snap = await buildSnapshot(parsed.data.property_id, user);
    if (!snap) return NextResponse.json({ error: "Property not found" }, { status: 404 });
    const result = assessClaim(parseClaim(parsed.data.message), {
      rooms: snap.rooms,
      inspections: snap.inspections,
      assets: snap.assets,
      observations: snap.observations,
      roomMatch: snap.room_match as any,
      measures: snap.measures as any,
      baselineId: snap.report.baseline_inspection_id,
      currentId: snap.report.current_inspection_id,
    });
    return NextResponse.json({ result });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    return NextResponse.json({ error: "Could not check the claim", message: err?.message || String(err) }, { status: 500 });
  }
}
