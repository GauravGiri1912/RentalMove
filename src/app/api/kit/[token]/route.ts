import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { deleteKit, kitState, loadKit } from "@/lib/kit-node";
import { kitErrorResponse } from "@/lib/kit-http";

/** GET /api/kit/:token — the capture page's view of the kit (rooms, shots, progress). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(req, { limit: 240, windowMs: 60_000, prefix: "kit-read" });
  if (!rl.success) return rl.response;
  try {
    const { token } = await params;
    return NextResponse.json(await kitState(await loadKit(token)), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return kitErrorResponse(err);
  }
}

/** DELETE /api/kit/:token — removes the kit, its photos and its records. Tenant link only. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(req, { limit: 10, windowMs: 3_600_000, prefix: "kit-delete" });
  if (!rl.success) return rl.response;
  try {
    const { token } = await params;
    await deleteKit(await loadKit(token, "write"));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return kitErrorResponse(err);
  }
}
