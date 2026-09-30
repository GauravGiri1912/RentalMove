/**
 * reseed-studio.ts — rebuilds property prop-381's demo data with REAL pipeline output.
 *
 *   npx tsx scripts/reseed-studio.ts            # backup → upload → register → analyse → compare
 *   npx tsx scripts/reseed-studio.ts --dry-run  # only prints the plan
 *
 * What it does, in order:
 *  1. Backs up the property's current assets/observations/comparisons/share links to
 *     data/backups/ (nothing is lost).
 *  2. Uploads seed/images (see seed/make_staged.py for how 2025/2026 were made) to Cloudinary
 *     at stable public IDs, overwriting the old byte-identical duplicates and purging the CDN.
 *  3. Re-registers every photo with its real SHA-256 and removes the old hand-written findings.
 *  4. Runs the real pipeline per photo, oldest first: Cloudinary fingerprint → Groq vision →
 *     pixel grounding against the previous visit → tags/metadata back to Cloudinary.
 *  5. Records the historical reviews of the 2024 and 2025 visits (those visits are in the
 *     past), leaves 2026 findings pending for live review, and runs real comparisons.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { v2 as cloudinary } from "cloudinary";
import { getDatabase } from "../src/lib/db";
import { runAnalysisForAsset } from "../src/lib/pipeline";
import { runComparison } from "../src/lib/compare";
import { appendEvent } from "../src/lib/events";
import { isCloudinaryConfigured } from "../src/lib/media";

const PROPERTY = "prop-381";
const DRY = process.argv.includes("--dry-run");
const ROOT = process.cwd();

interface Plan { id: string; year: string; room: string; file: string; inspection: string; minutes: number }

const PLAN: Plan[] = [
  { id: "asset-01", year: "2024", room: "kitchen", file: "cabinet-base-01", inspection: "insp-2024-move-in", minutes: 12 },
  { id: "asset-02", year: "2024", room: "bathroom", file: "shower-tile-01", inspection: "insp-2024-move-in", minutes: 19 },
  { id: "asset-04", year: "2024", room: "bedroom", file: "bedroom-wall-01", inspection: "insp-2024-move-in", minutes: 25 },
  { id: "asset-03", year: "2024", room: "living_room", file: "living-floor-01", inspection: "insp-2024-move-in", minutes: 31 },
  { id: "asset-05", year: "2025", room: "kitchen", file: "cabinet-base-02", inspection: "insp-2025-periodic", minutes: 42 },
  { id: "asset-06", year: "2025", room: "bathroom", file: "shower-tile-02", inspection: "insp-2025-periodic", minutes: 47 },
  { id: "asset-07", year: "2026", room: "kitchen", file: "cabinet-base-03", inspection: "insp-2026-move-out", minutes: 7 },
  { id: "asset-08", year: "2026", room: "bathroom", file: "shower-tile-03", inspection: "insp-2026-move-out", minutes: 11 },
  { id: "asset-09", year: "2026", room: "bedroom", file: "bedroom-wall-03", inspection: "insp-2026-move-out", minutes: 16 },
  { id: "asset-10", year: "2026", room: "living_room", file: "living-floor-03", inspection: "insp-2026-move-out", minutes: 22 },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!isCloudinaryConfigured()) throw new Error("Cloudinary credentials missing");
  const db = getDatabase();
  const rooms = await db.getRooms(PROPERTY);
  const inspections = await db.getInspections(PROPERTY);
  const users = await db.listUsers();
  const owner = users.find((u) => u.role === "owner" && u.email.startsWith("sarah"));
  const tenant = users.find((u) => u.role === "tenant" && u.email.startsWith("alex"));
  const roomFor = (cat: string) => rooms.find((r) => r.category === cat);

  for (const p of PLAN) {
    if (!roomFor(p.room)) throw new Error(`No room with category ${p.room}`);
    if (!inspections.some((i) => i.id === p.inspection)) throw new Error(`No inspection ${p.inspection}`);
  }
  console.log(`Plan: ${PLAN.length} photos, rooms ${rooms.map((r) => r.id).join(", ")}`);
  if (DRY) return;

  // 1. Backup
  const existing = (await Promise.all(inspections.map((i) => db.getAssets(i.id)))).flat();
  const backup = {
    at: new Date().toISOString(),
    assets: existing,
    observations: (await Promise.all(existing.map((a) => db.getObservations(a.id)))).flat(),
    comparisons: await db.getComparisons(PROPERTY),
    share_links: await db.listShareLinks(PROPERTY),
  };
  const backupPath = path.join(ROOT, "data", "backups", `${PROPERTY}-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`1. Backed up ${backup.assets.length} assets, ${backup.observations.length} observations → ${path.relative(ROOT, backupPath)}`);

  // 2 + 3. Upload and re-register
  for (const p of PLAN) {
    const file = path.join(ROOT, "seed", "images", p.year, p.room, `${p.file}.jpg`);
    const bytes = fs.readFileSync(file);
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const publicId = `properties/${PROPERTY}/${p.inspection}/${p.room}/${p.file}`;
    const insp = inspections.find((i) => i.id === p.inspection)!;
    const up: any = await cloudinary.uploader.upload(file, {
      public_id: publicId,
      overwrite: true,
      invalidate: true,
      resource_type: "image",
      tags: ["rentalmove", p.room, insp.type, `room:${p.room}`, `insp:${insp.type}`, `property:${PROPERTY}`, ...(p.year === "2024" ? [] : ["staged-demo"])],
      context: { property_id: PROPERTY, inspection_id: p.inspection, room: p.room, staged: p.year === "2024" ? "false" : "true" },
    });
    await db.deleteAsset?.(p.id); // cascades its observations and comparisons
    const capturedAt = new Date(new Date(insp.captured_at).getTime() + p.minutes * 60000).toISOString();
    await db.upsertAsset({
      id: p.id,
      inspection_id: p.inspection,
      room_id: roomFor(p.room)!.id,
      cloudinary_public_id: publicId,
      secure_url: up.secure_url,
      resource_type: "image",
      format: up.format,
      width: up.width,
      height: up.height,
      bytes: up.bytes,
      etag: up.etag,
      sha256,
      captured_at: capturedAt,
      analysis_status: "queued",
      analysis_error: null,
    });
    await appendEvent({ property_id: PROPERTY, type: "pipeline", resource_id: p.id, actor_id: null, actor_name: "RentalMove", actor_role: "system", created_at: capturedAt, payload: { stage: "upload", label: "Uploaded to Cloudinary", detail: `${publicId} · ${(up.bytes / 1024).toFixed(0)} KB · sha256 ${sha256.slice(0, 8)}…` } });
    console.log(`2. ${p.id} ${publicId} v${up.version} ${up.bytes}B sha256 ${sha256.slice(0, 12)}`);
  }

  // 4. Real analysis, oldest first (so grounding has a previous visit to compare with)
  for (const p of PLAN) {
    const t0 = Date.now();
    await runAnalysisForAsset(p.id);
    const a = await db.getAssetById(p.id);
    const obs = await db.getObservations(p.id);
    console.log(`4. ${p.id} ${p.year} ${p.room.padEnd(11)} ${a?.analysis_status} ${obs.length} findings ${Date.now() - t0}ms ${a?.analysis_error ?? ""}`);
    for (const o of obs) console.log(`      - ${o.category.padEnd(7)} ${o.confidence.toFixed(2)} [${o.bbox.map((v) => v.toFixed(2)).join(",")}] ${o.description.slice(0, 90)}`);
    await sleep(1500);
  }

  // 5a. Historical reviews for past visits (2024 move-in walkthrough, 2025 periodic).
  for (const p of PLAN.filter((x) => x.year !== "2026")) {
    const insp = inspections.find((i) => i.id === p.inspection)!;
    for (const o of await db.getObservations(p.id)) {
      const reviewed_at = new Date(new Date(insp.captured_at).getTime() + 2 * 3600e3).toISOString();
      await db.updateObservation(o.id, {
        review_status: "accepted",
        reviewer_note: p.year === "2024" ? "Recorded at the move-in walkthrough." : "Noted at the periodic inspection.",
        reviewed_by: owner?.id ?? null,
        reviewed_at,
      });
    }
  }
  console.log("5a. Past-visit findings recorded as reviewed; 2026 findings left pending.");

  // 5b. Real comparisons: move-in → move-out for every room, and move-in → periodic where captured.
  for (const [prior, current] of [["asset-01", "asset-07"], ["asset-02", "asset-08"], ["asset-04", "asset-09"], ["asset-03", "asset-10"], ["asset-01", "asset-05"], ["asset-02", "asset-06"]]) {
    const pa = await db.getAssetById(prior), ca = await db.getAssetById(current);
    if (!pa || !ca) continue;
    const room = rooms.find((r) => r.id === pa.room_id);
    try {
      const { comparison } = await runComparison({ propertyId: PROPERTY, prior: pa, current: ca, roomId: room?.id, roomName: room?.name });
      console.log(`5b. ${room?.name} ${prior}→${current}: ${comparison.changes.length} changes — ${comparison.summary.slice(0, 100)}`);
    } catch (e: any) {
      console.log(`5b. ${room?.name} ${prior}→${current}: FAILED ${e.message}`);
    }
    await sleep(2500);
  }

  console.log(`Done. tenant=${tenant?.id} owner=${owner?.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
