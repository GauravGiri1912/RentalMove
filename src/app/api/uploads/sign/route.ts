import { NextRequest, NextResponse } from "next/server";
import { UploadSignRequestSchema } from "@/lib/schemas";
import { getMediaProvider } from "@/lib/media";
import { getDatabase } from "@/lib/db";
import {
  getAuthenticatedUserOrThrow,
  canUserAccessProperty,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth";
import { uploadRateLimit } from "@/lib/rate-limit";


/**
 * POST /api/uploads/sign
 * Generates a Cloudinary signed upload URL.
 * Requires authentication and property access authorization.
 */
export async function POST(req: NextRequest) {
  const rl = uploadRateLimit(req);
  if (!rl.success) return rl.response;

  try {
    // Require authentication — no signed uploads for anonymous users
    const user = await getAuthenticatedUserOrThrow(req);

    const body = await req.json();
    const parsed = UploadSignRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid upload signature request", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { property_id, inspection_id, room } = parsed.data;

    // Verify user can upload to this specific property
    const authorized = await canUserAccessProperty(user, property_id);
    if (!authorized) {
      return forbiddenResponse("You do not have permission to upload media to this property.");
    }

    const inspection = (await getDatabase().getInspections(property_id)).find((i) => i.id === inspection_id);
    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found for this property" }, { status: 404 });
    }

    const media = getMediaProvider();
    const signResult = await media.signUpload({
      propertyId: property_id,
      inspectionId: inspection_id,
      inspectionType: inspection.type, // was hard-coded to "inspection", mis-tagging every upload
      room,
    });

    return NextResponse.json(signResult);
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    console.error("Upload signing error:", err);
    return NextResponse.json(
      { error: "Failed to generate upload signature", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
