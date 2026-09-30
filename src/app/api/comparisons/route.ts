import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { getAuthenticatedUserOrThrow, canUserAccessProperty, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";
import { aiRateLimit } from "@/lib/rate-limit";
import { runComparison } from "@/lib/compare";
import { propertyIdForInspection } from "@/lib/grounding";

const ComparisonRequestSchema = z.object({
  prior_asset_id: z.string().min(1),
  current_asset_id: z.string().min(1),
  property_id: z.string().min(1),
  room_id: z.string().optional(),
  tiled: z.boolean().optional(),
});

/**
 * POST /api/comparisons — vision-model comparison of two photos, grounded on pixels.
 * Both assets must belong to the property the caller is authorised for.
 */
export async function POST(req: NextRequest) {
  const rl = aiRateLimit(req);
  if (!rl.success) return rl.response;

  try {
    const user = await getAuthenticatedUserOrThrow(req);
    const parsed = ComparisonRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid comparison request", details: parsed.error.format() }, { status: 400 });
    }
    const { prior_asset_id, current_asset_id, property_id, room_id, tiled } = parsed.data;
    if (!(await canUserAccessProperty(user, property_id))) {
      return forbiddenResponse("You do not have authorization to run comparisons on this property.");
    }

    const db = getDatabase();
    const [prior, current] = await Promise.all([db.getAssetById(prior_asset_id), db.getAssetById(current_asset_id)]);
    if (!prior || !current) return NextResponse.json({ error: "One or both assets not found" }, { status: 404 });
    // Both photos must belong to the authorised property (previously not checked).
    const [pp, cp] = await Promise.all([propertyIdForInspection(prior.inspection_id), propertyIdForInspection(current.inspection_id)]);
    if (pp !== property_id || cp !== property_id) return forbiddenResponse("Both photos must belong to this property.");

    const room = (await db.getRooms(property_id)).find((r) => r.id === (room_id || prior.room_id));
    const { comparison, result } = await runComparison({
      propertyId: property_id,
      prior,
      current,
      roomId: room?.id,
      roomName: room?.name,
      tiled,
      actor: { id: user.id, name: user.name, role: user.role },
    });
    return NextResponse.json({ comparison, result });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    console.error("Comparison error:", err);
    if (err?.name === "VisionError") {
      return NextResponse.json({ error: "Vision provider unavailable", message: err.message }, { status: 502 });
    }
    return NextResponse.json({ error: "Failed to compare images", message: err?.message || String(err) }, { status: 500 });
  }
}

export const maxDuration = 60;
