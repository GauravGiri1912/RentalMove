import { NextRequest, NextResponse } from "next/server";
import { UploadSignRequestSchema } from "@/lib/schemas";
import { getMediaProvider } from "@/lib/media";

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
    const media = getMediaProvider();

    const signResult = await media.signUpload({
      propertyId: property_id,
      inspectionId: inspection_id,
      inspectionType: "inspection", // Default inspection type or derived
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
