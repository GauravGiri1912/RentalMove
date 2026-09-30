import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { verifyHandoff } from "@/lib/handoff";
import { reviewUrl } from "@/lib/cloudinary-urls";

/** GET /api/handoff/:token/info — what the phone is capturing (room, inspection, ghost photo). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = verifyHandoff(token);
  if (!c) return NextResponse.json({ error: "This capture link is invalid or has expired. Create a new one on the laptop." }, { status: 401 });
  const db = getDatabase();
  const [property, rooms, inspections] = await Promise.all([db.getProperty(c.p), db.getRooms(c.p), db.getInspections(c.p)]);
  const room = rooms.find((r) => r.id === c.r);
  const insp = inspections.find((i) => i.id === c.i);
  const baseline = [...inspections].sort((a, b) => a.captured_at.localeCompare(b.captured_at)).find((i) => i.type === "move_in" && i.id !== c.i);
  const ghost = baseline ? (await db.getAssets(baseline.id, c.r))[0] : undefined;
  return NextResponse.json({
    property: property ? `${property.address_label}, ${property.unit_label}` : "",
    room: room?.name ?? "Room",
    inspection: insp ? { type: insp.type, captured_at: insp.captured_at } : null,
    ghost_url: ghost ? reviewUrl(ghost.cloudinary_public_id) : null,
    by: c.n,
    expires_at: new Date(c.exp).toISOString(),
  });
}
