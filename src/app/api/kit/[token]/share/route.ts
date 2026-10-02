import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { loadKit, setSharing } from "@/lib/kit-node";
import { kitErrorResponse } from "@/lib/kit-http";

const Body = z.object({ on: z.boolean() });

/** POST /api/kit/:token/share { on } — the creator turns sharing on (sealed records only) or off (cancels every read-only link). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(req, { limit: 30, windowMs: 3_600_000, prefix: "kit-share" });
  if (!rl.success) return rl.response;
  try {
    const { token } = await params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    return NextResponse.json(await setSharing(await loadKit(token, "write"), parsed.data.on));
  } catch (err) {
    return kitErrorResponse(err);
  }
}
