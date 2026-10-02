import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { loadKit, replaceReadLink } from "@/lib/kit-node";
import { kitErrorResponse } from "@/lib/kit-http";

/** POST /api/kit/:token/relink — cancels every read-only link sent so far and returns a new one. Tenant only. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(req, { limit: 20, windowMs: 3_600_000, prefix: "kit-relink" });
  if (!rl.success) return rl.response;
  try {
    const { token } = await params;
    return NextResponse.json({ read_token: await replaceReadLink(await loadKit(token, "write")) });
  } catch (err) {
    return kitErrorResponse(err);
  }
}
