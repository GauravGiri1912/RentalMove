import { getDatabase } from "./db";
import { getMediaProvider } from "./media";
import { getVisionProvider, VisionQuotaError, VisionRetryableError } from "./vision";
import { computeRemoteImageSha256 } from "./hash";
import { Asset, AssetRegisterRequest, AnalysisStatus } from "./schemas";
import { after } from "next/server";
import { computeManagedTags } from "./tags";
import { appendEvent } from "./events";
import { fingerprintAsset } from "./fingerprint";
import { groundFindings, propertyIdForInspection } from "./grounding";
import type { ObservationItem } from "./schemas";
import { measureObservations } from "./measure-node";

/** Records a pipeline step in the property's activity log (best effort). */
async function logStep(propertyId: string | null, assetId: string, stage: string, label: string, detail: string) {
  if (!propertyId) return;
  try {
    await appendEvent({ property_id: propertyId, type: "pipeline", resource_id: assetId, actor_id: null, actor_name: "RentalMove", actor_role: "system", payload: { stage, label, detail } });
  } catch (err) {
    console.warn("[Pipeline] Could not log step:", err);
  }
}

const QUALITY_NOTE: Record<string, string> = { blurry: "The photo is blurry", too_dark: "The photo is too dark", not_a_room: "The photo does not show a room" };

/** At most this many "unexplained pixel change" items per photo, largest first. */
const MAX_UNEXPLAINED = 3;

/**
 * Core idempotent asset registration pipeline.
 * Called by both POST /api/assets/register and POST /api/cloudinary/webhook.
 */
export async function registerAsset(data: AssetRegisterRequest): Promise<Asset> {
  const db = getDatabase();
  const media = getMediaProvider();

  // 1. Check if asset already registered (idempotency check)
  const existing = await db.getAssetByPublicId(data.cloudinary_public_id);
  if (existing) {
    console.log(`[Pipeline] Asset already registered: ${data.cloudinary_public_id}`);
    return existing;
  }

  // 2. Compute SHA-256 for evidence integrity if not provided
  let sha256 = data.sha256;
  if (!sha256 && data.secure_url) {
    try {
      sha256 = await computeRemoteImageSha256(data.secure_url);
    } catch (err) {
      console.warn("[Pipeline] Could not compute remote SHA-256:", err);
    }
  }

  // 3. Upsert asset in database with initial status 'queued'
  const asset = await db.upsertAsset({
    inspection_id: data.inspection_id,
    room_id: data.room_id,
    cloudinary_public_id: data.cloudinary_public_id,
    secure_url: data.secure_url,
    resource_type: data.resource_type || "image",
    etag: data.etag,
    sha256: sha256 || undefined,
    width: data.width,
    height: data.height,
    captured_at: data.captured_at || new Date().toISOString(),
    analysis_status: "queued",
    analysis_error: null,
  });

  await logStep(data.property_id, asset.id, "upload", "Uploaded to Cloudinary", `${data.cloudinary_public_id}${sha256 ? ` · sha256 ${sha256.slice(0, 8)}…` : ""}`);

  // 4. Trigger asynchronous analysis (non-blocking, but kept alive by the host)
  scheduleAnalysis(asset.id);

  return asset;
}

/** An asset that has been queued/running longer than this is considered stalled. */
export const STALL_AFTER_MS = 4 * 60 * 1000;

const inFlight = new Set<string>();

/**
 * Runs analysis after the response is sent. Inside a Next.js request, `after()` tells the
 * host (Vercel etc.) to keep the function alive until the work finishes — plain
 * fire-and-forget gets killed mid-run there. Outside a request (scripts, tests) it just runs.
 */
export function scheduleAnalysis(assetId: string): void {
  const work = () =>
    runAnalysisForAsset(assetId).catch((err) => {
      console.error(`[Pipeline] Background analysis failed for asset ${assetId}:`, err);
    });
  try {
    after(work);
  } catch {
    void work();
  }
}

/**
 * Re-queues assets whose analysis never finished (process restarted, host killed the run).
 * Safe to call on every read: only touches assets past STALL_AFTER_MS that are not being
 * analysed by this process right now.
 */
export async function recoverStalledAssets(
  assets: Array<Pick<Asset, "id" | "analysis_status" | "created_at">>
): Promise<number> {
  const db = getDatabase();
  const now = Date.now();
  let recovered = 0;
  for (const a of assets) {
    if (a.analysis_status !== "queued" && a.analysis_status !== "running") continue;
    if (inFlight.has(a.id)) continue;
    if (now - new Date(a.created_at).getTime() < STALL_AFTER_MS) continue;
    await db.updateAssetStatus(a.id, "queued", null);
    scheduleAnalysis(a.id);
    recovered++;
  }
  if (recovered > 0) console.log(`[Pipeline] Re-queued ${recovered} stalled asset(s).`);
  return recovered;
}

/**
 * Idempotent AI analysis runner.
 * Runs only if asset.analysis_status === 'queued'.
 */
export async function runAnalysisForAsset(assetId: string): Promise<void> {
  const db = getDatabase();
  const media = getMediaProvider();

  if (inFlight.has(assetId)) {
    console.log(`[Pipeline] Analysis already running for ${assetId} in this process; skipping.`);
    return;
  }

  const asset = await db.getAssetById(assetId);
  if (!asset) {
    console.warn(`[Pipeline] Cannot analyze missing asset: ${assetId}`);
    return;
  }

  // Strictly enforce one analysis run (idempotency)
  if (asset.analysis_status !== "queued") {
    console.log(
      `[Pipeline] Skipping analysis for asset ${assetId}; status is already '${asset.analysis_status}'`
    );
    return;
  }

  const startTime = Date.now();
  console.log(`[Pipeline] Starting AI analysis for asset: ${asset.cloudinary_public_id}`);

  // Transition to 'running'
  inFlight.add(asset.id);
  await db.updateAssetStatus(asset.id, "running");
  const propertyId = await propertyIdForInspection(asset.inspection_id).catch(() => null);

  // Perceptual fingerprint + face count from Cloudinary; flags a re-used photo.
  if (propertyId && asset.cloudinary_public_id) {
    const fp = await fingerprintAsset(propertyId, asset.id, asset.cloudinary_public_id, asset.sha256);
    if (fp?.reused_of) {
      await logStep(propertyId, asset.id, "fingerprint", "Re-used photo detected", fp.distance === 0 && fp.mad === 0 ? `Byte-identical to ${fp.reused_of}` : `Same image as ${fp.reused_of} (hash distance ${fp.distance} bits, pixel difference ${fp.mad})`);
    }
  }

  try {
    // Resolved inside the try so a missing key marks the asset failed instead of leaving it queued.
    const vision = getVisionProvider();

    // Generate resized Cloudinary copy for VLM (cost control: c_limit,w_1024,q_auto,f_jpg)
    const resizedUrl = media.vlmCopy(asset.cloudinary_public_id || asset.secure_url);

    // Call VLM
    const analysis = await vision.analyzeImage({
      imageUrl: resizedUrl,
      roomHint: asset.room_guess || undefined,
    });

    // Ground the model's findings on pixels that actually changed since the previous photo.
    let items: ObservationItem[] = analysis.observations;
    let groundingDetail = "";
    try {
      const g = await groundFindings(asset, analysis.observations);
      if (g) {
        const unexplained = [...g.unexplained]
          .sort((a, b) => (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1]) - (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]))
          .slice(0, MAX_UNEXPLAINED);
        items = [...g.observations.map(({ grounded: _g, ...o }) => o), ...unexplained];
        groundingDetail = ` · ${g.observations.filter((o) => o.grounded).length}/${g.observations.length} snapped to changed pixels, ${unexplained.length} unexplained change(s)`;
      }
    } catch (gErr) {
      console.warn(`[Pipeline] Grounding skipped for ${asset.cloudinary_public_id}:`, gErr);
    }

    // Save observations
    const saved: { id: string; bbox: ObservationItem["bbox"]; unsure: boolean }[] = [];
    for (const obs of items) {
      const created = await db.createObservation({
        asset_id: asset.id,
        category: obs.category,
        sub_area: obs.sub_area,
        description: obs.description,
        confidence: obs.confidence,
        bbox: obs.bbox,
        review_status: "pending",
        source: "ai",
      });
      saved.push({ id: created.id, bbox: created.bbox, unsure: !!obs.unsure });
    }

    // Could the model judge this photo at all, and which findings was it unsure about.
    if (propertyId) {
      const cannot = analysis.can_assess === false || analysis.image_quality !== "ok";
      await appendEvent({
        property_id: propertyId, type: "assessment", resource_id: asset.id, actor_id: null, actor_name: "RentalMove", actor_role: "system",
        payload: { can_assess: !cannot, note: cannot ? analysis.assess_note ?? QUALITY_NOTE[analysis.image_quality] ?? null : null, unsure: saved.filter((s) => s.unsure).map((s) => s.id) },
      }).catch(() => {});
    }
    // Which room areas this photo shows (feeds the per-room checklist).
    if (propertyId && analysis.visible_areas) {
      await appendEvent({ property_id: propertyId, type: "coverage", resource_id: asset.id, actor_id: null, actor_name: "RentalMove", actor_role: "system", payload: { areas: analysis.visible_areas } }).catch(() => {});
    }
    // Pixel size of each finding now and at the same spot in the previous photo (trend).
    if (propertyId && saved.length) {
      try {
        await measureObservations(propertyId, asset, saved);
      } catch (mErr) {
        console.warn(`[Pipeline] Measuring skipped for ${asset.cloudinary_public_id}:`, mErr);
      }
    }

    // Transition asset status to 'done'
    await db.updateAssetStatus(
      asset.id,
      "done",
      null,
      analysis.room_guess,
      analysis.image_quality
    );

    const duration = Date.now() - startTime;
    console.log(
      `[Pipeline] Analysis done in ${duration}ms for ${asset.cloudinary_public_id}. Observations: ${items.length}`
    );
    await logStep(propertyId, asset.id, "analyze", `${items.length} finding${items.length === 1 ? "" : "s"}`, `${(duration / 1000).toFixed(1)} s${groundingDetail}`);

    // Update Cloudinary structured metadata via Admin API
    const primaryObs = items[0];
    const allowedRooms = ["living_room", "kitchen", "bathroom", "bedroom", "exterior"];
    await media.updateMetadata(asset.cloudinary_public_id, {
      room: allowedRooms.includes(analysis.room_guess) ? analysis.room_guess : undefined,
      issue_category: primaryObs ? primaryObs.category : "none",
      ai_confidence: primaryObs ? Math.round(primaryObs.confidence * 100) : 100,
      review_status: "pending",
    });

    // Write tags back to Cloudinary so new uploads are searchable by issue type and review status
    try {
      const desiredTags = computeManagedTags(items.map((o) => ({ category: o.category, review_status: "pending" })));
      await media.syncManagedTags(asset.cloudinary_public_id, desiredTags);
    } catch (tagErr) {
      console.warn(`[Pipeline] Could not sync tags to Cloudinary for ${asset.cloudinary_public_id}:`, tagErr);
    }
  } catch (err: any) {
    const duration = Date.now() - startTime;
    console.error(`[Pipeline] Analysis error after ${duration}ms:`, err);

    let status: AnalysisStatus = "failed";
    let stepSummary = "Analysis failed";
    const errMsg = String(err?.message || err);

    const isQuota =
      err instanceof VisionQuotaError ||
      err?.isQuotaLimited === true ||
      /quota|tpd|daily token limit|rate limit.*exceeded/i.test(errMsg);

    const isRetryable =
      err instanceof VisionRetryableError ||
      err?.isRetryable === true ||
      /network|econnrefused|econnreset|etimedout|5\d\d/i.test(errMsg);

    if (isQuota) {
      status = "quota_limited";
      stepSummary = "AI quota limited";
    } else if (isRetryable) {
      status = "retryable";
      stepSummary = "Analysis retryable";
    }

    // Graceful failure: mark asset with clear state so UI and retry logic know what happened
    await db.updateAssetStatus(asset.id, status, errMsg);
    await logStep(propertyId, asset.id, "analyze", stepSummary, errMsg.slice(0, 160));
  } finally {
    inFlight.delete(asset.id);
  }
}
