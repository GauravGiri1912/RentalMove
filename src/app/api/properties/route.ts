import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { PropertyCreateSchema } from "@/lib/schemas";
import { getSessionUser, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const db = getDatabase();

    let properties = [];
    if (user) {
      properties = await db.listProperties(user.id, user.role);
    } else {
      const { searchParams } = new URL(req.url);
      const ownerId = searchParams.get("owner_id") || undefined;
      properties = await db.listProperties(ownerId);
    }

    return NextResponse.json({ properties });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to list properties", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    // Enforce role authorization: Only owners can create properties
    if (user && user.role !== "owner") {
      return forbiddenResponse("Only property owners are authorized to create new properties.");
    }

    const body = await req.json();
    const parsed = PropertyCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid property data", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const db = getDatabase();
    const propertyData = {
      ...parsed.data,
      owner_id: user ? user.id : (parsed.data.owner_id || "user-owner-1"),
    };

    const property = await db.createProperty(propertyData);
    const rooms = await db.getRooms(property.id);

    return NextResponse.json({ property, rooms }, { status: 201 });
  } catch (err: any) {
    console.error("Property creation error:", err);
    return NextResponse.json(
      { error: "Failed to create property", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
