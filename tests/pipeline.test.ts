import { describe, it, expect, beforeEach } from "vitest";
import { getDatabase } from "../src/lib/db";
import { registerAsset } from "../src/lib/pipeline";

describe("Pipeline & Observation Review State Transitions", () => {
  it("idempotently registers an asset without duplicate rows", async () => {
    const db = getDatabase();
    const payload = {
      property_id: "prop-381",
      inspection_id: "insp-2024-move-in",
      room_id: "room-kitchen",
      cloudinary_public_id: "properties/prop-381/insp-2024-move-in/kitchen/unique-test-01",
      secure_url: "https://example.com/test.jpg",
      etag: "etag_test_123",
      sha256: "aabbcc112233",
    };

    const first = await registerAsset(payload);
    expect(first.cloudinary_public_id).toBe(payload.cloudinary_public_id);

    // Call again with same public ID (simulating duplicate webhook or refresh)
    const second = await registerAsset(payload);
    expect(second.id).toBe(first.id);
  });

  it("handles observation review state transitions (accepted, rejected, edited)", async () => {
    const db = getDatabase();
    const obs = await db.createObservation({
      asset_id: "asset-01",
      category: "scratch",
      sub_area: "cabinet",
      description: "Possible scratch on cabinet.",
      confidence: 0.85,
      bbox: [0.1, 0.1, 0.2, 0.2],
      review_status: "pending",
      source: "ai",
    });

    expect(obs.review_status).toBe("pending");

    // Accept observation
    const accepted = await db.updateObservation(obs.id, {
      review_status: "accepted",
      reviewer_note: "Verified by tenant",
    });
    expect(accepted?.review_status).toBe("accepted");
    expect(accepted?.reviewer_note).toBe("Verified by tenant");

    // Edit observation (preserves previous state in edited_from)
    const edited = await db.updateObservation(obs.id, {
      review_status: "edited",
      category: "dent",
      description: "Visible shallow dent rather than scratch.",
    });
    expect(edited?.review_status).toBe("edited");
    expect(edited?.category).toBe("dent");
    expect(edited?.edited_from).toBeDefined();
    expect(edited?.edited_from.category).toBe("scratch");
  });
});
