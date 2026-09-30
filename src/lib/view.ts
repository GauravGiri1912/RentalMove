// The only module pages read data from. It holds the current property's view, built from
// GET /api/properties/:id/snapshot by StudioProvider; getters are synchronous so pages stay
// simple. Mutations live in the provider (they call the API, then refresh the snapshot).

import type {
  Asset, BBox, Comparison, Inspection, IssueCategory, Observation, PipelineEvent, Property, Room,
  SearchFilter, ShareLink, SignatureRecord, Stance, ThreadComment, User, Calibration, Measure, WorkOrder,
} from "./view-types";
import { named, reviewUrl } from "./cloudinary-urls";

export interface View {
  user: User;
  properties: Property[];
  property: Property;
  rooms: Room[];
  inspections: Inspection[];
  assets: Asset[];
  observations: Observation[];
  comparisons: Comparison[];
  events: PipelineEvent[];
  shareLinks: ShareLink[];
  stances: Record<string, Partial<Record<"tenant" | "owner", Stance>>>;
  threads: Record<string, ThreadComment[]>;
  signatures: Partial<Record<"tenant" | "owner", SignatureRecord>>;
  report: { baseline_inspection_id: string | null; current_inspection_id: string | null; content_hash: string };
  meta: { generated_at: string; event_store: "supabase" | "local" };
  calibrations: Record<string, Calibration>;
  measures: Record<string, Measure>;
  workOrders: Record<string, WorkOrder>;
  coverage: Record<string, string[]>;
  assessments: Record<string, { can_assess: boolean; note: string | null; unsure: string[]; at: string }>;
}

let current: View | null = null;
export const setView = (v: View | null) => { current = v; };
export const hasView = () => current !== null;
function V(): View {
  if (!current) throw new Error("View not loaded yet");
  return current;
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

/** Snapshot (server shape) → view model. */
export function toView(snap: any, user: any, properties: any[]): View {
  const inspections: Inspection[] = snap.inspections.map((i: any) => ({
    id: i.id,
    property_id: i.property_id,
    type: i.type,
    captured_at: i.captured_at,
    status: i.status ?? "completed",
    captured_by: snap.people?.[i.created_by] ?? "",
  }));
  const assets: Asset[] = snap.assets
    .filter((a: any) => (a.resource_type ?? "image") === "image")
    .map((a: any) => ({
      id: a.id,
      inspection_id: a.inspection_id,
      room_id: a.room_id,
      cloudinary_public_id: a.cloudinary_public_id,
      cloudinary_version: a.cloudinary_version,
      src: reviewUrl(a.cloudinary_public_id || a.secure_url),
      thumb: named(a.cloudinary_public_id || a.secure_url, "rm_thumb"),
      width: a.width ?? 1200,
      height: a.height ?? 896,
      bytes: a.bytes ?? 0,
      sha256: a.sha256 ?? "",
      captured_at: a.captured_at,
      analysis_status: a.analysis_status,
      analysis_error: a.analysis_error,
      people_detected: (a.faces ?? 0) > 0,
      staged: !!a.staged,
      reused_of: a.reused_of,
      reuse_distance: a.reuse_distance,
      image_quality: a.image_quality,
      exif: a.exif,
      uploaded_at: a.created_at,
    }));
  const observations: Observation[] = snap.observations.map((o: any) => ({
    id: o.id,
    asset_id: o.asset_id,
    category: o.category,
    sub_area: String(o.sub_area ?? "general").replace(/_/g, " "),
    description: o.description,
    confidence: Number(o.confidence),
    bbox: o.bbox,
    review_status: o.review_status,
    reviewer_note: o.reviewer_note,
    pre_existing: !!o.pre_existing,
    matches: o.matches,
    source: o.source ?? "ai",
  }));
  const comparisons: Comparison[] = snap.comparisons.map((c: any) => ({
    id: c.id,
    room_id: c.room_id,
    prior_asset_id: c.prior_asset_id,
    current_asset_id: c.current_asset_id,
    summary: c.summary,
    changes: (c.changes ?? []).map((x: any) => ({ description: x.description, confidence: x.confidence, region: x.region ?? "general", bbox: x.bbox, kind: x.kind ?? "new", grounded: x.grounded })),
    caveats: c.caveats ?? [],
    model_version: c.model_version,
    created_at: c.created_at,
  }));
  const hasMoveOut = inspections.some((i) => i.type === "move_out");
  const toProperty = (p: any): Property => ({
    id: p.id,
    address_label: p.address_label,
    unit_label: p.unit_label,
    owner_id: p.owner_id,
    status: p.id === snap.property.id ? (hasMoveOut ? "move_out_in_progress" : inspections.length ? "active" : "no_inspections") : "active",
    cover: p.id === snap.property.id ? assets[0]?.src : undefined,
  });
  return {
    user: { ...user, initials: initials(user.name) },
    properties: properties.map(toProperty),
    property: toProperty(snap.property),
    rooms: snap.rooms,
    inspections,
    assets,
    observations,
    comparisons,
    events: snap.activity,
    shareLinks: snap.share_links,
    stances: snap.stances,
    threads: snap.threads,
    signatures: snap.signatures,
    report: snap.report,
    meta: snap.meta,
    calibrations: snap.calibrations ?? {},
    measures: snap.measures ?? {},
    workOrders: snap.work_orders ?? {},
    coverage: snap.coverage ?? {},
    assessments: snap.assessments ?? {},
  };
}

// ---------------------------------------------------------------------------
// Getters (read the current view)
// ---------------------------------------------------------------------------

export const getProperties = () => V().properties;
export const getProperty = (_id?: string) => V().property;
export const getRooms = () => V().rooms;
export const getRoom = (id: string) => V().rooms.find((r) => r.id === id) ?? { id, property_id: V().property.id, name: "Unknown room", category: "unknown" as const };
export const getInspections = () => V().inspections;
export const getInspection = (id: string) => V().inspections.find((i) => i.id === id)!;
export const getAssets = () => V().assets;
export const getAsset = (id: string) => V().assets.find((a) => a.id === id)!;
export const assetFor = (roomId: string, inspectionId: string) => V().assets.find((a) => a.room_id === roomId && a.inspection_id === inspectionId);
export const observationsFor = (assetId: string) => V().observations.filter((o) => o.asset_id === assetId);
export const getObservations = () => V().observations;
export const getComparisons = () => V().comparisons;
export const getEvents = () => V().events;
export const getShareLinks = () => V().shareLinks;
export const getReport = () => V().report;
export const getMeta = () => V().meta;
export const getCalibration = (assetId: string) => V().calibrations[assetId];
export const getMeasure = (obsId: string) => V().measures[obsId];
export const getWorkOrder = (obsId: string) => V().workOrders[obsId];
export const getWorkOrders = () => Object.values(V().workOrders);
export const getCoverage = (assetId: string) => V().coverage[assetId];
export const getAssessment = (assetId: string) => V().assessments[assetId];

/** Baseline (first move-in) and latest inspection — what the report and overview compare. */
export function reportPair(): { baseline: Inspection | null; current: Inspection | null } {
  const r = V().report;
  return {
    baseline: V().inspections.find((i) => i.id === r.baseline_inspection_id) ?? null,
    current: V().inspections.find((i) => i.id === r.current_inspection_id) ?? null,
  };
}

/** Latest comparison of a room between the report pair, falling back to any for the room. */
export function comparisonFor(roomId: string, priorId?: string, currentId?: string): Comparison | undefined {
  const all = V().comparisons.filter((c) => c.room_id === roomId);
  if (priorId && currentId) return all.find((c) => c.prior_asset_id === priorId && c.current_asset_id === currentId);
  const { baseline, current: cur } = reportPair();
  const pa = baseline && assetFor(roomId, baseline.id);
  const ca = cur && assetFor(roomId, cur.id);
  return (pa && ca && all.find((c) => c.prior_asset_id === pa.id && c.current_asset_id === ca.id)) || all[0];
}

export function reviewQueue(): Observation[] {
  const cur = reportPair().current;
  const ids = new Set(V().assets.filter((a) => a.inspection_id === cur?.id).map((a) => a.id));
  return V().observations
    .filter((o) => ids.has(o.asset_id) && o.review_status === "pending")
    .sort((a, b) => Number(!!a.pre_existing) - Number(!!b.pre_existing) || a.confidence - b.confidence);
}

// ---------------------------------------------------------------------------
// Plain-language search → whitelisted filter (mirrors the server; free text never reaches
// the Cloudinary expression unescaped). The Search page sends the filter to GET /api/search.
// ---------------------------------------------------------------------------

export function parseQuery(q: string): SearchFilter {
  const s = q.toLowerCase();
  const f: SearchFilter = {};
  if (/kitchen|cabinet/.test(s)) f.room = "kitchen";
  else if (/bath|shower|grout/.test(s)) f.room = "bathroom";
  else if (/bed/.test(s)) f.room = "bedroom";
  else if (/living|lounge/.test(s)) f.room = "living_room";
  if (/move[- ]?in|baseline/.test(s)) f.inspection_type = "move_in";
  else if (/move[- ]?out|final/.test(s)) f.inspection_type = "move_out";
  else if (/periodic|mid[- ]?lease/.test(s)) f.inspection_type = "inspection";
  const cats: [RegExp, IssueCategory][] = [[/scratch/, "scratch"], [/stain|mould|mold|discolou?r/, "stain"], [/crack/, "crack"], [/dent|chip|hole/, "dent"], [/scuff|mark/, "mark"]];
  for (const [re, c] of cats) if (re.test(s)) { f.issue_category = c; break; }
  if (/pending|unreviewed|to review/.test(s)) f.review_status = "pending";
  else if (/accepted|confirmed/.test(s)) f.review_status = "accepted";
  const y = s.match(/\b(202\d)\b/);
  if (y) { f.date_from = `${y[1]}-01-01`; f.date_to = `${y[1]}-12-31`; }
  return f;
}

export interface SearchHit { asset: Asset; observations: Observation[] }

/** Maps Cloudinary Search API resources back to this property's assets and matching findings. */
export function hitsFromResources(resources: { public_id: string }[], f: SearchFilter): SearchHit[] {
  const byId = new Map(V().assets.map((a) => [a.cloudinary_public_id, a]));
  return resources
    .map((r) => byId.get(r.public_id))
    .filter((a): a is Asset => !!a)
    .map((asset) => ({
      asset,
      observations: observationsFor(asset.id).filter((o) => (!f.issue_category || o.category === f.issue_category) && (!f.review_status || o.review_status === f.review_status)),
    }));
}

export type { BBox };
