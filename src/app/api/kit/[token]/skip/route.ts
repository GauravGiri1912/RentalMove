import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { KitError, loadKit, skipKitShot } from "@/lib/kit-node";
import { kitErrorResponse } from "@/lib/kit-http";

const Body = z.object({ room_id: z.string().min(1).max(120), shot_id: z.string().min(1).max(40) });

/** POST /api/kit/:token/skip — the tenant chooses not to photograph one item (it is listed as not photographed). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(req, { limit: 200, windowMs: 3_600_000, prefix: "kit-skip" });
  if (!rl.success) return rl.response;
  try {
    const { token } = await params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new KitError(400, "Invalid request.");
    await skipKitShot(await loadKit(token, "write"), parsed.data.room_id, parsed.data.shot_id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return kitErrorResponse(err);
  }
}
