import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { getMediaProvider } from "@/lib/media";
import { verifyHandoff } from "@/lib/handoff";
import { uploadRateLimit } from "@/lib/rate-limit";

/** POST /api/handoff/:token/sign — upload signature for exactly the token's room. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = uploadRateLimit(req);
  if (!rl.success) return rl.response;
  const { token } = await params;
  const c = verifyHandoff(token);
  if (!c) return NextResponse.json({ error: "Capture link invalid or expired" }, { status: 401 });
  const db = getDatabase();
  const [rooms, inspections] = await Promise.all([db.getRooms(c.p), db.getInspections(c.p)]);
  const room = rooms.find((r) => r.id === c.r);
  const insp = inspections.find((i) => i.id === c.i);
  if (!room || !insp) return NextResponse.json({ error: "Room or inspection no longer exists" }, { status: 404 });
  const sig = await getMediaProvider().signUpload({ propertyId: c.p, inspectionId: c.i, inspectionType: insp.type, room: room.category });
  return NextResponse.json(sig);
}
