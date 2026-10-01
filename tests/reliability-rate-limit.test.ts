import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  MemoryRateLimitStore,
  UpstashRedisRateLimitStore,
  rateLimit,
  rateLimitSync,
  authRateLimit,
  setRateLimitStore,
} from "@/lib/rate-limit";
import {
  VisionError,
  VisionQuotaError,
  VisionRetryableError,
  getVisionProvider,
  MockVisionProvider,
} from "@/lib/vision";
import { recoverStalledAssets } from "@/lib/pipeline";
import {
  buildPropertyContext,
  RuleBasedAssistantProvider,
  getAssistantProvider,
} from "@/lib/assistant";
import { setView, clearView } from "@/lib/view";

describe("Phase 10 — Reliability, Rate Limiting & AI Failure Handling", () => {
  describe("Rate Limit Store & Limiter", () => {
    let memoryStore: MemoryRateLimitStore;

    beforeEach(() => {
      memoryStore = new MemoryRateLimitStore();
      setRateLimitStore(memoryStore);
    });

    afterEach(() => {
      memoryStore.destroy();
      setRateLimitStore(null);
    });

    it("MemoryRateLimitStore allows requests up to limit and rejects exceeding requests", () => {
      const store = new MemoryRateLimitStore();
      const key = "test:client:1";

      const r1 = store.consume(key, 2, 60_000);
      expect(r1.success).toBe(true);
      expect(r1.remaining).toBe(1);

      const r2 = store.consume(key, 2, 60_000);
      expect(r2.success).toBe(true);
      expect(r2.remaining).toBe(0);

      const r3 = store.consume(key, 2, 60_000);
      expect(r3.success).toBe(false);
      expect(r3.remaining).toBe(0);
      expect(r3.retryAfterSecs).toBeGreaterThanOrEqual(1);

      store.destroy();
    });

    it("rateLimit returns 429 response when limit is exceeded", async () => {
      const req = new NextRequest("http://localhost/api/test", {
        headers: { "x-forwarded-for": "192.168.1.50" },
      });

      const res1 = await rateLimit(req, { limit: 1, windowMs: 60_000, prefix: "test-route" });
      expect(res1.success).toBe(true);

      const res2 = await rateLimit(req, { limit: 1, windowMs: 60_000, prefix: "test-route" });
      expect(res2.success).toBe(false);
      if (!res2.success) {
        expect(res2.response.status).toBe(429);
        expect(res2.response.headers.get("Retry-After")).toBeDefined();
        expect(res2.response.headers.get("X-RateLimit-Limit")).toBe("1");
      }
    });

    it("rateLimitSync works synchronously with memory store", () => {
      const req = new NextRequest("http://localhost/api/test-sync", {
        headers: { "x-real-ip": "10.0.0.99" },
      });

      const res1 = rateLimitSync(req, { limit: 1, windowMs: 60_000, prefix: "sync-test" });
      expect(res1.success).toBe(true);

      const res2 = rateLimitSync(req, { limit: 1, windowMs: 60_000, prefix: "sync-test" });
      expect(res2.success).toBe(false);
    });

    it("UpstashRedisRateLimitStore gracefully falls back to memory on network failure", async () => {
      // Point to an invalid endpoint that will fail fetch
      const store = new UpstashRedisRateLimitStore("https://invalid-non-existent-redis-domain.example", "bad-token");
      const key = "redis:client:fallback";

      const res = await store.consume(key, 5, 60_000);
      // Fallback memory store handles it safely without crashing
      expect(res.success).toBe(true);
      expect(res.remaining).toBe(4);
    });
  });

  describe("Vision Error Hierarchy & Failure Classification", () => {
    it("VisionQuotaError and VisionRetryableError correctly subclass VisionError", () => {
      const quotaErr = new VisionQuotaError("Groq daily token limit reached");
      expect(quotaErr).toBeInstanceOf(VisionError);
      expect(quotaErr).toBeInstanceOf(Error);
      expect(quotaErr.isQuotaLimited).toBe(true);
      expect(quotaErr.isRetryable).toBe(false);
      expect(quotaErr.name).toBe("VisionQuotaError");

      const retryErr = new VisionRetryableError("Connection timeout");
      expect(retryErr).toBeInstanceOf(VisionError);
      expect(retryErr.isRetryable).toBe(true);
      expect(retryErr.isQuotaLimited).toBe(false);
      expect(retryErr.name).toBe("VisionRetryableError");
    });

    it("getVisionProvider throws VisionError when unconfigured and VISION_PROVIDER!=mock", () => {
      const prevMock = process.env.VISION_PROVIDER;
      const prevGroq = process.env.GROQ_API_KEY;
      const prevXai = process.env.XAI_API_KEY;

      delete process.env.VISION_PROVIDER;
      delete process.env.GROQ_API_KEY;
      delete process.env.XAI_API_KEY;

      try {
        expect(() => getVisionProvider()).toThrow(VisionError);
      } finally {
        if (prevMock) process.env.VISION_PROVIDER = prevMock;
        if (prevGroq) process.env.GROQ_API_KEY = prevGroq;
        if (prevXai) process.env.XAI_API_KEY = prevXai;
      }
    });
  });

  describe("Stalled Asset Recovery Quota Protection", () => {
    it("recoverStalledAssets does NOT re-queue quota_limited or failed assets", async () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const assets = [
        { id: "asset-stalled-queued", analysis_status: "queued" as const, created_at: tenMinutesAgo },
        { id: "asset-stalled-running", analysis_status: "running" as const, created_at: tenMinutesAgo },
        { id: "asset-quota-limited", analysis_status: "quota_limited" as const, created_at: tenMinutesAgo },
        { id: "asset-failed", analysis_status: "failed" as const, created_at: tenMinutesAgo },
      ];

      const recovered = await recoverStalledAssets(assets);
      // Only the queued and running stalled assets are re-queued; quota_limited and failed are NOT
      expect(recovered).toBe(2);
    });
  });

  describe("Assistant Architecture & Explicit Provenance", () => {
    afterEach(() => {
      clearView();
    });

    it("RuleBasedAssistantProvider returns explicit engine and provenance metadata", () => {
      const provider = new RuleBasedAssistantProvider();
      expect(provider.capability).toBe("rule-based");

      // Test with unhydrated view
      clearView();
      const unhydrated = provider.answer("What is the AI not sure about?", {
        observations: [],
        stances: {},
        threads: {},
      });
      expect(unhydrated.engine).toBe("rule-based");
      expect(unhydrated.provenance).toBe("grounded_snapshot");

      const mockView: any = {
        property: { id: "p1", address_label: "123 Main St", unit_label: "Unit 1", status: "active" },
        properties: [],
        rooms: [{ id: "r1", property_id: "p1", name: "Kitchen", category: "kitchen" }],
        inspections: [{ id: "i1", property_id: "p1", type: "move_in", captured_at: "2026-01-01", status: "completed", captured_by: "u1" }],
        assets: [],
        observations: [],
        comparisons: [],
        user: { id: "u1", name: "User", email: "u@test.com", role: "owner", initials: "U" },
        events: [],
        shareLinks: [],
        stances: {},
        threads: {},
        signatures: {},
        report: { baseline_inspection_id: null, current_inspection_id: null, content_hash: "" },
        meta: { generated_at: "", event_store: "local" },
        calibrations: {},
        measures: {},
        workOrders: {},
        coverage: {},
        assessments: {},
      };

      // Test with hydrated view
      setView(mockView);

      const res = provider.answer("What is the AI not sure about?", {
        observations: [],
        stances: {},
        threads: {},
      });

      expect(res.engine).toBe("rule-based");
      expect(res.provenance).toBe("grounded_snapshot");
      expect(Array.isArray(res.blocks)).toBe(true);
    });

    it("buildPropertyContext extracts structured context summary", () => {
      // Unhydrated view
      clearView();
      const unhydratedSummary = buildPropertyContext({
        observations: [],
        stances: {},
        threads: {},
      });
      expect(unhydratedSummary.roomsCount).toBe(0);

      // Hydrated view
      const mockView: any = {
        property: { id: "p1", address_label: "123 Main St", unit_label: "Unit 1", status: "active" },
        properties: [],
        rooms: [{ id: "r1", property_id: "p1", name: "Kitchen", category: "kitchen" }],
        inspections: [{ id: "i1", property_id: "p1", type: "move_in", captured_at: "2026-01-01", status: "completed", captured_by: "u1" }],
        assets: [],
        observations: [],
        comparisons: [],
        user: { id: "u1", name: "User", email: "u@test.com", role: "owner", initials: "U" },
        events: [],
        shareLinks: [],
        stances: {},
        threads: {},
        signatures: {},
        report: { baseline_inspection_id: null, current_inspection_id: null, content_hash: "" },
        meta: { generated_at: "", event_store: "local" },
        calibrations: {},
        measures: {},
        workOrders: {},
        coverage: {},
        assessments: {},
      };
      setView(mockView);

      const summary = buildPropertyContext({
        observations: [],
        stances: {},
        threads: {},
      });

      expect(summary.roomsCount).toBe(1);
      expect(summary.inspectionsCount).toBe(1);
      expect(typeof summary.summary).toBe("string");
    });
  });
});
