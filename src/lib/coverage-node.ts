/**
 * coverage-node.ts — the server's view of a visit's completeness. The browser shows the same numbers
 * (lib/coverage.ts) but only this is trusted when a visit is submitted.
 */

import crypto from "crypto";
import { getDatabase } from "./db";
import { computeCoverage, isResolved, type CoverageResult } from "./coverage";
import { deriveCoverage, deriveCoverageSkips, deriveCoverageSlots, deriveRemovals, deriveSubmitted, listEvents } from "./events";

export interface RoomProgress { room_id: string; name: string; category: string; photos: number; coverage: CoverageResult | null; resolved: boolean }

export async function visitProgress(propertyId: string, inspectionId: string) {
  const db = getDatabase();
  const [rooms, assets, events] = await Promise.all([db.getRooms(propertyId), db.getAssetsForInspections([inspectionId]), listEvents(propertyId, ["coverage"])]);
  const areas = deriveCoverage(events), slots = deriveCoverageSlots(events), skips = deriveCoverageSkips(events);
  const rows: RoomProgress[] = rooms.map((r) => {
    const photos = assets.filter((a) => a.room_id === r.id && (a.resource_type ?? "image") === "image");
    const res: Record<string, { kind: "skip" | "na"; reason: string }> = {};
    for (const [k, v] of Object.entries(skips)) { const [rid, iid, item] = k.split("|"); if (rid === r.id && iid === inspectionId) res[item] = v; }
    const cov = computeCoverage(r.category, photos.map((a) => ({ id: a.id, slot: slots[a.id] ?? null, areas: areas[a.id] ?? null })), res);
    // A room type with no checklist has nothing to complete beyond having a photo.
    return { room_id: r.id, name: r.name, category: r.category, photos: photos.length, coverage: cov.total ? cov : null, resolved: cov.total ? isResolved(cov) : photos.length > 0 };
  });
  return { rows, complete: rows.length > 0 && rows.every((r) => r.resolved), submitted: deriveSubmitted(events)[inspectionId] ?? null };
}

export interface SealedPhoto { id: string; sha256: string; slot: string | null; uploaded_at: string | null }
export interface SealedItem { key: string; label: string; status: "photographed" | "seen" | "skipped" | "na" | "open"; reason: string | null; check: string | null }
export interface SealedRoom { id: string; name: string; items: SealedItem[]; photos: SealedPhoto[] }

/**
 * SHA-256 over what the PERSON controls: each room's photos (by original-file hash) with the item each was filed
 * under, and every skip with its reason. The vision model's reading is left out on purpose: re-analysing a
 * photo must not change a sealed record.
 */
export function visitSealHash(inspectionId: string, rooms: SealedRoom[]): string {
  const canonical = JSON.stringify({
    v: 1,
    visit: inspectionId,
    rooms: [...rooms].sort((a, b) => a.id.localeCompare(b.id)).map((r) => ({
      id: r.id,
      name: r.name,
      photos: r.photos.map((p) => [p.sha256, p.slot ?? ""]).sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1])),
      skips: r.items.filter((i) => i.status === "skipped" || i.status === "na").map((i) => [i.key, i.status, i.reason ?? ""]).sort((a, b) => a[0].localeCompare(b[0])),
    })),
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

/** The visit as it stands now, plus what was sealed at submission and whether they still agree. */
export async function visitSubmission(propertyId: string, inspectionId: string) {
  const db = getDatabase();
  const [rooms, assets, events, removalEvents] = await Promise.all([db.getRooms(propertyId), db.getAssetsForInspections([inspectionId]), listEvents(propertyId, ["coverage"]), listEvents(propertyId, ["removal"])]);
  const areas = deriveCoverage(events), slots = deriveCoverageSlots(events), skips = deriveCoverageSkips(events);
  const removed = deriveRemovals(removalEvents).filter((r) => r.inspection_id === inspectionId);
  const sealed: SealedRoom[] = rooms.map((r) => {
    const photos = assets.filter((a) => a.room_id === r.id && (a.resource_type ?? "image") === "image");
    const res: Record<string, { kind: "skip" | "na"; reason: string }> = {};
    for (const [k, v] of Object.entries(skips)) { const [rid, iid, item] = k.split("|"); if (rid === r.id && iid === inspectionId) res[item] = v; }
    const cov = computeCoverage(r.category, photos.map((a) => ({ id: a.id, slot: slots[a.id] ?? null, areas: areas[a.id] ?? null })), res);
    const items: SealedItem[] = cov.items.map((i) => ({
      key: i.key, label: i.label, check: i.check, reason: i.resolved?.reason || null,
      status: i.source === "declared" ? "photographed" : i.covered ? "seen" : i.resolved ? (i.resolved.kind === "na" ? "na" : "skipped") : "open",
    }));
    return { id: r.id, name: r.name, items, photos: photos.map((a) => ({ id: a.id, sha256: a.sha256 ?? "", slot: slots[a.id] ?? null, uploaded_at: (a as any).uploaded_at ?? a.created_at ?? null })) };
  });
  const hash = visitSealHash(inspectionId, sealed);
  const submitted = deriveSubmitted(events)[inspectionId] ?? null;
  return { rooms: sealed, hash, submitted, intact: submitted?.hash ? submitted.hash === hash : null, removed };
}
