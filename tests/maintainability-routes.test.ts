import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET as getReport } from "@/app/api/report/[token]/route";
import { GET as getShare, DELETE as deleteShare } from "@/app/api/share/[token]/route";

describe("Phase 11 — Maintainability & Route Canonicalization", () => {
  it("GET /api/report/:token redirects to canonical /api/share/:token with 307 and Deprecation headers", async () => {
    const testToken = "test-token-xyz-123";
    const req = new NextRequest(`http://localhost:3000/api/report/${testToken}`);
    const params = Promise.resolve({ token: testToken });

    const response = await getReport(req, { params });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(`/api/share/${testToken}`);
    expect(response.headers.get("deprecation")).toBe("true");
    expect(response.headers.get("link")).toContain(`rel="canonical"`);
  });

  it("GET /api/share/:token returns 404 for invalid/expired tokens", async () => {
    const fakeToken = "invalid-token-never-created";
    const req = new NextRequest(`http://localhost:3000/api/share/${fakeToken}`);
    const params = Promise.resolve({ token: fakeToken });

    const response = await getShare(req, { params });
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.valid).toBe(false);
  });

  it("DELETE /api/share/:token requires authentication", async () => {
    const fakeToken = "any-token";
    const req = new NextRequest(`http://localhost:3000/api/share/${fakeToken}`, { method: "DELETE" });
    const params = Promise.resolve({ token: fakeToken });

    const response = await deleteShare(req, { params });
    expect(response.status).toBe(401);
  });
});
