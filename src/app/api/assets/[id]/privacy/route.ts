import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { getAuthenticatedUserOrThrow, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";
import { assetWithProperty } from "@/lib/access";
import { appendEvent, derivePrivacy, listEvents } from "@/lib/events";
import { getMediaProvider } from "@/lib/media";
import { rateLimit } from "@/lib/rate-limit";
import { scanForPersonalItems } from "@/lib/privacy-node";

const unit = z.number().min(0).max(1);
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("scan") }),
  z.object({ action: z.literal("add"), bbox: z.tuple([unit, unit, unit, unit]), label: z.string().trim().max(40).default("personal item") }),
  z.object({ action: z.literal("remove"), id: z.string().min(1).max(40) }),
]);

/**
 * POST /api/assets/:id/privacy — areas of a photo to pixelate in every shared copy.
 *   scan    find personal items (Cloudinary OCR when active, else the vision model + pixels)
 *   add     hide an area a person drew
 *   remove  stop hiding an area
 * Either party may hide or un-hide; every change is an event, so the history shows who did it.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = await rateLimit(req, { limit: 20, windowMs: 60_000, prefix: "privacy" });
  if (!rl.success) return rl.response;
  try {
    const { id } = await params;
    const user = await getAuthenticatedUserOrThrow(req);
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid privacy request", details: parsed.error.format() }, { status: 400 });
    const found = await assetWithProperty(user, id);
    if (!found) return forbiddenResponse("You do not have access to this photo.");
    const d = parsed.data;
    const actor = { actor_id: user.id, actor_name: user.name, actor_role: user.role };

    if (d.action === "scan") {
      const a = found.asset;
      const r = await scanForPersonalItems(found.propertyId, { id: a.id, cloudinary_public_id: a.cloudinary_public_id, width: a.width, height: a.height }, getMediaProvider().vlmCopy(a.cloudinary_public_id || a.secure_url), { id: user.id, name: user.name, role: user.role });
      return NextResponse.json({ ok: true, ...r });
    }
    if (d.action === "add") {
      const [x1, y1, x2, y2] = d.bbox;
      if (x2 - x1 < 0.01 || y2 - y1 < 0.01) return NextResponse.json({ error: "Draw a larger area." }, { status: 400 });
      const region = { id: `pr-${crypto.randomBytes(5).toString("hex")}`, bbox: d.bbox, source: "manual", label: d.label };
      const event = await appendEvent({ property_id: found.propertyId, type: "privacy", resource_id: id, ...actor, payload: { action: "add", region } });
      return NextResponse.json({ ok: true, region, event });
    }
    const current = derivePrivacy(await listEvents(found.propertyId, ["privacy"]))[id] ?? [];
    if (!current.some((r) => r.id === d.id)) return NextResponse.json({ error: "No such hidden area on this photo." }, { status: 404 });
    const event = await appendEvent({ property_id: found.propertyId, type: "privacy", resource_id: id, ...actor, payload: { action: "remove", id: d.id } });
    return NextResponse.json({ ok: true, event });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    const quota = /daily token limit|rate limit/i.test(String(err?.message));
    return NextResponse.json({ error: quota ? "Scanning quota reached — try later or draw the area by hand." : "Privacy update failed", message: err?.message || String(err) }, { status: quota ? 429 : 500 });
  }
}
