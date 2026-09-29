import { getDatabase } from "./db";
import { getMediaProvider } from "./media";
import { getVisionProvider } from "./vision";
import { computeRemoteImageSha256 } from "./hash";
import { Asset, AssetRegisterRequest } from "./schemas";

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
    etag: data.etag,
    sha256: sha256 || undefined,
    width: data.width,
    height: data.height,
    captured_at: data.captured_at || new Date().toISOString(),
    analysis_status: "queued",
    analysis_error: null,
  });

  // 4. Trigger asynchronous analysis (non-blocking)
  runAnalysisForAsset(asset.id).catch((err) => {
    console.error(`[Pipeline] Background analysis failed for asset ${asset.id}:`, err);
  });

  return asset;
}

/**
 * Idempotent AI analysis runner.
 * Runs only if asset.analysis_status === 'queued'.
 */
export async function runAnalysisForAsset(assetId: string): Promise<void> {
  const db = getDatabase();
  const media = getMediaProvider();
  const vision = getVisionProvider();

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
  await db.updateAssetStatus(asset.id, "running");

  try {
    // Generate resized Cloudinary copy for VLM (cost control: c_limit,w_1024,q_auto,f_jpg)
    const resizedUrl = media.vlmCopy(asset.cloudinary_public_id || asset.secure_url);

    // Call VLM
    const analysis = await vision.analyzeImage({
      imageUrl: resizedUrl,
      roomHint: asset.room_guess || undefined,
    });

    // Save observations
    for (const obs of analysis.observations) {
      await db.createObservation({
        asset_id: asset.id,
        category: obs.category,
        sub_area: obs.sub_area,
        description: obs.description,
        confidence: obs.confidence,
        bbox: obs.bbox,
        review_status: "pending",
        source: "ai",
      });
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
      `[Pipeline] Analysis done in ${duration}ms for ${asset.cloudinary_public_id}. Observations: ${analysis.observations.length}`
    );

    // Update Cloudinary structured metadata via Admin API
    const primaryObs = analysis.observations[0];
    await media.updateMetadata(asset.cloudinary_public_id, {
      room: analysis.room_guess,
      issue_category: primaryObs ? primaryObs.category : "none",
      ai_confidence: primaryObs ? Math.round(primaryObs.confidence * 100) : 100,
      review_status: "pending",
    });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    console.error(`[Pipeline] Analysis error after ${duration}ms:`, err);

    // Graceful failure: mark asset failed but asset remains viewable and manually reviewable
    await db.updateAssetStatus(asset.id, "failed", err?.message || "Analysis failed");
  }
}
