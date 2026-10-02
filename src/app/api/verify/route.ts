import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { authRateLimit } from "@/lib/rate-limit";
import { deriveKit, listEvents } from "@/lib/events";

const Body = z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/i) });

/**
 * POST /api/verify — public check: "is this exact file an evidence photo on record?"
 * The browser hashes the file locally; only the SHA-256 is sent (the photo never leaves the
 * device). A match reveals only room, inspection type and capture time — never the address.
 */
export async function POST(req: NextRequest) {
  const rl = await authRateLimit(req);
  if (!rl.success) return rl.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send { sha256: <64 hex chars> }" }, { status: 400 });
  const sha = parsed.data.sha256.toLowerCase();
  const db = getDatabase();
  const hit = await db.getAssetBySha256(sha);
  if (!hit) {
    return NextResponse.json({ match: false });
  }

  const [insp, room] = await Promise.all([
    hit.inspection_id ? db.getInspectionById(hit.inspection_id) : Promise.resolve(null),
    hit.room_id ? db.getRoomById(hit.room_id) : Promise.resolve(null),
  ]);

  // A move-in kit is private to whoever made it: its photos are only recognised once they have chosen to share it.
  if (insp?.property_id?.startsWith("kit-")) {
    const kit = deriveKit(await listEvents(insp.property_id, ["kit"]));
    if (!kit?.sharing) return NextResponse.json({ match: false });
  }

  return NextResponse.json({
    match: true,
    room: room?.name ?? "Unknown room",
    inspection_type: insp?.type ?? "inspection",
    captured_at: hit.captured_at,
    registered_at: hit.created_at,
  });
}
