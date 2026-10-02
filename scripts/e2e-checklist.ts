/**
 * e2e-checklist.ts — the room checklist and visit submission, end to end against a running server.
 *
 *   npx tsx --env-file=.env scripts/e2e-checklist.ts [baseUrl=http://localhost:3000]
 *
 * Creates a throwaway property (owned by the demo owner) with two rooms and an open visit, puts
 * photo records straight into the database (no Cloudinary upload, no AI call, so it costs nothing),
 * then drives the real API: filing photos under items, skipping with a reason, the submit gate,
 * the lock after submit, and the snapshot the app renders from. Deletes the property at the end
 * (events go with it).
 */

import { createClient } from "@supabase/supabase-js";
import { getDatabase } from "../src/lib/db";
import { deriveRemovals, listEvents } from "../src/lib/events";

const BASE = process.argv[2] || "http://localhost:3000";
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`); };

async function login(email: string) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password: "DemoPassword123!" });
  if (error) throw error;
  return { headers: { Authorization: `Bearer ${data.session.access_token}` } as Record<string, string>, id: data.user.id };
}
async function call(h: Record<string, string>, method: string, path: string, body?: unknown) {
  const r = await fetch(BASE + path, { method, headers: { ...h, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
}

async function main() {
  const db = getDatabase();
  const owner = await login("sarah.owner@rentalmove.demo");
  const tenant = await login("alex.tenant@rentalmove.demo");
  const prop = await db.createProperty({ address_label: "E2E checklist sandbox", unit_label: "-", owner_id: owner.id, rooms: [{ name: "Kitchen", category: "kitchen" }, { name: "Bedroom", category: "bedroom" }] });
  try {
    const rooms = await db.getRooms(prop.id);
    const kitchen = rooms.find((r) => r.category === "kitchen")!, bedroom = rooms.find((r) => r.category === "bedroom")!;
    const insp = await db.createInspection({ property_id: prop.id, type: "inspection", captured_at: new Date().toISOString(), status: "in_progress", captured_by: "Sarah", created_by: owner.id } as any);
    const mk = (room: { id: string }, n: string) => db.upsertAsset({ inspection_id: insp.id, room_id: room.id, cloudinary_public_id: `e2e-checklist/${prop.id}/${n}`, secure_url: `https://example.com/${n}.jpg`, width: 800, height: 600, bytes: 1000, sha256: n.padEnd(64, "0").slice(0, 64), captured_at: new Date().toISOString(), analysis_status: "done" } as any);
    const k1 = await mk(kitchen, "k1"), k2 = await mk(kitchen, "k2"), b1 = await mk(bedroom, "b1");
    const url = `/api/inspections/${insp.id}/coverage`;
    const snap = async () => (await call(owner.headers, "GET", `/api/properties/${prop.id}/snapshot`)).body;

    // Access and validation
    check("no login is refused (401)", (await call({}, "POST", url, { action: "submit" })).status === 401);
    check("someone with no access to the visit is refused (403)", (await call(tenant.headers, "POST", url, { action: "submit" })).status === 403);
    check("an unknown action is refused (400)", (await call(owner.headers, "POST", url, { action: "explode" })).status === 400);

    // Removing a photo from a draft visit (before anything is submitted)
    const k0 = await mk(kitchen, "k0");
    check("removing a photo needs a login (401)", (await call({}, "DELETE", `/api/assets/${k0.id}`)).status === 401);
    check("…and access to the visit (403)", (await call(tenant.headers, "DELETE", `/api/assets/${k0.id}`)).status === 403);
    const delK0 = await call(owner.headers, "DELETE", `/api/assets/${k0.id}`);
    check("a photo can be removed while the visit is a draft", delK0.status === 200 && (await db.getAssetById(k0.id)) === null);
    const rmEvents = deriveRemovals(await listEvents(prop.id, ["removal"]));
    check("the removal is recorded (who, when, fingerprint) without keeping the image", rmEvents.length === 1 && rmEvents[0].asset_id === k0.id && rmEvents[0].sha256 === k0.sha256 && rmEvents[0].by === "Sarah Jenkins" && !JSON.stringify(rmEvents).includes("example.com"), JSON.stringify(rmEvents[0] ?? {}).slice(0, 110));
    check("removing it again is refused (403: it no longer exists for this user)", (await call(owner.headers, "DELETE", `/api/assets/${k0.id}`)).status === 403);
    const kr = await mk(kitchen, "kr");
    await db.createObservation({ asset_id: kr.id, category: "mark", sub_area: "door", description: "test finding", confidence: 0.8, bbox: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } as any, review_status: "accepted", source: "ai" } as any);
    check("a photo with a finding that was already reviewed is kept (409)", (await call(owner.headers, "DELETE", `/api/assets/${kr.id}`)).status === 409 && (await db.getAssetById(kr.id)) !== null);
    await db.deleteAsset?.(kr.id);
    const sn = await snap();
    check("the snapshot no longer lists the removed photo", !(sn.assets ?? []).some((a: any) => a.id === k0.id));

    // Filing photos under items
    check("a photo can be filed under a kitchen item", (await call(owner.headers, "POST", url, { action: "assign", asset_id: k1.id, item: "sink" })).status === 200);
    check("an item that is not on the room's checklist is refused (400)", (await call(owner.headers, "POST", url, { action: "assign", asset_id: k2.id, item: "shower_or_bath" })).status === 400);
    check("a photo from another visit is refused (404)", (await call(owner.headers, "POST", url, { action: "assign", asset_id: "asset-nope", item: "sink" })).status === 404);
    let s = await snap();
    check("the snapshot carries the filing", s.coverage_slots?.[k1.id] === "sink", JSON.stringify(s.coverage_slots));

    // The submit gate
    const early = await call(owner.headers, "POST", url, { action: "submit" });
    check("submit is refused while rooms are incomplete (409)", early.status === 409 && /Kitchen/.test(early.body?.error ?? "") && /Bedroom/.test(early.body?.error ?? ""), early.body?.error?.slice(0, 110));
    check("the refusal names what is still missing", /cabinets/.test(early.body?.error ?? "") && /walls/.test(early.body?.error ?? ""));

    // Skipping needs a reason
    check("skipping without a reason is refused (400)", (await call(owner.headers, "POST", url, { action: "skip", room_id: kitchen.id, item: "cabinets", kind: "skip", reason: "  " })).status === 400);
    check("skipping with a reason is accepted (markup is stripped)", (await call(owner.headers, "POST", url, { action: "skip", room_id: kitchen.id, item: "cabinets", kind: "skip", reason: "locked <b>cupboard</b>" })).status === 200);
    s = await snap();
    const sk = s.coverage_skips?.[`${kitchen.id}|${insp.id}|cabinets`];
    check("the reason is stored, cleaned, with who said it", sk?.kind === "skip" && !/[<>]/.test(sk.reason) && !!sk.by, JSON.stringify(sk));
    check("an item can be marked not applicable without a reason", (await call(owner.headers, "POST", url, { action: "skip", room_id: kitchen.id, item: "hob_oven", kind: "na" })).status === 200);
    check("a skip can be undone", (await call(owner.headers, "POST", url, { action: "unskip", room_id: kitchen.id, item: "hob_oven" })).status === 200 && !(await snap()).coverage_skips?.[`${kitchen.id}|${insp.id}|hob_oven`]);
    check("a skip is still refused for the wrong room's item (400)", (await call(owner.headers, "POST", url, { action: "skip", room_id: bedroom.id, item: "sink", kind: "na" })).status === 400);

    // Fill everything else. Bedroom: one photo covers several items only if the person files it that way — here one is filed, rest explained.
    for (const [room, item] of [[kitchen, "hob_oven"], [kitchen, "worktop"], [kitchen, "floor"], [kitchen, "ceiling"]] as const) {
      await call(owner.headers, "POST", url, { action: "skip", room_id: room.id, item, kind: "skip", reason: "not reachable today" });
    }
    const stillBedroom = await call(owner.headers, "POST", url, { action: "submit" });
    check("a half-done bedroom still blocks submit (409)", stillBedroom.status === 409 && /Bedroom/.test(stillBedroom.body?.error ?? "") && !/Kitchen/.test(stillBedroom.body?.error ?? ""), stillBedroom.body?.error?.slice(0, 100));
    await call(owner.headers, "POST", url, { action: "assign", asset_id: b1.id, item: "walls" });
    for (const item of ["floor", "window_frame", "door", "ceiling"]) await call(owner.headers, "POST", url, { action: "skip", room_id: bedroom.id, item, kind: "na" });

    // Submit and lock
    const ok = await call(owner.headers, "POST", url, { action: "submit" });
    check("submit succeeds once every item is photographed or explained", ok.status === 200 && !!ok.body?.submitted?.at, ok.body?.error);
    check("submitting twice is harmless", (await call(owner.headers, "POST", url, { action: "submit" })).body?.already === true);
    check("the checklist is locked after submit (409)", (await call(owner.headers, "POST", url, { action: "skip", room_id: bedroom.id, item: "walls", kind: "na" })).status === 409 && (await call(owner.headers, "POST", url, { action: "assign", asset_id: k2.id, item: "floor" })).status === 409);
    s = await snap();
    check("the snapshot says the visit is submitted", !!s.submitted?.[insp.id]?.at);
    const reg = await call(owner.headers, "POST", "/api/assets/register", { property_id: prop.id, inspection_id: insp.id, room_id: kitchen.id, cloudinary_public_id: "e2e/x", secure_url: "https://example.com/x.jpg" });
    check("a new photo cannot be added to a submitted visit (409)", reg.status === 409, reg.body?.error?.slice(0, 60));
    check("a photo of a submitted visit cannot be removed (409)", (await call(owner.headers, "DELETE", `/api/assets/${k2.id}`)).status === 409 && (await db.getAssetById(k2.id)) !== null);

    // ---- Submission receipt: seal, tamper check, reopen ----
    const sealed = ok.body.submitted;
    check("the submit response carries a SHA-256 seal, photo and skip counts", /^[a-f0-9]{64}$/.test(sealed.hash ?? "") && sealed.photos === 3 && sealed.skipped >= 8, `${sealed.photos} photos, ${sealed.skipped} skipped`);
    const subUrl = `/api/inspections/${insp.id}/submission`;
    check("the submission view needs a login (401)", (await call({}, "GET", subUrl)).status === 401);
    check("and access to the visit (403)", (await call(tenant.headers, "GET", subUrl)).status === 403);
    let sub = (await call(owner.headers, "GET", subUrl)).body;
    check("the submission view says it matches what was sealed", sub.intact === true && sub.submitted?.hash === sealed.hash && sub.hash === sealed.hash);
    // Independent recomputation of the seal from the returned facts (the recipe printed in the downloadable record).
    const crypto = await import("crypto");
    const canonical = JSON.stringify({
      v: 1, visit: insp.id,
      rooms: [...sub.rooms].sort((x: any, y: any) => x.id.localeCompare(y.id)).map((r: any) => ({
        id: r.id, name: r.name,
        photos: r.photos.map((q: any) => [q.sha256, q.slot ?? ""]).sort((x: string[], y: string[]) => (x[0] + x[1]).localeCompare(y[0] + y[1])),
        skips: r.items.filter((i: any) => i.status === "skipped" || i.status === "na").map((i: any) => [i.key, i.status, i.reason ?? ""]).sort((x: string[], y: string[]) => x[0].localeCompare(y[0])),
      })),
    });
    check("the seal equals an independent recomputation of the recipe", crypto.createHash("sha256").update(canonical).digest("hex") === sealed.hash);
    check("the view lists every photo with its original-file fingerprint", sub.rooms.flatMap((r: any) => r.photos).length === 3 && sub.rooms.flatMap((r: any) => r.photos).every((q: any) => String(q.sha256).length === 64));

    // Tampering: a photo added behind the app's back (straight into the database) breaks the match.
    await mk(kitchen, "k3");
    sub = (await call(owner.headers, "GET", subUrl)).body;
    check("a photo added after submission is detected (no longer matches)", sub.intact === false && sub.hash !== sealed.hash);

    // Reopen
    check("asking to reopen needs a note (400)", (await call(owner.headers, "POST", url, { action: "request_reopen", note: " " })).status === 400);
    check("the submitter can ask to reopen", (await call(owner.headers, "POST", url, { action: "request_reopen", note: "forgot the hob <i>photo</i>" })).status === 200);
    check("the request shows on the submission, markup stripped", /forgot the hob/.test((await snap()).submitted?.[insp.id]?.reopen_request?.note ?? "") && !/[<>]/.test((await snap()).submitted?.[insp.id]?.reopen_request?.note ?? ""));
    check("reopening is owner-only (a tenant is refused, 403)", (await call(tenant.headers, "POST", url, { action: "reopen" })).status === 403);
    const reopened = await call(owner.headers, "POST", url, { action: "reopen" });
    check("the owner can reopen a submitted visit", reopened.status === 200 && !(await snap()).submitted?.[insp.id]);
    check("reopening an unsubmitted visit is refused (409)", (await call(owner.headers, "POST", url, { action: "reopen" })).status === 409);
    check("after reopening the checklist can be edited again", (await call(owner.headers, "POST", url, { action: "assign", asset_id: k2.id, item: "floor" })).status === 200);
    const k3b = (await db.getAssets(insp.id)).find((a) => a.cloudinary_public_id.endsWith("/k3"))!;
    check("after the owner reopens the visit, a photo can be removed again", (await call(owner.headers, "DELETE", `/api/assets/${k3b.id}`)).status === 200);
    const again = await call(owner.headers, "POST", url, { action: "submit" });
    check("resubmitting makes a NEW seal that matches the visit as it now is", again.status === 200 && again.body.submitted.hash !== sealed.hash && (await call(owner.headers, "GET", subUrl)).body.intact === true && again.body.submitted.photos === 3, `${again.body?.submitted?.photos} photos`);
  } finally {
    await db.deleteProperty?.(prop.id);
    check("the sandbox property is deleted", (await db.getProperty(prop.id)) === null);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
