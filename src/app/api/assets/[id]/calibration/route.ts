import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserOrThrow, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";
import { assetWithProperty } from "@/lib/access";
import { appendEvent } from "@/lib/events";

const unit = z.number().min(0).max(1);
const Body = z.union([
  z.object({ line: z.tuple([unit, unit, unit, unit]), cm: z.number().positive().max(1000), reference: z.string().max(40) }),
  z.object({ clear: z.literal(true) }),
]);

/**
 * POST /api/assets/:id/calibration — sets (or clears) the photo's scale reference: a line
 * drawn across something of known length. Findings on the same surface are then sized in cm.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getAuthenticatedUserOrThrow(req);
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid scale reference", details: parsed.error.format() }, { status: 400 });
    const found = await assetWithProperty(user, id);
    if (!found) return forbiddenResponse("You do not have access to this photo.");
    const d = parsed.data;
    if ("line" in d) {
      const [x1, y1, x2, y2] = d.line;
      if (Math.hypot(x2 - x1, y2 - y1) < 0.02) return NextResponse.json({ error: "Draw a longer line across the reference." }, { status: 400 });
    }
    const event = await appendEvent({
      property_id: found.propertyId, type: "calibration", resource_id: id,
      actor_id: user.id, actor_name: user.name, actor_role: user.role,
      payload: "line" in d ? { line: d.line, cm: d.cm, reference: d.reference } : { cleared: true },
    });
    return NextResponse.json({ ok: true, event });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    return NextResponse.json({ error: "Failed to save scale", message: err?.message || String(err) }, { status: 500 });
  }
}
