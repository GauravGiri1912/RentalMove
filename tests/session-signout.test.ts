import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { DELETE } from "../src/app/api/auth/session/route";
import { getCloudName, buildUrl } from "../src/lib/cloudinary-urls";

describe("Phase 3: Auth Session Sign-out & Cloudinary Configuration", () => {
  it("1. DELETE /api/auth/session clears standard and chunked Supabase auth cookies", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/session", {
      method: "DELETE",
      headers: {
        cookie: "sb-access-token=mock-jwt; sb-refresh-token=mock-refresh; sb-vuhopvtzmvojjlrzroje-auth-token.0=chunk0; sb-vuhopvtzmvojjlrzroje-auth-token.1=chunk1; other-pref=theme",
      },
    });

    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.message).toBe("Signed out");

    // Check Set-Cookie headers on response
    const setCookieHeaders = res.headers.getSetCookie();
    expect(setCookieHeaders.length).toBeGreaterThanOrEqual(2);

    // Verify all Supabase auth cookies were marked for deletion (max-age=0 or expires in past)
    const deletedCookieNames = setCookieHeaders.map((c) => c.split("=")[0].trim());
    expect(deletedCookieNames).toContain("sb-access-token");
    expect(deletedCookieNames).toContain("sb-refresh-token");
    expect(deletedCookieNames).toContain("sb-vuhopvtzmvojjlrzroje-auth-token.0");
    expect(deletedCookieNames).toContain("sb-vuhopvtzmvojjlrzroje-auth-token.1");
    // Non-auth cookies are not touched
    expect(deletedCookieNames).not.toContain("other-pref");
  });

  it("2. getCloudName returns configured cloud name and constructs accurate URLs", () => {
    const originalNextPub = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    try {
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "custom-cloud-test";
      expect(getCloudName()).toBe("custom-cloud-test");

      const url = buildUrl("properties/prop-381/kitchen/test", "c_fill,w_400");
      expect(url).toContain("https://res.cloudinary.com/custom-cloud-test/image/upload/c_fill,w_400/properties/prop-381/kitchen/test");
      expect(url).not.toContain("/demo/");
    } finally {
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = originalNextPub;
    }
  });

  it("3. getCloudName throws clear error when configuration is completely missing outside test mode", () => {
    const originalNextPub = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const originalCloud = process.env.CLOUDINARY_CLOUD_NAME;
    const originalNodeEnv = process.env.NODE_ENV;
    const originalMock = process.env.DEVELOPMENT_MOCK_MODE;

    try {
      delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
      delete process.env.CLOUDINARY_CLOUD_NAME;
      (process.env as any).NODE_ENV = "production";
      process.env.DEVELOPMENT_MOCK_MODE = "false";

      expect(() => getCloudName()).toThrow(/NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME must be set/);
    } finally {
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = originalNextPub;
      process.env.CLOUDINARY_CLOUD_NAME = originalCloud;
      (process.env as any).NODE_ENV = originalNodeEnv;
      process.env.DEVELOPMENT_MOCK_MODE = originalMock;
    }
  });
});
