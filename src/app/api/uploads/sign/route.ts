import { NextRequest, NextResponse } from "next/server";
import { UploadSignRequestSchema } from "@/lib/schemas";
import { getMediaProvider } from "@/lib/media";
import { getSessionUser, canUserAccessProperty, forbiddenResponse } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = UploadSignRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid upload signature request", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { property_id, inspection_id, room } = parsed.data;

    // Check user authorization to upload for this property
    const user = await getSessionUser(req);
    if (user) {
      const authorized = await canUserAccessProperty(user, property_id);
      if (!authorized) {
        return forbiddenResponse("You do not have permission to upload media to this property.");
      }
    }

    const media = getMediaProvider();
    const signResult = await media.signUpload({
      propertyId: property_id,
      inspectionId: inspection_id,
      inspectionType: "inspection",
      room,
    });

    return NextResponse.json(signResult);
  } catch (err: any) {
    console.error("Upload signing error:", err);
    return NextResponse.json(
      { error: "Failed to generate upload signature", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
