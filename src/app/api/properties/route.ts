import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { PropertyCreateSchema } from "@/lib/schemas";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ownerId = searchParams.get("owner_id") || undefined;
    const db = getDatabase();
    const properties = await db.listProperties(ownerId);
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
    const body = await req.json();
    const parsed = PropertyCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid property data", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const db = getDatabase();
    const property = await db.createProperty(parsed.data);
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
