/**
 * finish-reseed.ts — resumes scripts/reseed-studio.ts after an interruption (e.g. the Groq
 * free-tier daily token limit). Idempotent: only redoes what is missing.
 *
 *   npx tsx scripts/finish-reseed.ts [--redo asset-07,asset-08]
 *
 *  1. Re-runs analysis for failed/queued assets (and any listed in --redo, after removing
 *     their findings).
 *  2. Runs the move-in → later comparisons that do not exist yet.
 *  3. Re-fingerprints every photo (Cloudinary phash, faces, staged flag, reuse check).
 */

import { getDatabase } from "../src/lib/db";
import { runAnalysisForAsset } from "../src/lib/pipeline";
import { runComparison } from "../src/lib/compare";
import { fingerprintAsset } from "../src/lib/fingerprint";
import { getSupabaseClient, isSupabaseConfigured } from "../src/lib/supabase";

const PROPERTY = "prop-381";
const PAIRS: [string, string][] = [["asset-01", "asset-07"], ["asset-02", "asset-08"], ["asset-04", "asset-09"], ["asset-03", "asset-10"], ["asset-01", "asset-05"], ["asset-02", "asset-06"]];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const db = getDatabase();
  const redoArg = process.argv.find((a) => a.startsWith("--redo"));
  const redo = new Set((redoArg?.split("=")[1] ?? process.argv[process.argv.indexOf("--redo") + 1] ?? "").split(",").filter((x) => x.startsWith("asset-")));
  const inspections = await db.getInspections(PROPERTY);
  const assets = (await Promise.all(inspections.map((i) => db.getAssets(i.id)))).flat().sort((a, b) => a.captured_at.localeCompare(b.captured_at));

  // 1. Analysis
  for (const a of assets) {
    if (redo.has(a.id)) {
      if (isSupabaseConfigured()) await getSupabaseClient()!.from("observations").delete().eq("asset_id", a.id);
      await db.updateAssetStatus(a.id, "queued", null);
    } else if (a.analysis_status === "failed" || a.analysis_status === "queued" || a.analysis_status === "running") {
      await db.updateAssetStatus(a.id, "queued", null);
    } else continue;
    await runAnalysisForAsset(a.id);
    const after = await db.getAssetById(a.id);
    const obs = await db.getObservations(a.id);
    console.log(`1. ${a.id} ${after?.analysis_status} ${obs.length} findings ${after?.analysis_error ?? ""}`);
    for (const o of obs) console.log(`     - ${o.category.padEnd(7)} ${o.confidence.toFixed(2)} [${o.bbox.map((v) => v.toFixed(2)).join(",")}] ${o.description.slice(0, 90)}`);
    if (after?.analysis_status === "failed") { console.log("   stopping: analysis failed (quota?)"); return; }
    await sleep(1500);
  }

  // 2. Comparisons that do not exist yet
  const existing = await db.getComparisons(PROPERTY);
  const rooms = await db.getRooms(PROPERTY);
  for (const [p, c] of PAIRS) {
    if (existing.some((x) => x.prior_asset_id === p && x.current_asset_id === c)) { console.log(`2. ${p}→${c} exists`); continue; }
    const [pa, ca] = [await db.getAssetById(p), await db.getAssetById(c)];
    if (!pa || !ca) continue;
    const room = rooms.find((r) => r.id === pa.room_id);
    try {
      const { comparison } = await runComparison({ propertyId: PROPERTY, prior: pa, current: ca, roomId: room?.id, roomName: room?.name });
      console.log(`2. ${room?.name} ${p}→${c}: ${comparison.changes.length} changes (${comparison.changes.filter((x: any) => x.grounded).length} grounded) — ${comparison.summary.slice(0, 110)}`);
      for (const ch of comparison.changes as any[]) console.log(`     - ${String(ch.kind).padEnd(8)} ${ch.confidence.toFixed(2)} ${ch.region} ${ch.grounded ? "grounded" : "      "} ${ch.description.slice(0, 80)}`);
    } catch (e: any) {
      console.log(`2. ${room?.name} ${p}→${c}: FAILED ${e.message.slice(0, 160)}`);
      return;
    }
    await sleep(2500);
  }

  // 3. Fingerprints (oldest first, so later photos are checked against earlier ones)
  for (const a of assets) {
    const fp = await fingerprintAsset(PROPERTY, a.id, a.cloudinary_public_id, a.sha256);
    console.log(`3. ${a.id} phash ${fp?.phash} faces ${fp?.faces} staged ${fp?.staged} reused_of ${fp?.reused_of ?? "-"} mad ${fp?.mad ?? "-"}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
