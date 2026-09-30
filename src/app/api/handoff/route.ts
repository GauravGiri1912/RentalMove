import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { getAuthenticatedUserOrThrow, canUserAccessProperty, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";
import { signHandoff } from "@/lib/handoff";

const Body = z.object({ property_id: z.string().min(1), inspection_id: z.string().min(1), room_id: z.string().min(1) });

/** POST /api/handoff — a 15-minute capture link for one room, shown on the laptop as a QR code. */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUserOrThrow(req);
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid handoff request" }, { status: 400 });
    const { property_id, inspection_id, room_id } = parsed.data;
    if (!(await canUserAccessProperty(user, property_id))) return forbiddenResponse("No access to this property.");
    const db = getDatabase();
    const [inspections, rooms] = await Promise.all([db.getInspections(property_id), db.getRooms(property_id)]);
    if (!inspections.some((i) => i.id === inspection_id) || !rooms.some((r) => r.id === room_id)) {
      return NextResponse.json({ error: "Inspection or room not found for this property" }, { status: 404 });
    }
    const { token, expires_at } = signHandoff({ p: property_id, i: inspection_id, r: room_id, u: user.id, n: user.name, role: user.role });
    return NextResponse.json({ token, expires_at, path: `/h/${token}` }, { status: 201 });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    return NextResponse.json({ error: "Failed to create handoff", message: err?.message || String(err) }, { status: 500 });
  }
}
