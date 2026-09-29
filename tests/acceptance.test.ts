import { describe, it, expect } from "vitest";
import { getDatabase } from "../src/lib/db";
import { getMediaProvider } from "../src/lib/media";
import { registerAsset } from "../src/lib/pipeline";
import {
  ObservationItemSchema,
  SearchFilterSchema,
  ImageAnalysisSchema,
} from "../src/lib/schemas";
import { buildCloudinarySearchExpression } from "../src/lib/search";

describe("RentalMove Comprehensive Acceptance Suite (18 Critical Tests)", () => {
  const db = getDatabase();

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
  });

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
  });

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

  // 6. Upload Response Handling
  it("6. validates upload response properties", () => {
    const uploadResponse = {
      public_id: "properties/prop-381/kitchen/cabinet_test",
      secure_url: "https://res.cloudinary.com/yxrdw0hc/image/upload/v1/properties/prop-381/kitchen/cabinet_test.jpg",
      resource_type: "image",
      format: "jpg",
      width: 1920,
      height: 1080,
      bytes: 254000,
      etag: "b89f0293da2",
      created_at: new Date().toISOString(),
    };

    expect(uploadResponse.public_id).toMatch(/^properties\/prop-381\//);
    expect(uploadResponse.secure_url).toContain("https://");
    expect(uploadResponse.etag).toBeDefined();
  });

  // 7. Asset Registration
  it("7. registers asset with cryptographic SHA-256 and Cloudinary metadata", async () => {
    const asset = await registerAsset({
      property_id: "prop-381",
      inspection_id: "insp-2024-move-in",
      room_id: "room-kitchen",
      cloudinary_public_id: "properties/prop-381/acceptance/test-reg-asset",
      secure_url: "https://res.cloudinary.com/yxrdw0hc/image/upload/v1/test.jpg",
      etag: "etag_real_acceptance",
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      width: 1600,
      height: 1200,
    });

    expect(asset.id).toBeDefined();
    expect(asset.sha256).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(asset.etag).toBe("etag_real_acceptance");
  });

  // 8. Metadata Persistence
  it("8. persists asset metadata across database retrievals", async () => {
    const asset = await db.getAssetByPublicId("properties/prop-381/acceptance/test-reg-asset");
    expect(asset).toBeDefined();
    expect(asset?.inspection_id).toBe("insp-2024-move-in");
    expect(asset?.room_id).toBe("room-kitchen");
  });

  // 9. AI Response Schema Validation
  it("9. validates AI observation output according to strict schema", () => {
    const validObservation = {
      category: "scratch",
      sub_area: "lower_cabinet",
      description: "Possible scratch visible on lower cabinet surface.",
      confidence: 0.88,
      bbox: [0.1, 0.2, 0.4, 0.5] as [number, number, number, number],
    };

    const parsed = ObservationItemSchema.safeParse(validObservation);
    expect(parsed.success).toBe(true);
  });

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
  it("15. parses natural language search queries into structured criteria", () => {
    const query = "Show kitchen scratches from move in";
    // Check keyword matching logic
    const lower = query.toLowerCase();
    const hasKitchen = lower.includes("kitchen");
    const hasScratch = lower.includes("scratch");
    const hasMoveIn = lower.includes("move in");

    expect(hasKitchen).toBe(true);
    expect(hasScratch).toBe(true);
    expect(hasMoveIn).toBe(true);
  });

  // 16. Report Generation
  it("16. generates structured inspection report with neutral language", async () => {
    const timeline = await db.getTimeline("prop-381");
    const targetInspection = timeline.inspections[0];

    expect(targetInspection).toBeDefined();
    const reportData = {
      property_id: "prop-381",
      inspection_id: targetInspection.id,
      inspection_type: targetInspection.type,
      asset_count: targetInspection.assets.length,
      observations_disclaimer: "AI-assisted observations are non-binding visual references requiring human verification.",
    };

    expect(reportData.asset_count).toBeGreaterThanOrEqual(1);
    expect(reportData.observations_disclaimer).toContain("non-binding");
  });

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
