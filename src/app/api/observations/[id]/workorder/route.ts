import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { v2 as cloudinary } from "cloudinary";
import { getAuthenticatedUserOrThrow, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";
import { observationWithProperty } from "@/lib/access";
import { appendEvent, deriveWorkOrders, listEvents } from "@/lib/events";
import { isCloudinaryConfigured } from "@/lib/media";
import { computeRemoteImageSha256 } from "@/lib/hash";
import { earlierAssetsFor, pixelUrl } from "@/lib/grounding";
import { verifyRepair, type RepairCheck } from "@/lib/measure-node";
import type { BBox } from "@/lib/pixel";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), assignee: z.string().trim().max(80).default(""), note: z.string().trim().max(500).default(""), due: z.string().max(10).nullable().optional() }),
  z.object({ action: z.literal("status"), status: z.enum(["open", "in_progress", "done"]) }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("sign") }),
  z.object({ action: z.literal("photo"), public_id: z.string().min(1).max(300) }),
]);

const OWNER_ONLY = new Set(["create", "status", "cancel"]);

/**
 * POST /api/observations/:id/workorder — the repair loop for one finding.
 *   create / status / cancel  (owner)      open a work order, move it along, or withdraw it
 *   sign                      (either)     signature for uploading a repair photo
 *   photo                     (either)     attach the uploaded repair photo; it is checked against
 *                                          the finding photo (same view? change still there?)
 * Every step is an append-only event, so the history is the audit trail.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getAuthenticatedUserOrThrow(req);
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid work order request", details: parsed.error.format() }, { status: 400 });
    const found = await observationWithProperty(user, id);
    if (!found) return forbiddenResponse("You do not have access to this finding.");
    const d = parsed.data;
    if (OWNER_ONLY.has(d.action) && user.role !== "owner") return forbiddenResponse("Only the owner can manage work orders.");

    const current = deriveWorkOrders(await listEvents(found.propertyId, ["workorder"]))[id];
    if (d.action === "create" && current) return NextResponse.json({ error: "A work order already exists for this finding." }, { status: 409 });
    if (d.action !== "create" && !current) return NextResponse.json({ error: "No work order for this finding yet." }, { status: 404 });

    const folder = `properties/${found.propertyId}/repairs/${id}`;
    const actor = { actor_id: user.id, actor_name: user.name, actor_role: user.role };

    if (d.action === "sign") {
      if (!isCloudinaryConfigured()) return NextResponse.json({ error: "Uploads need Cloudinary configured." }, { status: 503 });
      const timestamp = Math.round(Date.now() / 1000);
      const tags = "rentalmove,repair";
      // No notification_url: a repair photo must not be registered as an inspection photo.
      const signature = cloudinary.utils.api_sign_request({ folder, tags, timestamp }, process.env.CLOUDINARY_API_SECRET!);
      return NextResponse.json({ signature, timestamp, apiKey: process.env.CLOUDINARY_API_KEY, cloudName: process.env.CLOUDINARY_CLOUD_NAME, folder, tags });
    }

    if (d.action === "photo") {
      if (!d.public_id.startsWith(`${folder}/`)) return NextResponse.json({ error: "Photo was not uploaded for this work order." }, { status: 400 });
      const cloud = process.env.CLOUDINARY_CLOUD_NAME;
      const secure_url = `https://res.cloudinary.com/${cloud}/image/upload/${d.public_id}`;
      const sha256 = await computeRemoteImageSha256(secure_url).catch(() => null);
      if (!sha256) return NextResponse.json({ error: "Could not read the uploaded photo." }, { status: 400 });
      let check: RepairCheck | null = null;
      try {
        const { baseline } = await earlierAssetsFor(found.asset);
        if (baseline) {
          const src = (a: typeof baseline) => pixelUrl(a.cloudinary_public_id || a.secure_url);
          check = await verifyRepair(src(baseline), src(found.asset), pixelUrl(d.public_id), found.observation.bbox as BBox);
        }
      } catch (err) {
        console.warn("[WorkOrder] Repair check skipped:", err);
      }
      const event = await appendEvent({ property_id: found.propertyId, type: "workorder", resource_id: id, ...actor, payload: { action: "photo", public_id: d.public_id, secure_url, sha256, check } });
      return NextResponse.json({ ok: true, event, check });
    }

    const payload =
      d.action === "create" ? { action: "create", assignee: d.assignee, note: d.note, due: d.due ?? null } :
      d.action === "status" ? { action: "status", status: d.status } :
      { action: "cancel" };
    const event = await appendEvent({ property_id: found.propertyId, type: "workorder", resource_id: id, ...actor, payload });
    return NextResponse.json({ ok: true, event });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    return NextResponse.json({ error: "Work order failed", message: err?.message || String(err) }, { status: 500 });
  }
}
