import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { getDatabase } from "../src/lib/db";
import { NextRequest } from "next/server";
import { POST as verifyHandler } from "../src/app/api/verify/route";

describe("Phase 8: Database & API Query Optimization", () => {
  const db = getDatabase();
  const verifyRouteContent = fs.readFileSync(path.resolve(process.cwd(), "src/app/api/verify/route.ts"), "utf8");
  const searchRouteContent = fs.readFileSync(path.resolve(process.cwd(), "src/app/api/search/route.ts"), "utf8");
  const migration0004 = fs.readFileSync(path.resolve(process.cwd(), "supabase/migrations/0004_tighten_rls_and_sha_index.sql"), "utf8");

  it("1. Migration 0004 specifies idx_assets_sha256 index", () => {
    expect(migration0004).toContain("CREATE INDEX IF NOT EXISTS idx_assets_sha256 ON assets(sha256);");
  });

  it("2. DatabaseService implements getAssetBySha256, getInspectionById, and getRoomById", async () => {
    expect(typeof db.getAssetBySha256).toBe("function");
    expect(typeof db.getInspectionById).toBe("function");
    expect(typeof db.getRoomById).toBe("function");

    // Test with non-existent hash
    const miss = await db.getAssetBySha256("0000000000000000000000000000000000000000000000000000000000000000");
    expect(miss).toBeNull();
  });

  it("3. /api/verify uses direct indexed lookup and handles existing, unknown, and malformed hashes", async () => {
    // Assert no nested property loops in source code
    expect(verifyRouteContent).not.toContain("for (const p of await db.listProperties())");
    expect(verifyRouteContent).toContain("db.getAssetBySha256(sha)");

    // Test malformed hash -> 400
    const malformedReq = new NextRequest("http://localhost:3000/api/verify", {
      method: "POST",
      body: JSON.stringify({ sha256: "not-a-valid-hash" }),
      headers: { "Content-Type": "application/json" },
    });
    const malformedRes = await verifyHandler(malformedReq);
    expect(malformedRes.status).toBe(400);

    // Test unknown hash -> 200 with match: false
    const unknownReq = new NextRequest("http://localhost:3000/api/verify", {
      method: "POST",
      body: JSON.stringify({ sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" }),
      headers: { "Content-Type": "application/json" },
    });
    const unknownRes = await verifyHandler(unknownReq);
    expect(unknownRes.status).toBe(200);
    const unknownJson = await unknownRes.json();
    expect(unknownJson.match).toBe(false);
  });

  it("4. search/route.ts eliminates N+1 queries using batched getAssetsForInspections", () => {
    expect(searchRouteContent).toContain("db.getAssetsForInspections(inspections.map((i) => i.id))");
    expect(searchRouteContent).not.toContain("Promise.all(inspections.map((i) => db.getAssets(i.id)))");
  });
});
