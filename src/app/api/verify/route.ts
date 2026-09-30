import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { authRateLimit } from "@/lib/rate-limit";

const Body = z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/i) });

/**
 * POST /api/verify — public check: "is this exact file an evidence photo on record?"
 * The browser hashes the file locally; only the SHA-256 is sent (the photo never leaves the
 * device). A match reveals only room, inspection type and capture time — never the address.
 */
export async function POST(req: NextRequest) {
  const rl = authRateLimit(req);
  if (!rl.success) return rl.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send { sha256: <64 hex chars> }" }, { status: 400 });
  const sha = parsed.data.sha256.toLowerCase();
  const db = getDatabase();
  for (const p of await db.listProperties()) {
    const [rooms, inspections] = await Promise.all([db.getRooms(p.id), db.getInspections(p.id)]);
    for (const insp of inspections) {
      const hit = (await db.getAssets(insp.id)).find((a) => (a.sha256 || "").toLowerCase() === sha);
      if (hit) {
        return NextResponse.json({
          match: true,
          room: rooms.find((r) => r.id === hit.room_id)?.name ?? "Unknown room",
          inspection_type: insp.type,
          captured_at: hit.captured_at,
          registered_at: hit.created_at,
        });
      }
    }
  }
  return NextResponse.json({ match: false });
}
