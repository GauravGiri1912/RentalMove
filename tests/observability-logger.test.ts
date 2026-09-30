import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger, sanitizeLogData } from "@/lib/logger";

describe("Phase 13 — Observability & Structured Logging", () => {
  let consoleLogSpy: any;
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Secret & Sensitive Data Redaction", () => {
    it("redacts sensitive keys such as password, token, secret, cookie", () => {
      const data = {
        username: "test_tenant",
        password: "super_secret_password_123!",
        userToken: "jwt_token_payload_abc",
        api_secret: "cloudinary_secret_key_xyz",
        nested: {
          authCookie: "sb-auth-token=123",
          safeField: "safe value",
        },
      };

      const sanitized = sanitizeLogData(data);
      expect(sanitized.username).toBe("test_tenant");
      expect(sanitized.password).toBe("[REDACTED]");
      expect(sanitized.userToken).toBe("[REDACTED]");
      expect(sanitized.api_secret).toBe("[REDACTED]");
      expect(sanitized.nested.authCookie).toBe("[REDACTED]");
      expect(sanitized.nested.safeField).toBe("safe value");
    });

    it("redacts Bearer tokens in log string messages", () => {
      const message = "Request processed with header Authorization: Bearer abc123secretTokenValue";
      const sanitized = sanitizeLogData(message);
      expect(sanitized).not.toContain("abc123secretTokenValue");
      expect(sanitized).toContain("Bearer [REDACTED]");
    });
  });

  describe("Structured Logging & Domain Helpers", () => {
    it("logs auth failures with warning level and sanitized context", () => {
      logger.authFailure("login", "invalid_credentials", { email: "tenant@example.com", password: "pwd" });
      expect(consoleWarnSpy).toHaveBeenCalled();
      const output = consoleWarnSpy.mock.calls[0][0];
      expect(output).toContain("[AUTH]");
      expect(output).toContain("Authentication failed: login");
      expect(output).toContain("[REDACTED]");
      expect(output).not.toContain('"password":"pwd"');
    });

    it("logs authorization failures with actor and resource", () => {
      logger.authzFailure("tenant-123", "tenant", "prop-999", "review_finding");
      expect(consoleWarnSpy).toHaveBeenCalled();
      const output = consoleWarnSpy.mock.calls[0][0];
      expect(output).toContain("[AUTHZ]");
      expect(output).toContain("Access denied: role=tenant user=tenant-123");
    });

    it("logs analysis duration and findings count on success", () => {
      logger.analysisSuccess("asset-456", 3, 1450);
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain("[ANALYSIS]");
      expect(output).toContain("AI analysis completed for asset-456: 3 finding(s)");
      expect(output).toContain("1450ms");
    });

    it("logs analysis failures with duration and reason", () => {
      logger.analysisFailure("asset-789", "Groq daily token limit reached", 2100);
      expect(consoleErrorSpy).toHaveBeenCalled();
      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain("[ANALYSIS]");
      expect(output).toContain("AI analysis failed for asset-789: Groq daily token limit reached");
      expect(output).toContain("2100ms");
    });

    it("logs report verification requests", () => {
      logger.verifyReport("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", true, 45);
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain("[VERIFY]");
      expect(output).toContain("Report verification");
      expect(output).toContain("matched=true");
    });

    it("logs share link access events", () => {
      logger.shareLinkAccess("share-abc-123", "valid");
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain("[SHARE]");
      expect(output).toContain("status=valid");
    });
  });
});
