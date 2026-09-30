import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { registerAsset } from "@/lib/pipeline";
import { getDatabase } from "@/lib/db";

/**
 * POST /api/cloudinary/webhook
 * Cloudinary Upload Notification Webhook.
 *
 * Triggered automatically by Cloudinary when an upload completes (server-to-server).
 * Enables the upload-triggered pipeline: processing starts when the photo lands in Cloudinary,
 * independent of whether the browser tab remains open.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const timestamp = req.headers.get("x-cld-timestamp");
    const signature = req.headers.get("x-cld-signature");

    // The signature is mandatory: without it anyone could register arbitrary assets.
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!apiSecret) {
      return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
    }
    if (!timestamp || !signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }
    const isValid = cloudinary.utils.verifyNotificationSignature(
      rawBody,
      Number(timestamp),
      signature
    );
    if (!isValid) {
      console.warn("[Cloudinary Webhook] Invalid webhook signature from IP:", req.headers.get("x-forwarded-for"));
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);

    // Only process successful image upload notifications
    if (payload.notification_type !== "upload" || payload.resource_type !== "image") {
      return NextResponse.json({ received: true, ignored: true });
    }

    const publicId = payload.public_id;
    if (!publicId || !publicId.startsWith("properties/")) {
      return NextResponse.json({ received: true, ignored: "non_property_asset" });
    }

    // Extract property_id, inspection_id, room from folder path
    // Path structure: properties/{propertyId}/{inspectionId}/{room}/{filename}
    const parts = publicId.split("/");
    const propertyId = parts[1] || payload.context?.custom?.property_id;
    const inspectionId = parts[2] || payload.context?.custom?.inspection_id;
    const roomCategory = parts[3] || payload.context?.custom?.room || "living_room";

    if (!propertyId || !inspectionId) {
      console.warn("[Cloudinary Webhook] Missing property or inspection hierarchy in publicId:", publicId);
      return NextResponse.json({ error: "Missing hierarchy in public_id" }, { status: 400 });
    }

    const db = getDatabase();

    // Only attach uploads to a property and inspection that already exist.
    const property = await db.getProperty(propertyId);
    const inspection = property
      ? (await db.getInspections(propertyId)).find((i) => i.id === inspectionId)
      : undefined;
    if (!property || !inspection) {
      console.warn("[Cloudinary Webhook] Unknown property/inspection for", publicId);
      return NextResponse.json({ received: true, ignored: "unknown_property_or_inspection" });
    }

    // Resolve room_id
    const rooms = await db.getRooms(propertyId);
    let room = rooms.find((r) => r.category === roomCategory);
    if (!room) {
      room = await db.createRoom({
        property_id: propertyId,
        name: roomCategory.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
        category: roomCategory as any,
      });
    }

    // Idempotent registration and pipeline execution
    const asset = await registerAsset({
      property_id: propertyId,
      inspection_id: inspectionId,
      room_id: room.id,
      cloudinary_public_id: publicId,
      secure_url: payload.secure_url,
      etag: payload.etag,
      width: payload.width,
      height: payload.height,
    });

    console.log(`[Cloudinary Webhook] Successfully processed asset ${publicId} (ID: ${asset.id})`);
    return NextResponse.json({ success: true, asset_id: asset.id });
  } catch (err: any) {
    console.error("[Cloudinary Webhook] Error processing notification:", err);
    return NextResponse.json(
      { error: "Webhook handling failed", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}

/** Vision calls can take several seconds; allow the host to keep the function alive. */
export const maxDuration = 60;
