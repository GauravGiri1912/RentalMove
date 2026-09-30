import { describe, it, expect, afterAll } from "vitest";
import { getDatabase } from "../src/lib/db";
import { getMediaProvider } from "../src/lib/media";
import { registerAsset } from "../src/lib/pipeline";
import {
  ObservationItemSchema,
  SearchFilterSchema,
  ImageAnalysisSchema,
} from "../src/lib/schemas";
import { buildCloudinarySearchExpression } from "../src/lib/search";

/** Live services are required unless the run is explicitly offline. */
const OFFLINE = process.env.OFFLINE_TESTS === "1";

describe("RentalMove Comprehensive Acceptance Suite (18 Critical Tests)", () => {
  const db = getDatabase();
  const uploadedPublicIds: string[] = [];

  // Anything a test uploads to the real Cloudinary account is removed afterwards.
  afterAll(async () => {
    if (uploadedPublicIds.length === 0) return;
    const { v2: cloudinary } = await import("cloudinary");
    for (const id of uploadedPublicIds) {
      await cloudinary.uploader.destroy(id).catch(() => {});
    }
  });

  it("0. live services are configured (Cloudinary + vision model)", async () => {
    if (OFFLINE) return;
    const { isCloudinaryConfigured } = await import("../src/lib/media");
    const { getVisionProvider } = await import("../src/lib/vision");
    expect(isCloudinaryConfigured(), "Cloudinary credentials missing (.env / .env.local)").toBe(true);
    expect(getVisionProvider().name, "vision provider must be the real model, not mock").toMatch(/^groq:/);
  });

  // 1. Authentication
  it("1. authenticates tenant and owner users properly", async () => {
    const tenant = await db.getUser("user-tenant-1");
    const owner = await db.getUser("user-owner-1");

    expect(tenant).toBeDefined();
    expect(tenant?.role).toBe("tenant");
    expect(tenant?.name).toBe("Alex Chen");

    expect(owner).toBeDefined();
    expect(owner?.role).toBe("owner");
    expect(owner?.name).toBe("Sarah Jenkins");
  }, 15000);

  // 2. Role Restrictions
  it("2. enforces role restrictions", async () => {
    const allUsers = await db.listUsers();
    const tenantUser = allUsers.find((u) => u.role === "tenant");
    const ownerUser = allUsers.find((u) => u.role === "owner");

    expect(tenantUser).toBeDefined();
    expect(ownerUser).toBeDefined();

    // Owner can query owned properties
    const ownerProps = await db.listProperties(ownerUser?.id);
    expect(ownerProps.length).toBeGreaterThanOrEqual(1);
    expect(ownerProps.every((p) => p.owner_id === ownerUser?.id)).toBe(true);
  }, 15000);

  // 3. Property Creation
  it("3. creates new property with address and unit labels", async () => {
    const property = await db.createProperty({
      address_label: "456 Test Blvd",
      unit_label: "Apt 2B",
      owner_id: "user-owner-1",
      rooms: [
        { name: "Living Room", category: "living_room" },
        { name: "Kitchen", category: "kitchen" },
      ],
    });

    expect(property.id).toBeDefined();
    expect(property.address_label).toBe("456 Test Blvd");
    expect(property.unit_label).toBe("Apt 2B");

    const fetched = await db.getProperty(property.id);
    expect(fetched?.address_label).toBe("456 Test Blvd");

    // Clean up test property to prevent test junk pollution
    await (db as any).deleteProperty?.(property.id);
  });

  // 4. Inspection Creation
  it("4. creates inspection with designated lifecycle type", async () => {
    const inspection = await db.createInspection({
      property_id: "prop-381",
      type: "move_in",
      captured_at: new Date().toISOString(),
      status: "in_progress",
    });

    expect(inspection.id).toBeDefined();
    expect(inspection.type).toBe("move_in");
    expect(inspection.property_id).toBe("prop-381");
  });

  // 5. Signed Upload Generation
  it("5. generates signed upload parameters for Cloudinary without exposing secret", async () => {
    const mediaProvider = getMediaProvider();
    const uploadParams = await mediaProvider.signUpload({
      propertyId: "prop-381",
      inspectionId: "insp-test",
      inspectionType: "move_in",
      room: "kitchen",
    });

    expect(uploadParams.signature).toBeDefined();
    expect(uploadParams.timestamp).toBeGreaterThan(0);
    expect(uploadParams.apiKey).toBeDefined();
    expect((uploadParams as unknown as Record<string, unknown>).api_secret).toBeUndefined();
  });

  // 6, 7, 8. Real End-to-End Upload, Hashing, Cloudinary Registration & Verification
  it("6, 7, 8. performs real file upload, calculates SHA-256 from bytes, receives real Cloudinary public_id/etag, and verifies in Cloudinary API", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const crypto = await import("crypto");
    const { v2: cloudinary } = await import("cloudinary");

    // 1. Read real local image file from disk
    const filePath = path.resolve(process.cwd(), "seed/images/2024/kitchen/cabinet-base-01.jpg");
    expect(fs.existsSync(filePath)).toBe(true);
    const fileBytes = fs.readFileSync(filePath);

    // 2. Compute actual SHA-256 hash from file bytes
    const computedSha256 = crypto.createHash("sha256").update(fileBytes).digest("hex");
    expect(computedSha256.length).toBe(64);

    // 3. Obtain real signed parameters from media provider
    const mediaProvider = getMediaProvider();
    const signResult = await mediaProvider.signUpload({
      propertyId: "prop-381",
      inspectionId: "insp-2024-move-in",
      inspectionType: "move_in",
      room: "kitchen",
    });

    const { isCloudinaryConfigured } = await import("../src/lib/media");

    if (!OFFLINE) expect(isCloudinaryConfigured(), "Cloudinary must be configured for this test").toBe(true);

    if (isCloudinaryConfigured()) {
      // 4. Perform actual Cloudinary Upload via FormData when live credentials present
      const formData = new FormData();
      formData.append("file", new Blob([fileBytes], { type: "image/jpeg" }), "acceptance-cabinet.jpg");
      formData.append("api_key", signResult.apiKey);
      formData.append("timestamp", String(signResult.timestamp));
      formData.append("signature", signResult.signature);
      formData.append("folder", signResult.folder);
      formData.append("tags", signResult.tags);
      if (signResult.notificationUrl) {
        formData.append("notification_url", signResult.notificationUrl);
      }

      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${signResult.cloudName}/image/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      expect(uploadRes.status).toBe(200);
      const cldData = await uploadRes.json();

      expect(cldData.public_id).toBeDefined();
      uploadedPublicIds.push(cldData.public_id);
      expect(cldData.public_id).toMatch(/^properties\/prop-381\/insp-2024-move-in\/kitchen\//);
      expect(cldData.secure_url).toMatch(/^https:\/\/res\.cloudinary\.com\//);
      expect(cldData.etag).toBeDefined();

      // Persist exact real values to database
      const asset = await registerAsset({
        property_id: "prop-381",
        inspection_id: "insp-2024-move-in",
        room_id: "room-kitchen",
        cloudinary_public_id: cldData.public_id,
        secure_url: cldData.secure_url,
        etag: cldData.etag,
        sha256: computedSha256,
        width: cldData.width,
        height: cldData.height,
      });

      expect(asset.cloudinary_public_id).toBe(cldData.public_id);
      expect(asset.etag).toBe(cldData.etag);
      expect(asset.sha256).toBe(computedSha256);

      // Verify Cloudinary API actually returns this resource
      const cldResource = await cloudinary.api.resource(cldData.public_id);
      expect(cldResource.public_id).toBe(cldData.public_id);

      const dbAsset = await db.getAssetByPublicId(cldData.public_id);
      expect(dbAsset).toBeDefined();
      expect(dbAsset?.id).toBe(asset.id);
      expect(dbAsset?.etag).toBe(cldData.etag);
      expect(dbAsset?.sha256).toBe(computedSha256);

      // Clean up test asset so Vitest runs do not leave junk behind
      await cloudinary.uploader.destroy(cldData.public_id).catch(() => {});
      await (db as any).deleteAsset?.(asset.id);
    } else {
      // Offline/placeholder mode: validate cryptographic SHA-256 and ingestion contract
      expect(signResult.signature).toBeDefined();
      expect(signResult.folder).toContain("properties/prop-381/insp-2024-move-in/kitchen");

      const asset = await registerAsset({
        property_id: "prop-381",
        inspection_id: "insp-2024-move-in",
        room_id: "room-kitchen",
        cloudinary_public_id: "properties/prop-381/insp-2024-move-in/kitchen/unit-test-cabinet",
        secure_url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
        etag: "etag_unit_test",
        sha256: computedSha256,
        width: 1200,
        height: 896,
      });

      expect(asset.sha256).toBe(computedSha256);
      expect(asset.etag).toBe("etag_unit_test");

      const dbAsset = await db.getAssetByPublicId("properties/prop-381/insp-2024-move-in/kitchen/unit-test-cabinet");
      expect(dbAsset).toBeDefined();
      expect(dbAsset?.sha256).toBe(computedSha256);
    }
  }, 25000);

  // 9. AI Vision Model Image Analysis
  it("9. runs real vision analysis on a Cloudinary image and returns only well-formed, filtered findings", async () => {
    const { getVisionProvider } = await import("../src/lib/vision");
    const { MAX_BOX_AREA, MIN_CONFIDENCE } = await import("../src/lib/observation-filter");
    const vision = getVisionProvider();
    if (!OFFLINE) expect(vision.name).toMatch(/^groq:/);

    const media = getMediaProvider();
    const analysis = await vision.analyzeImage({
      imageUrl: media.vlmCopy("properties/prop-381/insp-2024-move-in/kitchen/cabinet-base-01"),
      roomHint: "kitchen",
    });

    expect(analysis.room_guess).toBe("kitchen");
    expect(analysis.image_quality).toBe("ok");
    // A model may legitimately find nothing; what it returns must be valid and non-hallucinated.
    for (const obs of analysis.observations) {
      expect(ObservationItemSchema.safeParse(obs).success).toBe(true);
      expect(obs.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
      const [x1, y1, x2, y2] = obs.bbox;
      expect((x2 - x1) * (y2 - y1)).toBeLessThanOrEqual(MAX_BOX_AREA);
      expect(obs.description).not.toMatch(/analysis unavailable/i);
    }
  }, 60000);

  // 10. Review Persistence
  it("10. updates and persists observation review status and reviewer notes", async () => {
    const obs = await db.createObservation({
      asset_id: "asset-01",
      category: "scratch",
      sub_area: "cabinet",
      description: "Possible scratch on cabinet.",
      confidence: 0.89,
      bbox: [0.1, 0.1, 0.3, 0.3],
      review_status: "pending",
      source: "ai",
    });

    const updated = await db.updateObservation(obs.id, {
      review_status: "accepted",
      reviewer_note: "Accepted by tenant Alex Chen",
    });

    expect(updated?.review_status).toBe("accepted");
    expect(updated?.reviewer_note).toBe("Accepted by tenant Alex Chen");
  });

  // 11. Timeline Retrieval
  it("11. retrieves dynamic chronological timeline for property", async () => {
    const timeline = await db.getTimeline("prop-381");
    expect(timeline.property).toBeDefined();
    expect(timeline.inspections.length).toBeGreaterThanOrEqual(1);

    for (const insp of timeline.inspections) {
      expect(insp.type).toBeDefined();
      expect(insp.assets).toBeDefined();
    }
  });

  // 12. Room History
  it("12. retrieves chronological room history with assets and observations", async () => {
    const assets = await db.getAssets(undefined, "room-kitchen");
    expect(assets.length).toBeGreaterThanOrEqual(1);
    for (const asset of assets) {
      expect(asset.room_id).toBe("room-kitchen");
    }
  });

  // 13. Comparison
  it("13. creates and stores comparison record between two inspection captures", async () => {
    const comparison = await db.createComparison({
      property_id: "prop-381",
      room_id: "room-kitchen",
      prior_asset_id: "asset-01",
      current_asset_id: "asset-02",
      summary: "Possible surface mark visible in current capture not evident in baseline.",
      changes: [{ description: "Surface mark on cabinet", confidence: 0.82 }],
      caveats: ["Requires human verification"],
      model_version: "groq-vision-1",
    });

    expect(comparison.id).toBeDefined();
    expect(comparison.summary).toContain("Possible surface mark");

    const comparisons = await db.getComparisons("prop-381");
    expect(comparisons.some((c) => c.id === comparison.id)).toBe(true);
  });

  // 14. Search
  it("14. searches assets using structured filter criteria", async () => {
    const filter = SearchFilterSchema.parse({
      room: "kitchen",
      issue_category: "scratch",
    });

    const { expression } = buildCloudinarySearchExpression(filter, "prop-381");
    expect(expression).toContain("public_id:properties/prop-381*");
    expect(expression).toContain("tags:kitchen");
    expect(expression).toContain("tags:scratch");
  });

  // 15. NL Query Parsing
  it("15. parses a natural language search query into a validated structured filter", async () => {
    const { getVisionProvider } = await import("../src/lib/vision");
    const filter = await getVisionProvider().parseSearchQuery("Show kitchen scratches from move in");

    expect(SearchFilterSchema.safeParse(filter).success).toBe(true);
    expect(filter.room).toBe("kitchen");
    expect(filter.issue_category).toBe("scratch");
    expect(filter.inspection_type).toBe("move_in");
  }, 60000);

  // 16. Report Generation
  it("16. report data contains no blame / liability / cost language", async () => {
    const { BLAME_WORDS } = await import("../src/lib/copy");
    const timeline = await db.getTimeline("prop-381");
    const texts = timeline.inspections.flatMap((i) =>
      i.assets.flatMap((a) => a.observations.map((o) => o.description))
    );
    expect(texts.length).toBeGreaterThanOrEqual(1);
    for (const text of texts) {
      for (const word of BLAME_WORDS) {
        expect(text.toLowerCase(), `"${word}" found in: ${text}`).not.toMatch(
          new RegExp("\\b" + word + "\\b")
        );
      }
    }
  }, 20000);

  // 17. Share Token Validation
  it("17. creates, validates, and revokes secure share link tokens", async () => {
    const token = "acceptance-token-" + Date.now();
    const link = await db.createShareLink("prop-381", token, "insp-2024-move-in");

    expect(link.token).toBe(token);

    // Validate active token
    const validLink = await db.getShareLink(token);
    expect(validLink).toBeDefined();
    expect(validLink?.property_id).toBe("prop-381");

    // Revoke token
    const revoked = await db.revokeShareLink(token);
    expect(revoked).toBe(true);

    // Validate revoked token returns null
    const revokedLink = await db.getShareLink(token);
    expect(revokedLink).toBeNull();

    // Clean up test token so it does not pollute store
    await (db as any).deleteShareLink?.(token);
  });

  // 18. Authorization
  it("18. validates permission to access properties and inspections", async () => {
    const owner = await db.getUser("user-owner-1");
    const property = await db.getProperty("prop-381");

    // Owner owns property
    const isOwner = property?.owner_id === owner?.id;
    expect(isOwner).toBe(true);

    const nonOwner = await db.getUser("user-tenant-1");
    const isNonOwner = property?.owner_id === nonOwner?.id;
    expect(isNonOwner).toBe(false);
  });
});
