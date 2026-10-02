import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { loadKit, sealKit } from "@/lib/kit-node";
import { kitErrorResponse } from "@/lib/kit-http";

/** POST /api/kit/:token/seal — fingerprints the whole kit and freezes it. Idempotent. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(req, { limit: 30, windowMs: 3_600_000, prefix: "kit-seal" });
  if (!rl.success) return rl.response;
  try {
    const { token } = await params;
    return NextResponse.json({ sealed: await sealKit(await loadKit(token, "write")) });
  } catch (err) {
    return kitErrorResponse(err);
  }
}
