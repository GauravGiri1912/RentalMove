import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export async function GET() {
  try {
    const db = getDatabase();
    const properties = await db.listProperties();
    return NextResponse.json({ properties });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to list properties", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
