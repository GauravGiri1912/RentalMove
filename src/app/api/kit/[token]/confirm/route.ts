import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { ackKit, loadKit } from "@/lib/kit-node";
import { kitErrorResponse } from "@/lib/kit-http";

/** POST /api/kit/:token/confirm — the person holding the read-only link says they have seen the sealed record. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(req, { limit: 20, windowMs: 3_600_000, prefix: "kit-confirm" });
  if (!rl.success) return rl.response;
  try {
    const { token } = await params;
    const body = await req.json().catch(() => null);
    const acks = await ackKit(await loadKit(token), String(body?.name ?? ""));
    return NextResponse.json({ acks });
  } catch (err) {
    return kitErrorResponse(err);
  }
}
