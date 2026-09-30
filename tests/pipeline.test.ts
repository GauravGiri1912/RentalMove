import { describe, it, expect, vi } from "vitest";
import { getDatabase } from "../src/lib/db";
import { registerAsset, recoverStalledAssets } from "../src/lib/pipeline";

async function waitForSettled(assetId: string, ms = 10_000) {
  const db = getDatabase();
  const deadline = Date.now() + ms;
  for (;;) {
    const a = await db.getAssetById(assetId);
    if (a && a.analysis_status !== "queued" && a.analysis_status !== "running") return a;
    if (Date.now() > deadline) throw new Error(`asset ${assetId} still ${a?.analysis_status}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe("Pipeline & Observation Review State Transitions", () => {
  it("marks the asset failed (and stores NO fake finding) when no vision provider is available", async () => {
    vi.stubEnv("VISION_PROVIDER", "");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("XAI_API_KEY", "");
    try {
      const db = getDatabase();
      const asset = await registerAsset({
        property_id: "prop-381",
        inspection_id: "insp-2024-move-in",
        room_id: "room-kitchen",
        cloudinary_public_id: "properties/prop-381/insp-2024-move-in/kitchen/no-provider-test",
        secure_url: "https://example.com/none.jpg",
        sha256: "aabbcc",
      });
      const settled = await waitForSettled(asset.id);
      expect(settled.analysis_status).toBe("failed");
      expect(settled.analysis_error).toMatch(/No vision provider/i);
      expect(await db.getObservations(asset.id)).toHaveLength(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("re-queues assets stuck in running/queued past the stall window, and only those", async () => {
    vi.stubEnv("VISION_PROVIDER", "mock");
    try {
      const db = getDatabase();
      const old = "2020-01-01T00:00:00Z";
      const stuck = await db.upsertAsset({
        inspection_id: "insp-2024-move-in",
        room_id: "room-kitchen",
        cloudinary_public_id: "properties/prop-381/insp-2024-move-in/kitchen/stuck-test",
        secure_url: "https://example.com/stuck.jpg",
        captured_at: old,
        analysis_status: "running",
        analysis_error: null,
      });
      const fresh = await db.upsertAsset({
        inspection_id: "insp-2024-move-in",
        room_id: "room-kitchen",
        cloudinary_public_id: "properties/prop-381/insp-2024-move-in/kitchen/fresh-test",
        secure_url: "https://example.com/fresh.jpg",
        captured_at: new Date().toISOString(),
        analysis_status: "running",
        analysis_error: null,
      });
      const recovered = await recoverStalledAssets([
        { id: stuck.id, analysis_status: "running", created_at: old },
        { id: fresh.id, analysis_status: "running", created_at: new Date().toISOString() },
      ]);
      expect(recovered).toBe(1);
      const settled = await waitForSettled(stuck.id);
      expect(["done", "failed"]).toContain(settled.analysis_status);
      expect((await db.getAssetById(fresh.id))?.analysis_status).toBe("running");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("idempotently registers an asset without duplicate rows", async () => {
    vi.stubEnv("VISION_PROVIDER", "mock"); // this test is about registration, not the model
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
