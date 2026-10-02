import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { KitError, loadKit, registerKitPhoto } from "@/lib/kit-node";
import { kitErrorResponse } from "@/lib/kit-http";

const Body = z.object({
  room_id: z.string().min(1).max(120),
  shot_id: z.string().min(1).max(40),
  cloudinary_public_id: z.string().min(1).max(300),
  secure_url: z.string().url().max(600),
  etag: z.string().max(100).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
});

/** POST /api/kit/:token/photo — records an uploaded photo as one shot of one room (a retake replaces it). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(req, { limit: 200, windowMs: 3_600_000, prefix: "kit-photo" });
  if (!rl.success) return rl.response;
  try {
    const { token } = await params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new KitError(400, "Invalid photo details.");
    return NextResponse.json(await registerKitPhoto(await loadKit(token, "write"), parsed.data), { status: 201 });
  } catch (err) {
    return kitErrorResponse(err);
  }
}

export const maxDuration = 60;
