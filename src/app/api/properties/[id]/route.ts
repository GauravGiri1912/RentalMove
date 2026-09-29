import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { getSessionUser, canUserAccessProperty, forbiddenResponse } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDatabase();
    const property = await db.getProperty(id);

    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    // Server-side Property Authorization Check
    const user = await getSessionUser(req);
    if (user) {
      const authorized = await canUserAccessProperty(user, id);
      if (!authorized) {
        return forbiddenResponse("You do not have authorization to view this property.");
      }
    }

    const rooms = await db.getRooms(id);
    const inspections = await db.getInspections(id);

    return NextResponse.json({
      property,
      rooms,
      inspections,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to fetch property", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
