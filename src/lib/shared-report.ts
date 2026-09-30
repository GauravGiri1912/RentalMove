/**
 * shared-report.ts — the public, read-only view behind a share link.
 *
 * Only what a recipient should see: reviewed findings (accepted/edited) that are new since
 * move-in, what was already there, file hashes and signatures. Every image URL goes through
 * Cloudinary face pixelation, and — when the link names a recipient — carries a watermark
 * with that name and the link's short id, so a leaked image can be traced to its link.
 */

import { named, evidenceTransformation, type EvidenceBox } from "./cloudinary-urls";
import { signedDeliveryUrl } from "./media";
import { buildSnapshot, reportInspections } from "./snapshot";
import { listEvents } from "./events";
import { cachedTranslations } from "./translate";
import type { ShareLink, User } from "./schemas";

function watermark(text: string): string {
  const safe = encodeURIComponent(text.replace(/[^A-Za-z0-9 .@:+-]/g, "").slice(0, 48)).replace(/%20/g, "%20");
  return `l_text:Arial_20_bold:${safe},co_white,o_70,b_rgb:00000080/fl_layer_apply,g_south_east,x_16,y_16`;
}

export function sharedImageUrl(publicId: string, recipient: string | null, linkHint: string): string {
  if (!recipient) return named(publicId, "rm_shared"); // faces pixelated, named transformation
  // Pixelate, then the per-recipient watermark layer, then delivery format — signed, because
  // the recipe is dynamic (it contains the recipient's name).
  return signedDeliveryUrl(publicId, `c_limit,w_1600,h_1200,e_pixelate_faces:20/${watermark(`Shared with ${recipient} · ${linkHint}`)}/f_auto,q_auto`);
}

/** Evidence rendition (boxes drawn by Cloudinary, faces pixelated, optional watermark) — signed. */
export function evidenceImageUrl(publicId: string, boxes: EvidenceBox[], recipient: string | null, linkHint: string): string {
  const parts = evidenceTransformation(boxes, { pixelateFaces: true }).split("/");
  if (recipient) parts.splice(parts.length - 1, 0, watermark(`Shared with ${recipient} · ${linkHint}`));
  return signedDeliveryUrl(publicId, parts.join("/"));
}

export async function buildSharedReport(link: ShareLink) {
  // A synthetic owner-scoped reader: the snapshot is filtered below before leaving the server.
  const reader: User = { id: "share-link", name: "Share link", email: "share@rentalmove.local", role: "owner", owned_properties: [link.property_id], created_at: link.created_at };
  const snap = await buildSnapshot(link.property_id, reader);
  if (!snap) return null;
  const events = await listEvents(link.property_id, ["share"]);
  const recipient = events.find((e) => e.resource_id === (link.id ?? link.token.slice(0, 12)))?.payload.recipient ?? null;
  const hint = link.token.slice(0, 6);
  const { baseline, current } = reportInspections(snap.inspections);

  const rooms = snap.rooms.map((room) => {
    const before = snap.assets.find((a) => a.room_id === room.id && a.inspection_id === baseline?.id);
    const after = snap.assets.find((a) => a.room_id === room.id && a.inspection_id === current?.id);
    const obs = after ? snap.observations.filter((o) => o.asset_id === after.id) : [];
    return {
      id: room.id,
      name: room.name,
      before: before ? { url: sharedImageUrl(before.cloudinary_public_id, recipient, hint), captured_at: before.captured_at, sha256: before.sha256 ?? null } : null,
      after: after
        ? {
            url: sharedImageUrl(after.cloudinary_public_id, recipient, hint),
            // Same photo with the reviewed findings drawn by Cloudinary into the pixels.
            evidence_url: evidenceImageUrl(after.cloudinary_public_id, obs.filter((o) => !o.pre_existing && (o.review_status === "accepted" || o.review_status === "edited")).map((o, i) => ({ bbox: o.bbox, label: `${i + 1} ${o.category}` })), recipient, hint),
            captured_at: after.captured_at,
            sha256: after.sha256 ?? null,
            analysed: after.analysis_status === "done",
          }
        : null,
      findings: obs
        .filter((o) => !o.pre_existing && (o.review_status === "accepted" || o.review_status === "edited"))
        .map((o) => ({ id: o.id, category: o.category, description: o.description, sub_area: o.sub_area, bbox: o.bbox, review_status: o.review_status, reviewer_note: o.reviewer_note ?? null, stances: snap.stances[o.id] ?? {} })),
      pre_existing: obs.filter((o) => o.pre_existing && o.review_status !== "rejected").map((o) => o.description),
    };
  });

  // Hindi from the cache only (a public link never triggers model calls), and only for text
  // that is actually in this shared report — pending/rejected findings must not leak.
  const visible = rooms.flatMap((r: any) => [r.name, ...r.pre_existing, ...r.findings.flatMap((f: any) => [f.description, f.reviewer_note, f.sub_area])]).filter(Boolean) as string[];
  const translations = { hi: await cachedTranslations(link.property_id, "hi", visible) };

  return {
    translations,
    property: { address_label: snap.property.address_label, unit_label: snap.property.unit_label },
    baseline: baseline ? { type: baseline.type, captured_at: baseline.captured_at } : null,
    current: current ? { type: current.type, captured_at: current.captured_at } : null,
    rooms,
    files: snap.assets
      .filter((a) => a.inspection_id === baseline?.id || a.inspection_id === current?.id)
      .map((a) => ({ room: snap.rooms.find((r) => r.id === a.room_id)?.name ?? "", inspection: a.inspection_id === baseline?.id ? baseline?.type : current?.type, sha256: a.sha256 ?? null })),
    signatures: snap.signatures,
    content_hash: snap.report.content_hash,
    link: { expires_at: link.expires_at, recipient, hint },
  };
}
