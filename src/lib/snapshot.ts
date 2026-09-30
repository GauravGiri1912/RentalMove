/**
 * snapshot.ts — everything a property page needs, in one server-built object.
 *
 * The frontend renders from this snapshot and re-fetches it after every mutation (or when
 * the live stream reports a change). Derived fields are computed here, server-side, so
 * every client sees the same answer:
 *   - pre_existing: a finding at the same spot/category as one in an earlier photo
 *   - report content hash: what tenant and owner sign
 */

import crypto from "crypto";
import { getDatabase } from "./db";
import {
  deriveAssessments, deriveCalibrations, deriveCoverage, deriveFingerprints, deriveMeasures, deriveSignatures, deriveStances, deriveThreads, deriveWorkOrders,
  eventStoreKind, listEvents,
} from "./events";
import { iou } from "./pixel";
import type { Asset, Comparison, Inspection, Observation, Property, Room, ShareLink, User } from "./schemas";

export interface SnapshotAsset extends Asset {
  staged?: boolean;
  phash?: string | null;
  faces?: number;
  reused_of?: string | null;
  reuse_distance?: number | null;
  cloudinary_version?: number | null;
  exif?: { taken_at: string | null; software: string | null; camera: string | null } | null;
}

export interface SnapshotObservation extends Observation {
  pre_existing: boolean;
  /** The earlier finding this one matches, when pre_existing. */
  matches?: string | null;
}

export interface Snapshot {
  property: Property;
  rooms: Room[];
  inspections: Inspection[];
  assets: SnapshotAsset[];
  observations: SnapshotObservation[];
  comparisons: Comparison[];
  activity: { id: string; at: string; stage: string; label: string; detail: string; asset_id: string | null; actor: string | null }[];
  stances: ReturnType<typeof deriveStances>;
  threads: ReturnType<typeof deriveThreads>;
  signatures: ReturnType<typeof deriveSignatures>;
  share_links: (Omit<ShareLink, "token" | "token_hash"> & { token_hint: string; token?: string; recipient?: string | null; views?: number })[];
  report: { baseline_inspection_id: string | null; current_inspection_id: string | null; content_hash: string };
  meta: { generated_at: string; event_store: "supabase" | "local" };
  /** Display names for user ids referenced by inspections and reviews. */
  people: Record<string, string>;
  /** Scale reference per asset id (for sizes in cm). */
  calibrations: ReturnType<typeof deriveCalibrations>;
  /** Pixel measurement per observation id (extent now and at the same spot before). */
  measures: ReturnType<typeof deriveMeasures>;
  /** Repair work order per observation id. */
  work_orders: ReturnType<typeof deriveWorkOrders>;
  /** Visible room areas per asset id. */
  coverage: ReturnType<typeof deriveCoverage>;
  /** Photo-level assessment per asset id (could the model judge it; unsure findings). */
  assessments: ReturnType<typeof deriveAssessments>;
}

const SAME_SPOT_IOU = 0.2;
const SAME_SPOT_DIST = 0.08;

function centreDist(a: Observation["bbox"], b: Observation["bbox"]) {
  return Math.hypot((a[0] + a[2]) / 2 - (b[0] + b[2]) / 2, (a[1] + a[3]) / 2 - (b[1] + b[3]) / 2);
}

/** Marks findings that match a non-rejected finding at the same spot in an earlier photo of the room. */
export function markPreExisting(inspections: Inspection[], assets: Asset[], observations: Observation[]): SnapshotObservation[] {
  const when = new Map(inspections.map((i) => [i.id, new Date(i.captured_at).getTime()]));
  const assetById = new Map(assets.map((a) => [a.id, a]));
  return observations.map((o) => {
    const a = assetById.get(o.asset_id);
    if (!a) return { ...o, pre_existing: false };
    const t = when.get(a.inspection_id) ?? 0;
    const earlier = observations.find((p) => {
      if (p.id === o.id || p.review_status === "rejected") return false;
      const pa = assetById.get(p.asset_id);
      if (!pa || pa.room_id !== a.room_id || (when.get(pa.inspection_id) ?? 0) >= t) return false;
      return p.category === o.category && (iou(p.bbox, o.bbox) >= SAME_SPOT_IOU || centreDist(p.bbox, o.bbox) <= SAME_SPOT_DIST);
    });
    return { ...o, pre_existing: !!earlier, matches: earlier?.id ?? null };
  });
}

/** The report compares the first move-in with the latest inspection. */
export function reportInspections(inspections: Inspection[]) {
  const sorted = [...inspections].sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  const baseline = sorted.find((i) => i.type === "move_in") ?? sorted[0] ?? null;
  const current = sorted[sorted.length - 1] ?? null;
  return { baseline, current: current && baseline && current.id !== baseline.id ? current : null };
}

/**
 * Canonical content of the evidence report. Tenant and owner sign its SHA-256; any later
 * change to an included finding, a position, or a photo hash yields a different digest.
 */
export function reportContentHash(propertyId: string, inspections: Inspection[], assets: Asset[], observations: SnapshotObservation[], stances: Snapshot["stances"]): string {
  const { baseline, current } = reportInspections(inspections);
  const currentAssets = new Set(assets.filter((a) => a.inspection_id === current?.id).map((a) => a.id));
  const included = observations
    .filter((o) => currentAssets.has(o.asset_id) && !o.pre_existing && (o.review_status === "accepted" || o.review_status === "edited"))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((o) => ({ id: o.id, c: o.category, d: o.description, s: o.review_status, t: stances[o.id]?.tenant ?? null, o: stances[o.id]?.owner ?? null }));
  const files = assets
    .filter((a) => a.inspection_id === baseline?.id || a.inspection_id === current?.id)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((a) => [a.id, a.sha256 ?? null]);
  const canonical = JSON.stringify({ v: 1, property: propertyId, baseline: baseline?.id ?? null, current: current?.id ?? null, included, files });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export async function buildSnapshot(propertyId: string, user: User): Promise<Snapshot | null> {
  const db = getDatabase();
  const property = await db.getProperty(propertyId);
  if (!property) return null;
  const [rooms, inspectionsDesc, comparisonsAll, events, users, links] = await Promise.all([
    db.getRooms(propertyId),
    db.getInspections(propertyId),
    db.getComparisons(propertyId),
    listEvents(propertyId),
    db.listUsers(),
    user.role === "owner" ? db.listShareLinks(propertyId) : Promise.resolve([] as ShareLink[]),
  ]);
  const inspections = [...inspectionsDesc].sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  // Two batched round trips instead of one per inspection and one per photo.
  const baseAssets = await db.getAssetsForInspections(inspections.map((i) => i.id));
  const allObservations = await db.getObservationsForAssets(baseAssets.map((a) => a.id));

  const fps = deriveFingerprints(events);
  const assets: SnapshotAsset[] = baseAssets.map((a) => {
    const fp = fps[a.id];
    return {
      ...a,
      bytes: a.bytes ?? fp?.bytes ?? undefined,
      phash: fp?.phash ?? null,
      faces: fp?.faces ?? 0,
      reused_of: fp?.reused_of ?? null,
      reuse_distance: fp?.distance ?? null,
      cloudinary_version: fp?.version ?? null,
      staged: !!fp?.staged,
      exif: fp && "exif" in fp ? fp.exif : undefined,
    };
  });
  const observations = markPreExisting(inspections, baseAssets, allObservations);
  const stances = deriveStances(events);

  // Latest comparison per (prior, current) pair.
  const seen = new Set<string>();
  const comparisons = [...comparisonsAll]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .filter((c) => {
      const k = `${c.prior_asset_id}>${c.current_asset_id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  const activity = events
    .filter((e) => e.type === "pipeline" || e.type === "signature" || e.type === "share" || e.type === "workorder" || (e.type === "fingerprint" && e.payload.reused_of))
    .slice(-40)
    .reverse()
    .map((e) => ({
      id: e.id,
      at: e.created_at,
      stage: e.type === "pipeline" ? String(e.payload.stage ?? "pipeline") : e.type,
      label:
        e.type === "pipeline" ? String(e.payload.label ?? "") :
        e.type === "signature" ? (e.payload.hash ? `Report signed by ${e.actor_name}` : `${e.actor_name} withdrew a signature`) :
        e.type === "share" ? "Share link created" :
        e.type === "workorder" ? workorderLabel(e.payload, e.actor_name) :
        "Possible re-used photo",
      detail:
        e.type === "pipeline" ? String(e.payload.detail ?? "") :
        e.type === "signature" ? (e.payload.hash ? `sha256 ${String(e.payload.hash).slice(0, 12)}…` : "") :
        e.type === "workorder" ? String(e.payload.assignee ?? e.payload.note ?? "") :
        e.type === "share" ? `expires ${String(e.payload.expires_at ?? "").slice(0, 10)}${e.payload.recipient ? ` · for ${e.payload.recipient}` : ""}` :
        `phash distance ${e.payload.distance}`,
      asset_id: e.resource_id,
      actor: e.actor_name,
    }));

  const shareMeta = new Map(events.filter((e) => e.type === "share").map((e) => [e.resource_id, e.payload]));
  const share_links = links.map(({ token, token_hash: _h, ...rest }) => ({
    ...rest,
    token_hint: token.slice(0, 6),
    token: rest.created_by === user.id ? token : undefined,
    recipient: shareMeta.get(rest.id ?? token.slice(0, 12))?.recipient ?? null,
  }));

  const { baseline, current } = reportInspections(inspections);
  const obsIds = new Set(observations.map((o) => o.id));
  const workOrders = Object.fromEntries(Object.entries(deriveWorkOrders(events)).filter(([id]) => obsIds.has(id)));
  return {
    property,
    rooms,
    inspections,
    assets,
    observations,
    comparisons,
    activity,
    stances,
    threads: deriveThreads(events),
    signatures: deriveSignatures(events),
    share_links,
    report: {
      baseline_inspection_id: baseline?.id ?? null,
      current_inspection_id: current?.id ?? null,
      content_hash: reportContentHash(propertyId, inspections, baseAssets, observations, stances),
    },
    meta: { generated_at: new Date().toISOString(), event_store: eventStoreKind() },
    calibrations: deriveCalibrations(events),
    measures: deriveMeasures(events),
    work_orders: workOrders,
    coverage: deriveCoverage(events),
    assessments: deriveAssessments(events),
    people: Object.fromEntries(users.filter((u) => inspections.some((i) => i.created_by === u.id) || observations.some((o) => o.reviewed_by === u.id)).map((u) => [u.id, u.name])),
  };
}

function workorderLabel(p: Record<string, any>, who: string | null): string {
  if (p.action === "create") return "Repair work order created";
  if (p.action === "photo") return `Repair photo added${who ? ` by ${who}` : ""}`;
  if (p.action === "cancel") return "Work order cancelled";
  return p.status === "done" ? "Repair marked done" : p.status === "in_progress" ? "Repair started" : "Work order re-opened";
}
