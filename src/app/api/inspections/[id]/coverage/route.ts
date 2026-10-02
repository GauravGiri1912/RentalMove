import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserOrThrow, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";
import { propertyForInspection } from "@/lib/access";
import { getDatabase } from "@/lib/db";
import { appendEvent } from "@/lib/events";
import { rateLimit } from "@/lib/rate-limit";
import { CHECKLIST, itemKey } from "@/lib/coverage";
import { cleanText } from "@/lib/kit";
import { visitProgress, visitSubmission } from "@/lib/coverage-node";
import { can } from "@/lib/permissions";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assign"), asset_id: z.string().min(1), item: z.string().min(1).nullable() }),
  z.object({ action: z.literal("skip"), room_id: z.string().min(1), item: z.string().min(1), kind: z.enum(["skip", "na"]), reason: z.string().optional() }),
  z.object({ action: z.literal("unskip"), room_id: z.string().min(1), item: z.string().min(1) }),
  z.object({ action: z.literal("submit") }),
  z.object({ action: z.literal("request_reopen"), note: z.string().optional() }),
  z.object({ action: z.literal("reopen") }),
]);

/**
 * POST /api/inspections/:id/coverage
 *   assign   file a photo under a checklist item ("this is the sink")
 *   skip     say an item will not be photographed (a reason is required unless it is not applicable)
 *   unskip   take that back
 *   submit   say the visit is finished — refused while any room still has an item with neither a photo nor a reason;
 *            the visit is sealed (SHA-256 of its photos, filing and skips) at that moment
 *   request_reopen  whoever submitted asks the owner to reopen it (with a note)
 *   reopen   owner only: reopens a submitted visit; it must be submitted again, which makes a new seal
 * After a visit is submitted its coverage can no longer be changed.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = await rateLimit(req, { limit: 120, windowMs: 60_000, prefix: "coverage" });
  if (!rl.success) return rl.response;
  try {
    const { id } = await params;
    const user = await getAuthenticatedUserOrThrow(req);
    if (!can(user, "capture:use")) return forbiddenResponse("You cannot capture photos for this visit.");
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const propertyId = await propertyForInspection(user, id);
    if (!propertyId) return forbiddenResponse("You do not have access to this visit.");
    const db = getDatabase();
    const base = { property_id: propertyId, actor_id: user.id, actor_name: user.name, actor_role: user.role };
    const body = parsed.data;

    const before = await visitProgress(propertyId, id);

    if (body.action === "request_reopen" || body.action === "reopen") {
      if (!before.submitted) return NextResponse.json({ error: "This visit is not submitted, so there is nothing to reopen." }, { status: 409 });
      if (body.action === "reopen") {
        if (!can(user, "finding:triage")) return forbiddenResponse("Only the owner can reopen a submitted visit.");
        const event = await appendEvent({ ...base, type: "coverage", resource_id: null, payload: { action: "reopen", inspection_id: id, sealed_hash: before.submitted.hash } });
        return NextResponse.json({ ok: true, event });
      }
      const note = cleanText(body.note ?? "", 300);
      if (note.length < 3) return NextResponse.json({ error: "Please say briefly what needs to change." }, { status: 400 });
      const event = await appendEvent({ ...base, type: "coverage", resource_id: null, payload: { action: "reopen_request", inspection_id: id, note } });
      return NextResponse.json({ ok: true, event });
    }

    if (before.submitted) {
      if (body.action === "submit") return NextResponse.json({ ok: true, already: true, submitted: before.submitted });
      return NextResponse.json({ error: "This visit was already submitted, so its checklist can no longer be changed." }, { status: 409 });
    }

    if (body.action === "submit") {
      if (!before.complete) {
        const open = before.rows.filter((r) => !r.resolved).map((r) => r.coverage ? `${r.name}: ${r.coverage.items.filter((i) => !i.covered && !i.resolved).map((i) => i.label.toLowerCase()).join(", ")}` : `${r.name}: no photo`);
        return NextResponse.json({ error: `Not every room is covered yet. ${open.join(" · ")}`, open }, { status: 409 });
      }
      const sub = await visitSubmission(propertyId, id);
      const photos = sub.rooms.reduce((n, r) => n + r.photos.length, 0);
      const skippedItems = sub.rooms.reduce((n, r) => n + r.items.filter((i) => i.status === "skipped" || i.status === "na").length, 0);
      const event = await appendEvent({ ...base, type: "coverage", resource_id: null, payload: { action: "submit", inspection_id: id, hash: sub.hash, photos, skipped: skippedItems } });
      return NextResponse.json({ ok: true, submitted: { at: event.created_at, by: user.name, hash: sub.hash, photos, skipped: skippedItems } });
    }

    if (body.action === "assign") {
      const asset = await db.getAssetById(body.asset_id);
      if (!asset || asset.inspection_id !== id) return NextResponse.json({ error: "That photo is not part of this visit." }, { status: 404 });
      if (body.item) {
        const room = (await db.getRooms(propertyId)).find((r) => r.id === asset.room_id);
        if (!room || !(CHECKLIST[room.category] ?? []).some((i) => itemKey(i.label) === body.item)) return NextResponse.json({ error: "That item is not on this room's checklist." }, { status: 400 });
      }
      const event = await appendEvent({ ...base, type: "coverage", resource_id: asset.id, payload: { action: "slot", item: body.item } });
      return NextResponse.json({ ok: true, event });
    }

    const room = (await db.getRooms(propertyId)).find((r) => r.id === body.room_id);
    if (!room || !(CHECKLIST[room.category] ?? []).some((i) => itemKey(i.label) === body.item)) return NextResponse.json({ error: "That item is not on this room's checklist." }, { status: 400 });
    if (body.action === "unskip") {
      const event = await appendEvent({ ...base, type: "coverage", resource_id: room.id, payload: { action: "unskip", inspection_id: id, item: body.item } });
      return NextResponse.json({ ok: true, event });
    }
    const reason = cleanText(body.reason ?? "", 200);
    if (body.kind === "skip" && reason.length < 3) return NextResponse.json({ error: "Please say briefly why this will not be photographed." }, { status: 400 });
    const event = await appendEvent({ ...base, type: "coverage", resource_id: room.id, payload: { action: "skip", inspection_id: id, item: body.item, kind: body.kind, reason: body.kind === "na" ? reason || "Not applicable" : reason } });
    return NextResponse.json({ ok: true, event });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    return NextResponse.json({ error: "Could not update the checklist", message: err?.message || String(err) }, { status: 500 });
  }
}
