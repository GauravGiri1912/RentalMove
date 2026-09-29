import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { RoomCategoryEnum } from "@/lib/schemas";
import { getSessionUser, canUserAccessProperty, forbiddenResponse } from "@/lib/auth";
import { z } from "zod";

const CreateRoomSchema = z.object({
  name: z.string().min(1, "Room name is required"),
  category: RoomCategoryEnum,
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getSessionUser(req);

    if (user) {
      const authorized = await canUserAccessProperty(user, id);
      if (!authorized) {
        return forbiddenResponse("You do not have authorization to view rooms for this property.");
      }
    }

    const db = getDatabase();
    const rooms = await db.getRooms(id);
    return NextResponse.json({ rooms });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to list rooms", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getSessionUser(req);

    // Only property owners can add rooms
    if (user && user.role !== "owner") {
      return forbiddenResponse("Only property owners are authorized to create rooms.");
    }
    if (user) {
      const authorized = await canUserAccessProperty(user, id);
      if (!authorized) {
        return forbiddenResponse("You do not own this property.");
      }
    }

    const db = getDatabase();
    const property = await db.getProperty(id);
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = CreateRoomSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid room payload", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const newRoom = await db.createRoom({
      property_id: id,
      name: parsed.data.name,
      category: parsed.data.category,
    });

    return NextResponse.json(newRoom, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to create room", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
