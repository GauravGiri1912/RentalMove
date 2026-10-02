import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { KitError, loadKit, signKitUpload } from "@/lib/kit-node";
import { kitErrorResponse } from "@/lib/kit-http";

const Body = z.object({ room_id: z.string().min(1).max(120) });

/** POST /api/kit/:token/sign — Cloudinary upload signature for one room of the kit. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(req, { limit: 200, windowMs: 3_600_000, prefix: "kit-sign" });
  if (!rl.success) return rl.response;
  try {
    const { token } = await params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new KitError(400, "Missing room.");
    return NextResponse.json(signKitUpload(await loadKit(token, "write"), parsed.data.room_id));
  } catch (err) {
    return kitErrorResponse(err);
  }
}
