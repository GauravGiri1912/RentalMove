import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserOrThrow, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";
import { observationWithProperty } from "@/lib/access";
import { appendEvent } from "@/lib/events";

const Body = z.object({ stance: z.enum(["agree", "dispute"]).nullable() });

/**
 * POST /api/observations/:id/stance — the caller's position on a finding.
 * agree = "yes, this is a change"; dispute = "no / not as described"; null withdraws.
 * Recorded as an append-only event; the latest per role wins.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getAuthenticatedUserOrThrow(req);
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid stance", details: parsed.error.format() }, { status: 400 });
    const found = await observationWithProperty(user, id);
    if (!found) return forbiddenResponse("You do not have access to this finding.");
    const event = await appendEvent({
      property_id: found.propertyId,
      type: "stance",
      resource_id: id,
      actor_id: user.id,
      actor_name: user.name,
      actor_role: user.role,
      payload: { stance: parsed.data.stance },
    });
    return NextResponse.json({ ok: true, event });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    return NextResponse.json({ error: "Failed to record position", message: err?.message || String(err) }, { status: 500 });
  }
}
