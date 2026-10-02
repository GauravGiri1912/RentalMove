/**
 * e2e-kit.ts — the free move-in kit, end to end, against a running server.
 *
 *   npx tsx --env-file=.env scripts/e2e-kit.ts [baseUrl=http://localhost:3000]
 *
 * Starts a kit with NO login, uploads real photos straight to Cloudinary (signed, like the
 * phone does), checks the rules (read-only link, one photo per shot, sealing, sealed = frozen),
 * recomputes the seal hash independently, opens the report as a reader, runs the public Verify
 * check, then DELETES the kit and confirms the photos and records are gone. Leaves nothing behind.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { v2 as cloudinary } from "cloudinary";
import { sealHash } from "../src/lib/kit-crypto";
import { getDatabase } from "../src/lib/db";
import { ensureCloudinaryConfig } from "../src/lib/media";

const BASE = process.argv[2] || "http://localhost:3000";
const IMG = (p: string) => fs.readFileSync(path.join(process.cwd(), "seed/images", p));
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`); };
const sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");

async function call(method: string, p: string, body?: unknown) {
  const r = await fetch(BASE + p, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) as any };
}

/** Signed upload exactly as the phone does it. */
async function upload(token: string, roomId: string, buf: Buffer) {
  const sig = (await call("POST", `/api/kit/${token}/sign`, { room_id: roomId })).body;
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)], { type: "image/jpeg" }), "photo.jpg");
  for (const k of ["apiKey", "timestamp", "signature", "folder", "tags"]) form.append(k === "apiKey" ? "api_key" : k, String(sig[k]));
  // Retry brief network drops (this machine's connection to Cloudinary is occasionally flaky).
  let up: any;
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, { method: "POST", body: form, signal: AbortSignal.timeout(60_000) });
      up = await r.json();
      break;
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((res) => setTimeout(res, 2000 * attempt));
    }
  }
  if (!up.public_id) throw new Error(`Cloudinary refused the upload: ${JSON.stringify(up).slice(0, 200)}`);
  return { sig, up };
}
const register = (token: string, roomId: string, shotId: string, up: any, sha256: string) =>
  call("POST", `/api/kit/${token}/photo`, { room_id: roomId, shot_id: shotId, cloudinary_public_id: up.public_id, secure_url: up.secure_url, etag: up.etag, sha256, width: up.width, height: up.height });

async function main() {
  ensureCloudinaryConfig();
  const kitchen = IMG("2024/kitchen/cabinet-base-01.jpg"), bath = IMG("2024/bathroom/shower-tile-01.jpg");
  const kitchen2 = await sharp(kitchen).resize(900).jpeg({ quality: 70 }).toBuffer(); // different bytes
  const kitchen3 = await sharp(kitchen).resize(700).jpeg({ quality: 60 }).toBuffer(); // a third, for the retake

  // 1. Start a kit with no login.
  check("kit start refuses a missing name (400)", (await call("POST", "/api/kit", { name: "", rooms: { kitchen: 1 } })).status === 400);
  check("kit start refuses no rooms (400)", (await call("POST", "/api/kit", { name: "E2E Tester", rooms: {} })).status === 400);
  const made = await call("POST", "/api/kit", { name: "E2E Tester", address: "1 Test Lane <b>", rooms: { kitchen: 1, bathroom: 1 } });
  check("kit starts without an account", made.status === 201 && !!made.body.token, made.body?.path?.slice(0, 18));
  check("a new kit is private: no read-only link is handed out at creation", made.body.read_token === undefined && made.body.report_path === undefined);
  const { token } = made.body;
  let readTok = "";
  let deleted = false;
  try {
    // 2. State and links.
    const st = await call("GET", `/api/kit/${token}`);
    check("capture state: 2 rooms with shot lists", st.status === 200 && st.body.rooms.length === 2 && st.body.rooms[0].shots[0].id === "wide", `${st.body?.progress?.total} shots`);
    check("address was cleaned of markup", !/[<>]/.test(st.body.address), st.body.address);
    check("tampered link is refused (401)", (await call("GET", `/api/kit/${token.slice(0, -3)}AAA`)).status === 401);
    check("the tenant's report is private by default: sharing off, no link", (await call("GET", `/api/kit/${token}/report`)).body.sharing === false && (await call("GET", `/api/kit/${token}/report`)).body.read_token === null);
    check("sharing cannot be turned on before sealing (409)", (await call("POST", `/api/kit/${token}/share`, { on: true })).status === 409);
    const kRoom = st.body.rooms[0], bRoom = st.body.rooms[1];
    const pid = (await getDatabase().getRoomById(kRoom.id))!.property_id;

    // 3. Photos, straight to Cloudinary.
    const a = await upload(token, kRoom.id, kitchen);
    check("upload signature has no webhook (kit photos are not sent to the AI)", !a.sig.notificationUrl && a.sig.folder.startsWith(`properties/`) && a.sig.folder.endsWith("/kitchen"), a.sig.folder.split("/").slice(-1)[0]);
    const r1 = await register(token, kRoom.id, "wide", a.up, sha(kitchen));
    check("photo saved; server fingerprint matches the phone's", r1.status === 201 && r1.body.sha256 === sha(kitchen) && r1.body.match === true, r1.body?.sha256?.slice(0, 12));
    const b = await upload(token, kRoom.id, kitchen);
    const dup = await register(token, kRoom.id, "sink", b.up, sha(kitchen));
    check("the same photo cannot fill a second shot (409)", dup.status === 409, dup.body?.error?.slice(0, 40));
    check("a shot from another room type is refused (400)", (await register(token, kRoom.id, "shower-or-bath", b.up, sha(kitchen))).status === 400);
    check("a photo from outside this kit is refused (403)", (await register(token, kRoom.id, "sink", { ...b.up, public_id: "properties/prop-381/x/y/z" }, sha(kitchen))).status === 403);
    check("a bad fingerprint format is refused (400)", (await register(token, kRoom.id, "sink", b.up, "xyz")).status === 400);
    const c = await upload(token, kRoom.id, kitchen2);
    const r2 = await register(token, kRoom.id, "sink", c.up, sha(kitchen2));
    check("a different photo fills the next shot", r2.status === 201);
    const skip = await call("POST", `/api/kit/${token}/skip`, { room_id: kRoom.id, shot_id: "ceiling" });
    check("a shot can be skipped", skip.status === 200 && (await call("GET", `/api/kit/${token}`)).body.rooms[0].shots.find((s: any) => s.id === "ceiling").status === "skipped");

    // 3b. Remove and retake, before sealing. A removed or replaced photo is deleted for good.
    const insId = (await getDatabase().getInspections(pid))[0].id;
    const goneFromCloudinary = (publicId: string) => cloudinary.api.resource(publicId).then(() => false).catch((e: any) => (e?.error?.http_code ?? e?.http_code) === 404);
    const stored = async (publicId: string) => (await getDatabase().getAssets(insId)).some((a) => a.cloudinary_public_id === publicId);
    check("a forged link cannot remove a photo (401)", (await call("POST", `/api/kit/${token.slice(0, -3)}AAA/remove`, { room_id: kRoom.id, shot_id: "sink" })).status === 401);
    check("an item that is not on the list is refused (400)", (await call("POST", `/api/kit/${token}/remove`, { room_id: kRoom.id, shot_id: "nonsense" })).status === 400);
    check("removing a photo that is not there is refused (404)", (await call("POST", `/api/kit/${token}/remove`, { room_id: kRoom.id, shot_id: "floor" })).status === 404);
    const rem = await call("POST", `/api/kit/${token}/remove`, { room_id: kRoom.id, shot_id: "sink" });
    check("a photo can be removed before sealing; the item goes back to not photographed", rem.status === 200 && (await call("GET", `/api/kit/${token}`)).body.rooms[0].shots.find((x: any) => x.id === "sink").status === "todo");
    check("…its record and its file in Cloudinary are deleted", !(await stored(c.up.public_id)) && (await goneFromCloudinary(c.up.public_id)));
    const c2 = await upload(token, kRoom.id, kitchen2);
    check("the same photo can be taken again after removal (no duplicate error)", (await register(token, kRoom.id, "sink", c2.up, sha(kitchen2))).status === 201);
    const c3 = await upload(token, kRoom.id, kitchen3);
    const retake = await register(token, kRoom.id, "sink", c3.up, sha(kitchen3));
    check("a retake replaces the photo", retake.status === 201 && retake.body.sha256 === sha(kitchen3));
    check("…and the earlier photo of that item is deleted, not left behind", !(await stored(c2.up.public_id)) && (await goneFromCloudinary(c2.up.public_id)) && (await stored(c3.up.public_id)));

    // 4. Seal rules.
    const early = await call("POST", `/api/kit/${token}/seal`);
    check("sealing needs a photo in every room (400)", early.status === 400 && /Bathroom/.test(early.body?.error ?? ""), early.body?.error);
    const d = await upload(token, bRoom.id, bath);
    check("bathroom photo saved", (await register(token, bRoom.id, "wide", d.up, sha(bath))).status === 201);
    const sealed = await call("POST", `/api/kit/${token}/seal`);
    const expected = sealHash({
      kit: pid,
      name: "E2E Tester", address: st.body.address,
      rooms: [{ id: kRoom.id, name: kRoom.name, shots: [{ shot: "wide", sha256: sha(kitchen) }, { shot: "sink", sha256: sha(kitchen3) }] }, { id: bRoom.id, name: bRoom.name, shots: [{ shot: "wide", sha256: sha(bath) }] }],
    });
    check("record sealed", sealed.status === 200 && /^[a-f0-9]{64}$/.test(sealed.body.sealed.hash) && sealed.body.sealed.photos === 3, `${sealed.body?.sealed?.photos} photos, ${sealed.body?.sealed?.missing} not photographed`);
    check("seal hash equals an independent recomputation from the original files", sealed.body.sealed.hash === expected);
    check("sealing twice returns the same record", (await call("POST", `/api/kit/${token}/seal`)).body.sealed.hash === sealed.body.sealed.hash);
    check("a sealed kit refuses new uploads (409)", (await call("POST", `/api/kit/${token}/sign`, { room_id: kRoom.id })).status === 409);
    check("a sealed kit refuses removing a photo (409)", (await call("POST", `/api/kit/${token}/remove`, { room_id: kRoom.id, shot_id: "sink" })).status === 409);
    check("…and new photos (409)", (await register(token, kRoom.id, "floor", c.up, sha(kitchen2))).status === 409);

    // 5. Private until shared, then the report as the tenant and as a reader.
    let mine = await call("GET", `/api/kit/${token}/report`);
    check("sealed but still private: no link, sharing off", mine.status === 200 && mine.body.intact === true && mine.body.sharing === false && mine.body.read_token === null);
    const verBefore = await call("POST", "/api/verify", { sha256: sha(kitchen3) });
    check("the public Verify page does NOT recognise an unshared kit's photo", verBefore.body?.match === false, JSON.stringify(verBefore.body));
    const forged = await call("GET", `/api/kit/${token.replace(/\.[^.]+$/, ".AAAA")}/report`);
    check("a forged link is refused (401)", forged.status === 401);
    check("sharing needs the tenant's own link (a reader link cannot turn it on)", (await call("POST", `/api/kit/${token.slice(0, -2)}xx/share`, { on: true })).status === 401);
    const on = await call("POST", `/api/kit/${token}/share`, { on: true });
    readTok = on.body.read_token;
    check("the creator turns sharing on and gets a read-only link", on.status === 200 && on.body.sharing === true && !!readTok && readTok !== token);
    const rd = await call("GET", `/api/kit/${readTok}`);
    check("read-only link can read…", rd.status === 200 && rd.body.scope === "r");
    check("…but cannot get an upload signature (403)", (await call("POST", `/api/kit/${readTok}/sign`, { room_id: kRoom.id })).status === 403);
    check("…cannot delete (403)", (await call("DELETE", `/api/kit/${readTok}`)).status === 403);
    check("…and cannot change sharing (403)", (await call("POST", `/api/kit/${readTok}/share`, { on: false })).status === 403);
    mine = await call("GET", `/api/kit/${token}/report`);
    check("report: with sharing on, the tenant gets the read-only link", mine.body.sharing === true && !!mine.body.read_token && mine.body.read_token !== token);
    const verAfter = await call("POST", "/api/verify", { sha256: sha(kitchen3) });
    check("once shared, the Verify page recognises the photo, without the address", verAfter.body?.match === true && verAfter.body.room === "Kitchen" && !JSON.stringify(verAfter.body).includes("Test Lane"), `${verAfter.body?.room} · ${verAfter.body?.inspection_type}`);
    const theirs = await call("GET", `/api/kit/${readTok}/report`);
    check("a reader sees the report but gets no links", theirs.status === 200 && theirs.body.scope === "r" && theirs.body.read_token === null && theirs.body.intact === true);
    const photos = theirs.body.rooms.flatMap((r: any) => r.photos);
    check("report lists every shot, with not-photographed ones marked", photos.some((p: any) => p.status === "done") && photos.some((p: any) => p.status === "skipped") && photos.some((p: any) => p.status === "missing"), `${theirs.body.counts.photos} photos, ${theirs.body.counts.missing} missing`);
    check("every photo's fingerprint was verified on the server", photos.filter((p: any) => p.status === "done").every((p: any) => p.verified === true));
    const img = await fetch(photos.find((p: any) => p.status === "done").url);
    check("report images render from Cloudinary (faces pixelated rendition)", img.ok && (img.headers.get("content-type") ?? "").startsWith("image/"), `${img.status} ${img.headers.get("content-type")}`);

    // 5b. Confirmation and link replacement.
    check("a reader cannot confirm without a name (400)", (await call("POST", `/api/kit/${readTok}/confirm`, { name: "" })).status === 400);
    check("the tenant cannot confirm their own record (403)", (await call("POST", `/api/kit/${token}/confirm`, { name: "Self" })).status === 403);
    const ack = await call("POST", `/api/kit/${readTok}/confirm`, { name: "Landlord <b>Rao</b>" });
    check("a reader confirms they have seen the sealed record", ack.status === 200 && ack.body.acks.length === 1 && !/[<>]/.test(ack.body.acks[0].name) && ack.body.acks[0].hash === sealed.body.sealed.hash, ack.body?.acks?.[0]?.name);
    check("confirming twice by name adds nothing", (await call("POST", `/api/kit/${readTok}/confirm`, { name: ack.body.acks[0].name.toUpperCase() })).body.acks.length === 1);
    check("the tenant sees who confirmed", (await call("GET", `/api/kit/${token}/report`)).body.acks.length === 1);
    check("a read link cannot make a new link (403)", (await call("POST", `/api/kit/${readTok}/relink`)).status === 403);
    const re = await call("POST", `/api/kit/${token}/relink`);
    check("the tenant makes a new share link", re.status === 200 && !!re.body.read_token && re.body.read_token !== readTok);
    check("the old read link stops working (410)", (await call("GET", `/api/kit/${readTok}/report`)).status === 410 && (await call("POST", `/api/kit/${readTok}/confirm`, { name: "Late Person" })).status === 410);
    const fresh = await call("GET", `/api/kit/${re.body.read_token}/report`);
    check("the new read link works and keeps the confirmation", fresh.status === 200 && fresh.body.acks.length === 1);
    const handed = (await call("GET", `/api/kit/${token}/report`)).body.read_token;
    check("the tenant's report now hands out a working new link", !!handed && (await call("GET", `/api/kit/${handed}/report`)).status === 200 && (await call("GET", `/api/kit/${readTok}/report`)).status === 410);

    // 5c. Stop sharing: every link dies; sharing again makes a new one.
    const off = await call("POST", `/api/kit/${token}/share`, { on: false });
    check("the creator stops sharing", off.status === 200 && off.body.sharing === false && off.body.read_token === null);
    check("the previously shared link no longer opens the record (403)", (await call("GET", `/api/kit/${re.body.read_token}/report`)).status === 403);
    check("…and the Verify page forgets the photo again", (await call("POST", "/api/verify", { sha256: sha(kitchen3) })).body?.match === false);
    check("a new link cannot be made while not sharing (409)", (await call("POST", `/api/kit/${token}/relink`)).status === 409);
    const again = await call("POST", `/api/kit/${token}/share`, { on: true });
    check("sharing again hands out a NEW link; the old one stays dead (410)", again.status === 200 && again.body.read_token !== re.body.read_token && (await call("GET", `/api/kit/${again.body.read_token}/report`)).status === 200 && (await call("GET", `/api/kit/${re.body.read_token}/report`)).status === 410);
    readTok = again.body.read_token;

    // 6. Delete.
    check("the kit exists in the database before deletion", !!(await getDatabase().getProperty(pid)) && (await getDatabase().getProperty(pid))!.owner_id == null);
    const del = await call("DELETE", `/api/kit/${token}`);
    deleted = del.status === 200;
    check("the tenant can delete the kit", del.status === 200);
    check("deleted kit is gone for both links (404)", (await call("GET", `/api/kit/${token}`)).status === 404 && (await call("GET", `/api/kit/${readTok}/report`)).status === 404);
    check("its record is gone from the database", (await getDatabase().getProperty(pid)) === null);
    const left = await cloudinary.api.resources({ type: "upload", prefix: `properties/${pid}/`, max_results: 5 }).catch(() => ({ resources: [] as any[] }));
    check("its photos are gone from Cloudinary", left.resources.length === 0, `${left.resources.length} left`);
  } finally {
    if (!deleted) { await call("DELETE", `/api/kit/${token}`); console.log("(cleanup: kit deleted after a failure)"); }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
