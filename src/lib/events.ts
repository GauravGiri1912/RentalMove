/**
 * events.ts — append-only property event log.
 *
 * Stores everything the Studio features add on top of the core tables: tenant/owner
 * positions on findings, discussion comments, report signatures, photo fingerprints and
 * pipeline activity. State is derived by replaying events in order (see derive*()).
 *
 * Backing store: Supabase table `rm_events` (supabase/migrations/0003_studio_events.sql).
 * Until that migration is applied, events go to a local JSON file so the app keeps working.
 * Every append is also broadcast in-process so open pages can live-update (SSE).
 */

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { EventEmitter } from "events";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase";

export type EventType =
  | "stance" // payload: { stance: "agree" | "dispute" | null }
  | "comment" // payload: { text, voice?: { public_id, url, duration, lang, transcribed } }
  | "signature" // payload: { hash }
  | "fingerprint" // payload: { phash, faces, bytes, version, reused_of?, distance? }
  | "pipeline" // payload: { stage, label, detail }
  | "share" // payload: { token_hint, recipient?, expires_at, pixelate }
  | "calibration" // resource = asset; payload: { line: [x1,y1,x2,y2] normalised, cm, reference }
  | "measure" // resource = observation; payload: { extent, long_side, bbox_area } (fractions of the frame)
  | "workorder" // resource = observation; payload: { action: create|status|photo, ... }
  | "coverage" // resource = asset; payload: { areas: string[] } (model) or { action: "slot", item } (photo filed under a checklist item);
  //            resource = room: { action: "skip"|"unskip", inspection_id, item, kind, reason };
  //            no resource: { action: "submit", inspection_id, hash, photos, skipped } | "reopen_request" { note } | "reopen"
  | "translation" // payload: { lang, entries: { [sha1 of English text]: translated } }
  | "assessment" // resource = asset; payload: { can_assess, note, unsure: observation ids the model was unsure about }
  | "decision" // resource = observation; payload: { status, category?, description?, note? }
  | "removal" // resource = asset id (the asset itself is gone); payload: { room_id, inspection_id, sha256, public_id } — audit of a photo removed from a draft visit
  | "invite" // payload: { action: "create", id, email?, expires_at } | { action: "accept", id } | { action: "revoke", id } — how a tenant joins a property
  | "kit" // payload: { action: create|shot|skip|seal, ... } — the free move-in kit (see lib/kit.ts)
  | "roommatch" // resource = asset; payload: { verdict, reason, ref, view, phash } or { action: "confirm" }
  | "privacy"; // resource = asset; payload: { action: add|remove|scan, region?, id?, engine?, found? } — areas pixelated in shared copies

export type ActorRole = "tenant" | "owner" | "system";

export interface PropertyEvent {
  id: string;
  property_id: string;
  type: EventType;
  resource_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: ActorRole | null;
  payload: Record<string, any>;
  created_at: string;
}

export type NewEvent = Omit<PropertyEvent, "id" | "created_at"> & { created_at?: string };

// ---------------------------------------------------------------------------
// Live broadcast (single process). Survives Next dev hot reloads via globalThis.
// ---------------------------------------------------------------------------

const g = globalThis as unknown as { __rmBus?: EventEmitter };
export const eventBus: EventEmitter = g.__rmBus ?? (g.__rmBus = new EventEmitter());
eventBus.setMaxListeners(200);

// ---------------------------------------------------------------------------
// Local file fallback
// ---------------------------------------------------------------------------

function localPath(): string {
  const preferred = process.env.RENTALMOVE_EVENTS_PATH || path.join(process.cwd(), "data", "rentalmove-events.json");
  try {
    fs.mkdirSync(path.dirname(preferred), { recursive: true });
    fs.accessSync(path.dirname(preferred), fs.constants.W_OK);
    return preferred;
  } catch {
    return path.join(os.tmpdir(), "rentalmove-events.json");
  }
}

function readLocal(): PropertyEvent[] {
  try {
    return JSON.parse(fs.readFileSync(localPath(), "utf8"));
  } catch {
    return [];
  }
}

function writeLocal(all: PropertyEvent[]) {
  const p = localPath();
  const tmp = `${p}.tmp-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(all, null, 1), "utf8");
  fs.renameSync(tmp, p);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let tableMissing = false;
let warned = false;

function useSupabase(): boolean {
  return isSupabaseConfigured() && process.env.DEVELOPMENT_MOCK_MODE !== "true" && !tableMissing;
}

function isMissingTable(error: any): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01" || /schema cache/i.test(error?.message || "");
}

function noteMissing() {
  tableMissing = true;
  if (!warned) {
    warned = true;
    console.warn("[Events] Supabase table rm_events not found — using local file. Apply supabase/migrations/0003_studio_events.sql.");
  }
}

export function eventStoreKind(): "supabase" | "local" {
  return useSupabase() ? "supabase" : "local";
}

export async function appendEvent(e: NewEvent): Promise<PropertyEvent> {
  const event: PropertyEvent = {
    id: `evt-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    created_at: e.created_at ?? new Date().toISOString(),
    property_id: e.property_id,
    type: e.type,
    resource_id: e.resource_id ?? null,
    actor_id: e.actor_id ?? null,
    actor_name: e.actor_name ?? null,
    actor_role: e.actor_role ?? null,
    payload: e.payload ?? {},
  };

  let stored = false;
  if (useSupabase()) {
    const { error } = await getSupabaseClient()!.from("rm_events").insert(event);
    if (!error) stored = true;
    else if (isMissingTable(error)) noteMissing();
    else throw new Error(`Failed to append event: ${error.message}`);
  }
  if (!stored) {
    const all = readLocal();
    all.push(event);
    writeLocal(all);
  }

  eventBus.emit(`property:${event.property_id}`, event);
  void broadcastChange(event);
  return event;
}

/**
 * Cross-instance, cross-device live notice via Supabase Realtime broadcast. The payload is
 * deliberately content-free (type + id): clients re-fetch the snapshot through the
 * authorised API, so nothing sensitive travels over the public channel. Works on
 * serverless hosts where the in-process bus above does not reach other instances.
 */
async function broadcastChange(e: PropertyEvent) {
  if (!isSupabaseConfigured() || process.env.DEVELOPMENT_MOCK_MODE === "true") return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ topic: liveTopic(e.property_id), event: "change", payload: { type: e.type, id: e.id, at: e.created_at } }] }),
    });
  } catch {
    /* live notice is best effort */
  }
}

/** Realtime channel name for a property (shared with the browser). */
export const liveTopic = (propertyId: string) => `rm-${propertyId}`;

/** Supabase returns at most 1000 rows per request; read in pages so nothing is silently cut off. */
const PAGE = 1000;

/**
 * All rows of an events query, in insertion order (created_at, then seq — two events can share
 * a timestamp, and replay must follow the order they were written). `null` = table missing.
 */
async function readAllPages(build: () => any): Promise<PropertyEvent[] | null> {
  const out: PropertyEvent[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().order("created_at", { ascending: true }).order("seq", { ascending: true }).range(from, from + PAGE - 1);
    if (error) {
      if (isMissingTable(error)) { noteMissing(); return null; }
      throw new Error(`Failed to list events: ${error.message}`);
    }
    const rows = (data as (PropertyEvent & { seq?: number })[]) ?? [];
    out.push(...rows.map(({ seq: _seq, ...e }) => e as PropertyEvent));
    if (rows.length < PAGE) return out;
  }
}

/** Events of one type across ALL properties since a time (account-wide quotas, e.g. OCR scans). */
export async function listEventsOfType(type: EventType, sinceIso: string): Promise<PropertyEvent[]> {
  if (useSupabase()) {
    const rows = await readAllPages(() => getSupabaseClient()!.from("rm_events").select("*").eq("type", type).gte("created_at", sinceIso));
    if (rows) return rows;
  }
  return readLocal().filter((e) => e.type === type && e.created_at >= sinceIso);
}

export async function listEvents(propertyId: string, types?: EventType[]): Promise<PropertyEvent[]> {
  if (useSupabase()) {
    const rows = await readAllPages(() => {
      let q = getSupabaseClient()!.from("rm_events").select("*").eq("property_id", propertyId);
      if (types?.length) q = q.in("type", types);
      return q;
    });
    if (rows) return rows;
  }
  return readLocal()
    .filter((e) => e.property_id === propertyId && (!types || types.includes(e.type)))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

// ---------------------------------------------------------------------------
// Derived state (pure — unit tested)
// ---------------------------------------------------------------------------

export type Stance = "agree" | "dispute";

/** Latest position per observation per role. A null stance withdraws the position. */
export function deriveStances(events: PropertyEvent[]): Record<string, Partial<Record<"tenant" | "owner", Stance>>> {
  const out: Record<string, Partial<Record<"tenant" | "owner", Stance>>> = {};
  for (const e of events) {
    if (e.type !== "stance" || !e.resource_id || (e.actor_role !== "tenant" && e.actor_role !== "owner")) continue;
    const cur = (out[e.resource_id] ??= {});
    if (e.payload.stance === "agree" || e.payload.stance === "dispute") cur[e.actor_role] = e.payload.stance;
    else delete cur[e.actor_role];
  }
  return out;
}

export interface ThreadComment { id: string; author: string; role: "tenant" | "owner"; text: string; at: string; voice?: { url: string; duration: number; lang: string; transcribed: boolean } }

export function deriveThreads(events: PropertyEvent[]): Record<string, ThreadComment[]> {
  const out: Record<string, ThreadComment[]> = {};
  for (const e of events) {
    if (e.type !== "comment" || !e.resource_id || (e.actor_role !== "tenant" && e.actor_role !== "owner")) continue;
    const v = e.payload.voice;
    (out[e.resource_id] ??= []).push({
      id: e.id, author: e.actor_name ?? "Unknown", role: e.actor_role, text: String(e.payload.text ?? ""), at: e.created_at,
      ...(v?.url ? { voice: { url: String(v.url), duration: Number(v.duration) || 0, lang: String(v.lang ?? ""), transcribed: !!v.transcribed } } : {}),
    });
  }
  return out;
}

export interface SignatureRecord { at: string; hash: string; name: string }

/** Latest signature per role; a signature with hash null withdraws it. */
export function deriveSignatures(events: PropertyEvent[]): Partial<Record<"tenant" | "owner", SignatureRecord>> {
  const out: Partial<Record<"tenant" | "owner", SignatureRecord>> = {};
  for (const e of events) {
    if (e.type !== "signature" || (e.actor_role !== "tenant" && e.actor_role !== "owner")) continue;
    if (e.payload.hash) out[e.actor_role] = { at: e.created_at, hash: String(e.payload.hash), name: e.actor_name ?? "Unknown" };
    else delete out[e.actor_role];
  }
  return out;
}

/** Latest fingerprint per asset. */
export function deriveFingerprints(events: PropertyEvent[]): Record<string, Record<string, any>> {
  const out: Record<string, Record<string, any>> = {};
  for (const e of events) if (e.type === "fingerprint" && e.resource_id) out[e.resource_id] = { ...e.payload, at: e.created_at };
  return out;
}


// ---------------------------------------------------------------------------
// Measurements, calibrations, work orders, coverage
// ---------------------------------------------------------------------------

export interface Calibration { line: [number, number, number, number]; cm: number; reference: string; by: string | null; at: string }

/** Latest scale reference per asset (a line of known length drawn on the photo). */
export function deriveCalibrations(events: PropertyEvent[]): Record<string, Calibration> {
  const out: Record<string, Calibration> = {};
  for (const e of events) {
    if (e.type !== "calibration" || !e.resource_id) continue;
    if (e.payload.cm && Array.isArray(e.payload.line)) out[e.resource_id] = { line: e.payload.line.slice(0, 4).map(Number) as [number, number, number, number], cm: Number(e.payload.cm), reference: String(e.payload.reference ?? "custom"), by: e.actor_name, at: e.created_at };
    else delete out[e.resource_id];
  }
  return out;
}

export interface Measure {
  extent: number;
  long_side: number;
  bbox_area: number;
  /** Affected area at the same (aligned) spot in the previous photo of the room; null if none. */
  extent_prior: number | null;
  prior_asset_id: string | null;
  at: string;
}

/** Latest pixel measurement per observation. */
export function deriveMeasures(events: PropertyEvent[]): Record<string, Measure> {
  const out: Record<string, Measure> = {};
  for (const e of events) {
    if (e.type !== "measure" || !e.resource_id) continue;
    const p = e.payload;
    out[e.resource_id] = {
      extent: Number(p.extent), long_side: Number(p.long_side), bbox_area: Number(p.bbox_area),
      extent_prior: p.extent_prior == null ? null : Number(p.extent_prior), prior_asset_id: p.prior_asset_id ?? null, at: e.created_at,
    };
  }
  return out;
}

export type WorkOrderStatus = "open" | "in_progress" | "done";
export interface WorkOrder {
  id: string;
  observation_id: string;
  status: WorkOrderStatus;
  assignee: string;
  note: string;
  due: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  photo: {
    public_id: string; secure_url: string; sha256: string | null; by: string | null; at: string;
    /** Pixel check against the finding photo (lib/measure-node.ts verifyRepair). */
    check: { verdict: "reduced" | "unchanged" | "unclear"; same_view: boolean; view_match: number; extent_before: number; extent_after: number } | null;
  } | null;
  history: { at: string; by: string | null; text: string }[];
}

/** Current work order per observation, rebuilt from create/status/photo events. */
export function deriveWorkOrders(events: PropertyEvent[]): Record<string, WorkOrder> {
  const out: Record<string, WorkOrder> = {};
  for (const e of events) {
    if (e.type !== "workorder" || !e.resource_id) continue;
    const p = e.payload;
    if (p.action === "create") {
      out[e.resource_id] = {
        id: e.id, observation_id: e.resource_id, status: "open", assignee: String(p.assignee ?? ""), note: String(p.note ?? ""),
        due: p.due ?? null, created_by: e.actor_name, created_at: e.created_at, updated_at: e.created_at, photo: null,
        history: [{ at: e.created_at, by: e.actor_name, text: `Work order created${p.assignee ? ` for ${p.assignee}` : ""}` }],
      };
      continue;
    }
    const wo = out[e.resource_id];
    if (!wo) continue;
    wo.updated_at = e.created_at;
    if (p.action === "status" && ["open", "in_progress", "done"].includes(p.status)) {
      wo.status = p.status;
      wo.history.push({ at: e.created_at, by: e.actor_name, text: p.status === "done" ? "Marked repaired" : p.status === "in_progress" ? "Repair started" : "Re-opened" });
    } else if (p.action === "photo" && p.public_id) {
      wo.photo = { public_id: String(p.public_id), secure_url: String(p.secure_url ?? ""), sha256: p.sha256 ?? null, by: e.actor_name, at: e.created_at, check: p.check ?? null };
      const v = p.check?.verdict;
      wo.history.push({ at: e.created_at, by: e.actor_name, text: `Repair photo added${v === "reduced" ? " — change no longer detected at the spot" : v === "unchanged" ? " — change still detected at the spot" : v === "unclear" ? " — could not verify from the photo" : ""}` });
    } else if (p.action === "cancel") {
      delete out[e.resource_id];
    }
  }
  return out;
}

/** Latest list of visible room areas per asset (what the photo shows). */
export function deriveCoverage(events: PropertyEvent[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const e of events) if (e.type === "coverage" && e.resource_id && Array.isArray(e.payload.areas)) out[e.resource_id] = e.payload.areas.map(String);
  return out;
}

/** The checklist item each photo was filed under by whoever took it (latest wins; null clears it). */
export function deriveCoverageSlots(events: PropertyEvent[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of events) {
    if (e.type !== "coverage" || e.payload.action !== "slot" || !e.resource_id) continue;
    if (e.payload.item) out[e.resource_id] = String(e.payload.item); else delete out[e.resource_id];
  }
  return out;
}

/** Items a person chose not to photograph, keyed `room|inspection|item`. */
export function deriveCoverageSkips(events: PropertyEvent[]): Record<string, { kind: "skip" | "na"; reason: string; by: string | null; at: string }> {
  const out: Record<string, { kind: "skip" | "na"; reason: string; by: string | null; at: string }> = {};
  for (const e of events) {
    if (e.type !== "coverage" || !e.resource_id || !e.payload.inspection_id || !e.payload.item) continue;
    const k = `${e.resource_id}|${e.payload.inspection_id}|${e.payload.item}`;
    if (e.payload.action === "skip") out[k] = { kind: e.payload.kind === "na" ? "na" : "skip", reason: String(e.payload.reason ?? ""), by: e.actor_name, at: e.created_at };
    else if (e.payload.action === "unskip") delete out[k];
  }
  return out;
}

export interface Submission { at: string; by: string | null; hash: string | null; photos: number; skipped: number; reopen_request: { by: string | null; at: string; note: string } | null }

/**
 * Visits whose photographer said they are finished, with the seal taken at that moment. An owner can reopen
 * a visit (it then needs submitting again, with a new seal); the history stays in the event log.
 */
export function deriveSubmitted(events: PropertyEvent[]): Record<string, Submission> {
  const out: Record<string, Submission> = {};
  for (const e of events) {
    if (e.type !== "coverage" || !e.payload.inspection_id) continue;
    const id = String(e.payload.inspection_id);
    if (e.payload.action === "submit" && !out[id]) out[id] = { at: e.created_at, by: e.actor_name, hash: e.payload.hash ? String(e.payload.hash) : null, photos: Number(e.payload.photos ?? 0), skipped: Number(e.payload.skipped ?? 0), reopen_request: null };
    else if (e.payload.action === "reopen_request" && out[id]) out[id].reopen_request = { by: e.actor_name, at: e.created_at, note: String(e.payload.note ?? "") };
    else if (e.payload.action === "reopen") delete out[id];
  }
  return out;
}

export interface Removal { asset_id: string; room_id: string; inspection_id: string; sha256: string | null; at: string; by: string | null }

/** Photos removed from draft visits: who, when and the fingerprint of what was removed (never the image). */
export function deriveRemovals(events: PropertyEvent[]): Removal[] {
  return events.filter((e) => e.type === "removal" && e.resource_id).map((e) => ({
    asset_id: String(e.resource_id), room_id: String(e.payload.room_id ?? ""), inspection_id: String(e.payload.inspection_id ?? ""),
    sha256: e.payload.sha256 ? String(e.payload.sha256) : null, at: e.created_at, by: e.actor_name,
  }));
}

export interface Invite {
  id: string;
  email: string | null;
  created_at: string;
  created_by: string | null;
  expires_at: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  accepted_by: string | null;
  accepted_by_id: string | null;
  accepted_at: string | null;
}

/** Invitations of one property, in creation order. The first acceptance wins; "expired" is computed at read time. */
export function deriveInvites(events: PropertyEvent[], now = Date.now()): Invite[] {
  const byId = new Map<string, Invite>();
  for (const e of events) {
    if (e.type !== "invite") continue;
    const id = String(e.payload.id ?? "");
    if (!id) continue;
    if (e.payload.action === "create") {
      if (!byId.has(id)) byId.set(id, { id, email: e.payload.email ? String(e.payload.email) : null, created_at: e.created_at, created_by: e.actor_name, expires_at: String(e.payload.expires_at), status: "pending", accepted_by: null, accepted_by_id: null, accepted_at: null });
    } else {
      const inv = byId.get(id);
      if (!inv || inv.status !== "pending") continue;
      if (e.payload.action === "accept") { inv.status = "accepted"; inv.accepted_by = e.actor_name; inv.accepted_by_id = e.actor_id; inv.accepted_at = e.created_at; }
      else if (e.payload.action === "revoke") inv.status = "revoked";
    }
  }
  for (const inv of byId.values()) if (inv.status === "pending" && Date.parse(inv.expires_at) < now) inv.status = "expired";
  return [...byId.values()];
}

/** Cached machine translations per language, keyed by sha1 of the English source text. */
export function deriveTranslations(events: PropertyEvent[]): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const e of events) {
    if (e.type !== "translation" || typeof e.payload.lang !== "string" || !e.payload.entries) continue;
    Object.assign((out[e.payload.lang] ??= {}), e.payload.entries);
  }
  return out;
}

export interface Assessment { can_assess: boolean; note: string | null; unsure: string[]; at: string }

/** Latest photo-level assessment per asset: could the model judge it, and which findings it was unsure of. */
export function deriveAssessments(events: PropertyEvent[]): Record<string, Assessment> {
  const out: Record<string, Assessment> = {};
  for (const e of events) {
    if (e.type !== "assessment" || !e.resource_id) continue;
    out[e.resource_id] = { can_assess: e.payload.can_assess !== false, note: e.payload.note ?? null, unsure: Array.isArray(e.payload.unsure) ? e.payload.unsure.map(String) : [], at: e.created_at };
  }
  return out;
}

export type PrivacySource = "ocr" | "ai" | "manual";
export interface PrivacyRegion { id: string; bbox: [number, number, number, number]; source: PrivacySource; label: string; by: string | null; at: string }

/** Current areas to pixelate in shared copies, per asset (add/remove replay). */
export function derivePrivacy(events: PropertyEvent[]): Record<string, PrivacyRegion[]> {
  const out: Record<string, PrivacyRegion[]> = {};
  for (const e of events) {
    if (e.type !== "privacy" || !e.resource_id) continue;
    const list = (out[e.resource_id] ??= []);
    const p = e.payload;
    if (p.action === "add" && p.region && Array.isArray(p.region.bbox)) {
      list.push({ id: String(p.region.id ?? e.id), bbox: p.region.bbox.slice(0, 4).map(Number) as PrivacyRegion["bbox"], source: p.region.source ?? "manual", label: String(p.region.label ?? ""), by: e.actor_name, at: e.created_at });
    } else if (p.action === "remove" && p.id) {
      out[e.resource_id] = list.filter((r) => r.id !== p.id);
    } else if (p.action === "clear_source" && p.source) {
      out[e.resource_id] = list.filter((r) => r.source !== p.source);
    }
  }
  return out;
}

/** Latest privacy scan per asset: which engine ran and how many areas it found. */
export function derivePrivacyScans(events: PropertyEvent[]): Record<string, { engine: string; found: number; at: string }> {
  const out: Record<string, { engine: string; found: number; at: string }> = {};
  for (const e of events) if (e.type === "privacy" && e.resource_id && e.payload.action === "scan") out[e.resource_id] = { engine: String(e.payload.engine), found: Number(e.payload.found ?? 0), at: e.created_at };
  return out;
}

export interface RoomMatch { verdict: "first" | "match" | "unclear" | "mismatch" | "confirmed"; reason: string | null; ref: string | null; view: number | null; phash: number | null; by: string | null; at: string }

/** Latest room-match result per asset; a person's confirmation overrides the automatic one. */
export function deriveRoomMatch(events: PropertyEvent[]): Record<string, RoomMatch> {
  const out: Record<string, RoomMatch> = {};
  for (const e of events) {
    if (e.type !== "roommatch" || !e.resource_id) continue;
    const p = e.payload;
    if (p.action === "confirm") {
      const prev = out[e.resource_id];
      out[e.resource_id] = { verdict: "confirmed", reason: "Confirmed by a person", ref: prev?.ref ?? null, view: prev?.view ?? null, phash: prev?.phash ?? null, by: e.actor_name, at: e.created_at };
    } else if (out[e.resource_id]?.verdict !== "confirmed") {
      out[e.resource_id] = { verdict: p.verdict, reason: p.reason ?? null, ref: p.ref ?? null, view: p.view ?? null, phash: p.phash ?? null, by: e.actor_name, at: e.created_at };
    }
  }
  return out;
}

export interface KitState {
  name: string;
  address: string;
  created_at: string;
  /** Latest photo per room + shot; later events replace earlier ones (a retake). */
  shots: Record<string, Record<string, string>>;
  skipped: Record<string, string[]>;
  sealed: { hash: string; at: string; photos: number; missing: number } | null;
  /** Generation of the read-only link. Replacing the link bumps it; older read links stop working. */
  readGen: number;
  /** The record is private until its creator turns sharing on; while off, no read-only link opens it. */
  sharing: boolean;
  /** People who confirmed they have seen the sealed record (each tied to its fingerprint). */
  acks: { name: string; at: string; hash: string }[];
}

/** Rebuilds a kit from its events. Null when the kit does not exist. */
export function deriveKit(events: PropertyEvent[]): KitState | null {
  let kit: KitState | null = null;
  for (const e of events) {
    if (e.type !== "kit") continue;
    const p = e.payload;
    if (p.action === "create") {
      kit = { name: String(p.name ?? ""), address: String(p.address ?? ""), created_at: e.created_at, shots: {}, skipped: {}, sealed: null, readGen: 0, sharing: false, acks: [] };
    } else if (!kit) {
      continue;
    } else if (p.action === "shot" && p.room_id && p.shot_id && p.asset_id) {
      (kit.shots[p.room_id] ??= {})[p.shot_id] = String(p.asset_id);
      kit.skipped[p.room_id] = (kit.skipped[p.room_id] ?? []).filter((s) => s !== p.shot_id);
    } else if (p.action === "unshot" && p.room_id && p.shot_id) {
      delete kit.shots[p.room_id]?.[p.shot_id];
    } else if (p.action === "skip" && p.room_id && p.shot_id) {
      if (!kit.shots[p.room_id]?.[p.shot_id]) kit.skipped[p.room_id] = [...new Set([...(kit.skipped[p.room_id] ?? []), String(p.shot_id)])];
    } else if (p.action === "seal" && p.hash && !kit.sealed) {
      kit.sealed = { hash: String(p.hash), at: e.created_at, photos: Number(p.photos ?? 0), missing: Number(p.missing ?? 0) };
    } else if (p.action === "share") {
      kit.sharing = !!p.on;
    } else if (p.action === "rotate") {
      kit.readGen += 1;
    } else if (p.action === "ack" && p.name && kit.sealed && p.hash === kit.sealed.hash) {
      // Only confirmations of the exact sealed record count.
      if (!kit.acks.some((a) => a.name.toLowerCase() === String(p.name).toLowerCase())) kit.acks.push({ name: String(p.name), at: e.created_at, hash: String(p.hash) });
    }
  }
  return kit;
}
