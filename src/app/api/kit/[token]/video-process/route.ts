import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { KitError, loadKit, processKitVideo } from "@/lib/kit-node";
import { kitErrorResponse } from "@/lib/kit-http";

const Body = z.object({
  room_id: z.string().min(1).max(120),
  cloudinary_public_id: z.string().min(1).max(300),
  /** How long the clip is in seconds (Cloudinary reports this as `duration`). */
  duration_seconds: z.number().positive().max(65),
});

/**
 * POST /api/kit/:token/video-process
 *
 * Called after the video has been uploaded to Cloudinary.
 * Samples frames, filters for quality, deduplicates, and registers the
 * best frame per checklist item as a kit photo.
 *
 * Runs synchronously (no background job) so the tenant sees the result instantly.
 * Capped at 60 s clips → ~18 frames → completes in 10–25 s depending on Cloudinary CDN.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  // Generous window (10 per hour) — frame extraction is expensive.
  const rl = await rateLimit(req, { limit: 10, windowMs: 3_600_000, prefix: "kit-video-process" });
  if (!rl.success) return rl.response;
  try {
    const { token } = await params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new KitError(400, "Invalid video details.");
    const ctx = await loadKit(token, "write");
    const result = await processKitVideo(ctx, parsed.data.room_id, parsed.data.cloudinary_public_id, parsed.data.duration_seconds);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return kitErrorResponse(err);
  }
}

// Frame analysis takes up to ~25 s for a full 60-s clip.
export const maxDuration = 60;
