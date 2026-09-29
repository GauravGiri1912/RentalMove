import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { InspectionTypeEnum } from "@/lib/schemas";
import {
  getAuthenticatedUserOrThrow,
  canUserAccessProperty,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth";
import { z } from "zod";

const CreateInspectionBodySchema = z.object({
  type: InspectionTypeEnum,
  captured_at: z.string().optional(),
  status: z.enum(["in_progress", "completed"]).default("completed"),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: propertyId } = await params;
    const user = await getAuthenticatedUserOrThrow(req);

    const authorized = await canUserAccessProperty(user, propertyId);
    if (!authorized) {
      return forbiddenResponse("You do not have permission to view inspections for this property.");
    }

    const db = getDatabase();
    const inspections = await db.getInspections(propertyId);
    return NextResponse.json({ inspections });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    return NextResponse.json(
      { error: "Failed to fetch inspections", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: propertyId } = await params;
    const user = await getAuthenticatedUserOrThrow(req);

    const authorized = await canUserAccessProperty(user, propertyId);
    if (!authorized) {
      return forbiddenResponse("You do not have permission to create inspections for this property.");
    }

    const db = getDatabase();
    const property = await db.getProperty(propertyId);
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = CreateInspectionBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid inspection payload", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const newInspection = await db.createInspection({
      property_id: propertyId,
      type: parsed.data.type,
      captured_at: parsed.data.captured_at || new Date().toISOString(),
      created_by: user.id, // Always the authenticated user
      status: parsed.data.status,
    });

    return NextResponse.json(newInspection, { status: 201 });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    console.error("Create inspection error:", err);
    return NextResponse.json(
      { error: "Failed to create inspection", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
