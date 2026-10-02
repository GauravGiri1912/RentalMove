import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { kitReport, loadKit } from "@/lib/kit-node";
import { kitErrorResponse } from "@/lib/kit-http";

/** GET /api/kit/:token/report — the record; works with the tenant's link or the read-only link. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(req, { limit: 120, windowMs: 60_000, prefix: "kit-report" });
  if (!rl.success) return rl.response;
  try {
    const { token } = await params;
    return NextResponse.json(await kitReport(await loadKit(token)), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return kitErrorResponse(err);
  }
}
