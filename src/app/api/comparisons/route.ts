import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { getVisionProvider } from "@/lib/vision";
import { getMediaProvider } from "@/lib/media";
import {
  getAuthenticatedUserOrThrow,
  canUserAccessProperty,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth";
import { z } from "zod";
import { aiRateLimit } from "@/lib/rate-limit";

const ComparisonRequestSchema = z.object({
  prior_asset_id: z.string().min(1),
  current_asset_id: z.string().min(1),
  property_id: z.string().min(1),
  room_id: z.string().optional(),
});

/**
 * POST /api/comparisons
 * Runs a VLM-powered before/after comparison.
 * Requires authentication and property access authorization.
 */
export async function POST(req: NextRequest) {
  const rl = aiRateLimit(req);
  if (!rl.success) return rl.response;

  try {
    const user = await getAuthenticatedUserOrThrow(req);

    const body = await req.json();
    const parsed = ComparisonRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid comparison request", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { prior_asset_id, current_asset_id, property_id, room_id } = parsed.data;

    // Verify user can access this property
    const authorized = await canUserAccessProperty(user, property_id);
    if (!authorized) {
      return forbiddenResponse("You do not have authorization to run comparisons on this property.");
    }

    const db = getDatabase();
    const media = getMediaProvider();
    const vision = getVisionProvider();

    const prior = await db.getAssetById(prior_asset_id);
    const current = await db.getAssetById(current_asset_id);

    if (!prior || !current) {
      return NextResponse.json({ error: "One or both assets not found" }, { status: 404 });
    }

    const priorUrl = media.vlmCopy(prior.cloudinary_public_id || prior.secure_url);
    const currentUrl = media.vlmCopy(current.cloudinary_public_id || current.secure_url);

    const comparisonResult = await vision.compareImages({
      priorUrl,
      currentUrl,
      room: prior.room_guess || "room",
    });

    const comparison = await db.createComparison({
      property_id,
      room_id: room_id || prior.room_id,
      prior_asset_id,
      current_asset_id,
      summary: comparisonResult.summary,
      changes: comparisonResult.changes,
      caveats: comparisonResult.caveats || [],
      confidence: 0.88,
      review_required: true,
      model_version: process.env.VISION_MODEL || "qwen/qwen3.8-27b",
    });

    return NextResponse.json({ comparison, result: comparisonResult });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    console.error("Comparison error:", err);
    return NextResponse.json(
      { error: "Failed to compare images", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
