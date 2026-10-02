/**
 * kit-node.ts — server side of the free move-in kit (see lib/kit.ts for the idea).
 *
 * A kit is stored as an ordinary property + one move-in visit + rooms + photos, owned by nobody
 * (owner_id null) and reachable only through its signed link, so the existing fingerprinting,
 * verification and report machinery keep working. What the kit adds is kept in `kit` events.
 *
 * Move-in photos are NOT sent to the vision model: the shot list already says what each photo
 * shows, and the model's daily quota is better spent on move-out comparisons.
 */

import crypto from "crypto";
import { after } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { getDatabase } from "./db";
import { appendEvent, deriveFingerprints, deriveKit, listEvents, type KitState } from "./events";
import { ensureCloudinaryConfig, isCloudinaryConfigured } from "./media";
import { computeRemoteImageSha256 } from "./hash";
import { fingerprintAsset } from "./fingerprint";
import { named } from "./cloudinary-urls";
import { photoTimeCheck } from "./phototime";
import { MAX_DAMAGE_SHOTS, MAX_KIT_PHOTOS, buildRooms, cleanText, isValidShot, shotLabel, shotListFor, type Shot } from "./kit";
import { sealHash, signKit, verifyKit, type KitClaims } from "./kit-crypto";
import type { Inspection, Room, RoomCategory } from "./schemas";

export class KitError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "KitError";
  }
}

export interface KitContext { claims: KitClaims; kit: KitState; rooms: Room[]; inspection: Inspection }

/** Verifies a kit link and loads the kit. `write` = only the tenant's link is accepted. */
export async function loadKit(token: string, need: "write" | "any" = "any"): Promise<KitContext> {
  const claims = verifyKit(token);
  if (!claims) throw new KitError(401, "This kit link is not valid.");
  if (need === "write" && claims.s !== "w") throw new KitError(403, "This link can only view the report.");
  const db = getDatabase();
  const [events, rooms, inspections] = await Promise.all([listEvents(claims.p, ["kit"]), db.getRooms(claims.p), db.getInspections(claims.p)]);
  const kit = deriveKit(events);
  const inspection = inspections.find((i) => i.id === claims.i);
  if (!kit || !inspection || !rooms.length) throw new KitError(404, "This kit no longer exists.");
  // A replaced read-only link stops working (links made before generations existed count as generation 0).
  if (claims.s === "r" && !kit.sharing) throw new KitError(403, "This record is private: the person who made it has not shared it.");
  if (claims.s === "r" && (claims.g ?? 0) !== kit.readGen) throw new KitError(410, "This link was replaced by the person who shared it. Ask them for the new link.");
  return { claims, kit, rooms, inspection };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createKit(input: { name: string; address: string; counts: Partial<Record<RoomCategory, number>> }) {
  const rooms = buildRooms(input.counts);
  if (!rooms.length) throw new KitError(400, "Pick at least one room.");
  const db = getDatabase();
  const id = `kit-${crypto.randomBytes(6).toString("hex")}`;
  await db.createProperty({ id, address_label: input.address || `${input.name}'s home`, unit_label: "Move-in kit", owner_id: null, rooms });
  try {
    if ((await db.getRooms(id)).length !== rooms.length) throw new Error("The rooms could not be created.");
    const inspection = await db.createInspection({ property_id: id, type: "move_in", captured_at: new Date().toISOString(), created_by: null, status: "in_progress" });
    await appendEvent({ property_id: id, type: "kit", resource_id: null, actor_id: null, actor_name: input.name, actor_role: "tenant", payload: { action: "create", name: input.name, address: input.address } });
    return {
      propertyId: id,
      inspectionId: inspection.id,
      token: signKit({ p: id, i: inspection.id, s: "w" }),
    };
  } catch (err) {
    await db.deleteProperty?.(id).catch(() => {}); // never leave a half-made kit behind
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

const roomOf = (ctx: KitContext, roomId: string) => {
  const room = ctx.rooms.find((r) => r.id === roomId);
  if (!room) throw new KitError(404, "That room is not part of this kit.");
  return room;
};
const assertOpen = (ctx: KitContext) => {
  if (ctx.kit.sealed) throw new KitError(409, "This kit is sealed. Start a new kit to record another home.");
};

/** Deletes a photo for good: its record and its file in Cloudinary. A replaced or removed photo must not linger. */
async function purgeAsset(propertyId: string, assetId: string) {
  const db = getDatabase();
  const a = await db.getAssetById(assetId);
  if (!a) return null;
  await db.deleteAsset?.(assetId);
  if (isCloudinaryConfigured()) { ensureCloudinaryConfig(); await cloudinary.uploader.destroy(a.cloudinary_public_id, { invalidate: true }).catch((e: any) => console.warn("[Kit] Cloudinary:", e?.message ?? e)); }
  return a;
}

/** Upload signature for one room. No notification_url: kit photos are registered below, not by the webhook. */
export function signKitUpload(ctx: KitContext, roomId: string) {
  assertOpen(ctx);
  const room = roomOf(ctx, roomId);
  if (!isCloudinaryConfigured()) throw new KitError(503, "Photo uploads are not configured on this server.");
  ensureCloudinaryConfig();
  const timestamp = Math.round(Date.now() / 1000);
  const folder = `properties/${ctx.claims.p}/${ctx.claims.i}/${room.category}`;
  const tags = `rentalmove,kit,${room.category},move_in`;
  const signature = cloudinary.utils.api_sign_request({ folder, tags, timestamp }, process.env.CLOUDINARY_API_SECRET!);
  return { signature, timestamp, apiKey: process.env.CLOUDINARY_API_KEY, cloudName: process.env.CLOUDINARY_CLOUD_NAME, folder, tags };
}

export interface KitPhotoInput {
  room_id: string;
  shot_id: string;
  cloudinary_public_id: string;
  secure_url: string;
  etag?: string;
  sha256: string;
  width?: number;
  height?: number;
}

export async function registerKitPhoto(ctx: KitContext, b: KitPhotoInput) {
  assertOpen(ctx);
  const room = roomOf(ctx, b.room_id);
  if (!isValidShot(room.category, b.shot_id)) throw new KitError(400, "That is not one of this room's photos.");
  const { p, i } = ctx.claims;
  if (!b.cloudinary_public_id.startsWith(`properties/${p}/${i}/`)) throw new KitError(403, "That upload does not belong to this kit.");
  const db = getDatabase();
  const assets = await db.getAssets(i);
  const known = assets.find((a) => a.cloudinary_public_id === b.cloudinary_public_id);
  if (!known && assets.length >= MAX_KIT_PHOTOS) throw new KitError(409, `A kit can hold up to ${MAX_KIT_PHOTOS} photos.`);

  // The fingerprint was taken on the phone; check it again against what Cloudinary actually stored.
  const serverSha = known?.sha256 ?? (await computeRemoteImageSha256(b.secure_url));
  const sha = serverSha ?? b.sha256;
  const match = !serverSha || serverSha === b.sha256;

  // One file cannot fill two different shots.
  const inUse = new Set(Object.entries(ctx.kit.shots).flatMap(([rid, m]) => Object.entries(m).filter(([sid]) => !(rid === b.room_id && sid === b.shot_id)).map(([, aid]) => aid)));
  if (assets.some((a) => inUse.has(a.id) && a.sha256 === sha && a.cloudinary_public_id !== b.cloudinary_public_id)) {
    throw new KitError(409, "You already used this exact photo for another shot. Take a new one.");
  }

  const asset = known ?? (await db.upsertAsset({
    inspection_id: i, room_id: room.id, cloudinary_public_id: b.cloudinary_public_id, secure_url: b.secure_url, resource_type: "image",
    etag: b.etag, sha256: sha, width: b.width, height: b.height, captured_at: new Date().toISOString(), analysis_status: "done", analysis_error: null,
  }));

  const actor = { actor_id: null, actor_name: ctx.kit.name, actor_role: "tenant" as const };
  // A retake replaces the earlier photo of this shot: that one is deleted, not left behind.
  const replaced = ctx.kit.shots[room.id]?.[b.shot_id];
  await appendEvent({ property_id: p, type: "kit", resource_id: asset.id, ...actor, payload: { action: "shot", room_id: room.id, shot_id: b.shot_id, asset_id: asset.id, sha256: sha, client_sha256: b.sha256, server_verified: !!serverSha, match } });
  await appendEvent({ property_id: p, type: "pipeline", resource_id: asset.id, actor_id: null, actor_name: "RentalMove", actor_role: "system", payload: { stage: "upload", label: "Photo added to the move-in kit", detail: `${room.name} · ${shotLabel(room.category, b.shot_id)} · sha256 ${sha.slice(0, 8)}…${match ? "" : " (differs from the phone's)"}` } }).catch(() => {});
  const areas = shotListFor(room.category).find((s) => s.id === b.shot_id)?.areas ?? [];
  if (areas.length) await appendEvent({ property_id: p, type: "coverage", resource_id: asset.id, actor_id: null, actor_name: "RentalMove", actor_role: "system", payload: { areas } }).catch(() => {});

  // Capture time, camera and re-use check from Cloudinary; best effort, after the response.
  if (replaced && replaced !== asset.id) await purgeAsset(p, replaced).catch(() => {});
  const work = () => { void fingerprintAsset(p, asset.id, b.cloudinary_public_id, sha); };
  try { after(work); } catch { work(); }

  return { asset_id: asset.id, sha256: sha, match, thumb: named(b.cloudinary_public_id, "rm_thumb") };
}

/** Takes a photo out of an unsealed kit (the item goes back to "not photographed yet"). The image is deleted. */
export async function removeKitPhoto(ctx: KitContext, roomId: string, shotId: string) {
  assertOpen(ctx);
  const room = roomOf(ctx, roomId);
  if (!isValidShot(room.category, shotId)) throw new KitError(400, "That is not one of this room's photos.");
  const assetId = ctx.kit.shots[room.id]?.[shotId];
  if (!assetId) throw new KitError(404, "There is no photo for that item.");
  const gone = await purgeAsset(ctx.claims.p, assetId);
  await appendEvent({ property_id: ctx.claims.p, type: "kit", resource_id: assetId, actor_id: null, actor_name: ctx.kit.name, actor_role: "tenant", payload: { action: "unshot", room_id: room.id, shot_id: shotId, asset_id: assetId, sha256: gone?.sha256 ?? null } });
}

export async function skipKitShot(ctx: KitContext, roomId: string, shotId: string) {
  assertOpen(ctx);
  const room = roomOf(ctx, roomId);
  if (!isValidShot(room.category, shotId)) throw new KitError(400, "That is not one of this room's photos.");
  await appendEvent({ property_id: ctx.claims.p, type: "kit", resource_id: null, actor_id: null, actor_name: ctx.kit.name, actor_role: "tenant", payload: { action: "skip", room_id: roomId, shot_id: shotId } });
}

// ---------------------------------------------------------------------------
// State, seal, report
// ---------------------------------------------------------------------------

const requiredShots = (category: string): Shot[] => shotListFor(category);

/** What the capture page needs: every room, every shot, and which are done. */
export async function kitState(ctx: KitContext) {
  const assets = await getDatabase().getAssets(ctx.claims.i);
  const byId = new Map(assets.map((a) => [a.id, a]));
  const rooms = ctx.rooms.map((room) => {
    const done = ctx.kit.shots[room.id] ?? {};
    const skipped = ctx.kit.skipped[room.id] ?? [];
    const shots = requiredShots(room.category).map((s) => {
      const a = byId.get(done[s.id]);
      return { ...s, status: a ? "done" : skipped.includes(s.id) ? "skipped" : "todo", thumb: a ? named(a.cloudinary_public_id, "rm_thumb") : null };
    });
    const damage = Object.keys(done).filter((id) => id.startsWith("damage-")).sort().map((id) => ({ id, thumb: byId.get(done[id]) ? named(byId.get(done[id])!.cloudinary_public_id, "rm_thumb") : null }));
    const photos = Object.keys(done).filter((id) => byId.has(done[id])).length;
    return { id: room.id, name: room.name, category: room.category, shots, damage, damage_max: MAX_DAMAGE_SHOTS, photos };
  });
  const total = rooms.reduce((n, r) => n + r.shots.length, 0), done = rooms.reduce((n, r) => n + r.shots.filter((s) => s.status === "done").length, 0);
  return {
    name: ctx.kit.name, address: ctx.kit.address, created_at: ctx.kit.created_at, scope: ctx.claims.s,
    rooms, progress: { done, total, photos: rooms.reduce((n, r) => n + r.photos, 0) },
    sealed: ctx.kit.sealed,
  };
}

async function sealInput(ctx: KitContext) {
  const assets = await getDatabase().getAssets(ctx.claims.i);
  const byId = new Map(assets.map((a) => [a.id, a]));
  return {
    kit: ctx.claims.p, name: ctx.kit.name, address: ctx.kit.address,
    rooms: ctx.rooms.map((r) => ({
      id: r.id, name: r.name,
      shots: Object.entries(ctx.kit.shots[r.id] ?? {}).filter(([, aid]) => byId.get(aid)?.sha256).map(([shot, aid]) => ({ shot, sha256: byId.get(aid)!.sha256! })),
    })),
  };
}

export async function sealKit(ctx: KitContext) {
  if (ctx.kit.sealed) return ctx.kit.sealed;
  const input = await sealInput(ctx);
  const empty = input.rooms.filter((r) => r.shots.length === 0).map((r) => r.name);
  if (empty.length) throw new KitError(400, `Add at least one photo in: ${empty.join(", ")}.`);
  const hash = sealHash(input);
  const photos = input.rooms.reduce((n, r) => n + r.shots.length, 0);
  const required = ctx.rooms.reduce((n, r) => n + requiredShots(r.category).length, 0);
  const done = ctx.rooms.reduce((n, r) => n + requiredShots(r.category).filter((s) => ctx.kit.shots[r.id]?.[s.id]).length, 0);
  const ev = await appendEvent({ property_id: ctx.claims.p, type: "kit", resource_id: null, actor_id: null, actor_name: ctx.kit.name, actor_role: "tenant", payload: { action: "seal", hash, photos, missing: required - done } });
  return { hash, at: ev.created_at, photos, missing: required - done };
}

/** The sealed record, as shown to the tenant and to anyone they send it to. */
export async function kitReport(ctx: KitContext) {
  const db = getDatabase();
  const [assets, events] = await Promise.all([db.getAssets(ctx.claims.i), listEvents(ctx.claims.p)]);
  const byId = new Map(assets.map((a) => [a.id, a]));
  const fp = deriveFingerprints(events);
  const proof = new Map(events.filter((e) => e.type === "kit" && e.payload.action === "shot").map((e) => [String(e.payload.asset_id), e.payload]));
  const rooms = ctx.rooms.map((room) => {
    const done = ctx.kit.shots[room.id] ?? {};
    const ids = [...shotListFor(room.category).map((s) => s.id), ...Object.keys(done).filter((id) => id.startsWith("damage-")).sort()];
    const photos = ids.map((shot_id) => {
      const a = byId.get(done[shot_id]);
      const label = shotLabel(room.category, shot_id);
      if (!a) return { shot_id, label, status: (ctx.kit.skipped[room.id] ?? []).includes(shot_id) ? "skipped" : "missing" } as const;
      const t = photoTimeCheck(fp[a.id]?.exif ?? null, ctx.kit.created_at, a.created_at);
      const pr = proof.get(a.id);
      return {
        shot_id, label, status: "done" as const,
        url: named(a.cloudinary_public_id, "rm_shared"), sha256: a.sha256 ?? null, uploaded_at: a.created_at,
        taken: { level: t.level, label: t.label, detail: t.detail }, camera: fp[a.id]?.exif?.camera ?? null,
        verified: !!pr?.server_verified && pr?.match !== false, faces: fp[a.id]?.faces ?? 0,
      };
    });
    return { id: room.id, name: room.name, photos };
  });
  const sealed = ctx.kit.sealed;
  const intact = sealed ? sealHash(await sealInput(ctx)) === sealed.hash : null;
  return {
    name: ctx.kit.name, address: ctx.kit.address, created_at: ctx.kit.created_at, sealed, intact, scope: ctx.claims.s, rooms,
    // The tenant gets the read-only link to send on; a reader never gets any token.
    sharing: ctx.kit.sharing,
    read_token: ctx.claims.s === "w" && ctx.kit.sharing ? signKit({ p: ctx.claims.p, i: ctx.claims.i, s: "r", g: ctx.kit.readGen }) : null,
    acks: ctx.kit.acks,
    counts: { photos: rooms.flatMap((r) => r.photos).filter((p) => p.status === "done").length, missing: rooms.flatMap((r) => r.photos).filter((p) => p.status !== "done" && !p.shot_id.startsWith("damage-")).length },
  };
}

// ---------------------------------------------------------------------------
// Confirmation and link replacement
// ---------------------------------------------------------------------------

/**
 * Someone who received the read-only link says they have seen the sealed record. It is stored
 * against the record's fingerprint (so it confirms THIS version) and means "seen", not "agreed".
 * The tenant cannot confirm their own record: it must come from a read-only link.
 */
export async function ackKit(ctx: KitContext, rawName: string) {
  if (ctx.claims.s !== "r") throw new KitError(403, "Confirmations come from the person you sent the link to.");
  if (!ctx.kit.sealed) throw new KitError(409, "The record is not sealed yet, so there is nothing to confirm.");
  const name = cleanText(rawName, 60);
  if (name.length < 2) throw new KitError(400, "Please enter your name.");
  if (ctx.kit.acks.some((a) => a.name.toLowerCase() === name.toLowerCase())) return ctx.kit.acks;
  if (ctx.kit.acks.length >= 10) throw new KitError(409, "This record already has the maximum number of confirmations.");
  const ev = await appendEvent({ property_id: ctx.claims.p, type: "kit", resource_id: null, actor_id: null, actor_name: name, actor_role: null, payload: { action: "ack", name, hash: ctx.kit.sealed.hash } });
  return [...ctx.kit.acks, { name, at: ev.created_at, hash: ctx.kit.sealed.hash }];
}

/**
 * Sharing is off until the creator turns it on, and only a sealed record can be shared. Turning it off cancels every
 * read-only link ever handed out (a later "on" gives a brand-new one).
 */
export async function setSharing(ctx: KitContext, on: boolean) {
  if (ctx.claims.s !== "w") throw new KitError(403, "Only the person who made this record can share it.");
  if (on && !ctx.kit.sharing) {
    if (!ctx.kit.sealed) throw new KitError(409, "Seal your record first, then you can share it.");
    await appendEvent({ property_id: ctx.claims.p, type: "kit", resource_id: null, actor_id: null, actor_name: ctx.kit.name, actor_role: "tenant", payload: { action: "share", on: true } });
    return { sharing: true, read_token: signKit({ p: ctx.claims.p, i: ctx.claims.i, s: "r", g: ctx.kit.readGen }) };
  }
  if (on) return { sharing: true, read_token: signKit({ p: ctx.claims.p, i: ctx.claims.i, s: "r", g: ctx.kit.readGen }) };
  if (ctx.kit.sharing) {
    await appendEvent({ property_id: ctx.claims.p, type: "kit", resource_id: null, actor_id: null, actor_name: ctx.kit.name, actor_role: "tenant", payload: { action: "share", on: false } });
    await appendEvent({ property_id: ctx.claims.p, type: "kit", resource_id: null, actor_id: null, actor_name: ctx.kit.name, actor_role: "tenant", payload: { action: "rotate" } });
  }
  return { sharing: false, read_token: null };
}

/** Cancels every read-only link handed out so far and returns a fresh one. Tenant link only, while sharing is on. */
export async function replaceReadLink(ctx: KitContext) {
  if (!ctx.kit.sharing) throw new KitError(409, "This record is not shared. Turn sharing on first.");
  await appendEvent({ property_id: ctx.claims.p, type: "kit", resource_id: null, actor_id: null, actor_name: ctx.kit.name, actor_role: "tenant", payload: { action: "rotate" } });
  return signKit({ p: ctx.claims.p, i: ctx.claims.i, s: "r", g: ctx.kit.readGen + 1 });
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/** Removes the kit, its photos in Cloudinary and its records. Only the tenant's link may do this. */
export async function deleteKit(ctx: KitContext) {
  const prefix = `properties/${ctx.claims.p}/`;
  if (isCloudinaryConfigured()) {
    ensureCloudinaryConfig();
    await cloudinary.api.delete_resources_by_prefix(prefix).catch((e: any) => console.warn("[Kit] Cloudinary cleanup:", e?.error?.message ?? e));
    await cloudinary.api.delete_folder(`properties/${ctx.claims.p}`).catch(() => {});
  }
  await getDatabase().deleteProperty?.(ctx.claims.p);
}
