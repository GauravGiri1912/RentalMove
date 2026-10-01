/**
 * logger.ts — Structured, security-hardened logging for RentalMove.
 *
 * Enforces automatic secret redaction (API keys, service role secrets, tokens, passwords)
 * and structured JSON formatting in production environments.
 */

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export type LogCategory =
  | "AUTH"
  | "AUTHZ"
  | "UPLOAD"
  | "ANALYSIS"
  | "DB"
  | "CLOUDINARY"
  | "VERIFY"
  | "SHARE"
  | "SERVER";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  requestId?: string;
  durationMs?: number;
  data?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/** Patterns matching sensitive strings that MUST NEVER appear in logs. */
const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /authorization/i,
  /cookie/i,
  /bearer/i,
  /key$/i,
  /service_role/i,
];

/** Recursively sanitize objects and values before logging to prevent secret leakage. */
export function sanitizeLogData(input: any, depth = 0): any {
  if (depth > 5 || input === null || input === undefined) return input;

  if (typeof input === "string") {
    // Redact bearer tokens and long hex hashes/keys
    let sanitized = input
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
      .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}/g, "[JWT_REDACTED]");

    // Check if string contains known secret env values
    const secrets = [
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      process.env.CLOUDINARY_API_SECRET,
      process.env.GROQ_API_KEY,
      process.env.UPSTASH_REDIS_REST_TOKEN,
    ].filter(Boolean) as string[];

    for (const secret of secrets) {
      if (secret.length > 5 && sanitized.includes(secret)) {
        sanitized = sanitized.split(secret).join("[SECRET_REDACTED]");
      }
    }

    return sanitized;
  }

  if (typeof input !== "object") return input;

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeLogData(item, depth + 1));
  }

  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(input)) {
    const isSensitive = SENSITIVE_KEY_PATTERNS.some((pat) => pat.test(key));
    if (isSensitive) {
      out[key] = "[REDACTED]";
    } else {
      out[key] = sanitizeLogData(value, depth + 1);
    }
  }

  return out;
}

export class Logger {
  private format(entry: LogEntry): string {
    const isProd = process.env.NODE_ENV === "production";
    if (isProd) {
      return JSON.stringify(entry);
    }
    const dur = entry.durationMs !== undefined ? ` (${entry.durationMs}ms)` : "";
    const req = entry.requestId ? ` [${entry.requestId}]` : "";
    const dataStr = entry.data && Object.keys(entry.data).length > 0
      ? ` | data: ${JSON.stringify(entry.data)}`
      : "";
    const errStr = entry.error ? ` | error: ${entry.error.name}: ${entry.error.message}` : "";
    return `[${entry.category}]${req} ${entry.message}${dur}${dataStr}${errStr}`;
  }

  log(level: LogLevel, category: LogCategory, message: string, meta?: {
    requestId?: string;
    durationMs?: number;
    data?: Record<string, any>;
    error?: Error | unknown;
  }): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      requestId: meta?.requestId,
      durationMs: meta?.durationMs,
      data: meta?.data ? sanitizeLogData(meta.data) : undefined,
      error: meta?.error instanceof Error
        ? {
            name: meta.error.name,
            message: sanitizeLogData(meta.error.message),
            stack: process.env.NODE_ENV === "development" ? meta.error.stack : undefined,
          }
        : meta?.error ? { name: "Error", message: sanitizeLogData(String(meta.error)) } : undefined,
    };

    const formatted = this.format(entry);

    switch (level) {
      case "ERROR":
        console.error(formatted);
        break;
      case "WARN":
        console.warn(formatted);
        break;
      case "DEBUG":
        if (process.env.DEBUG || process.env.NODE_ENV === "development") console.debug(formatted);
        break;
      case "INFO":
      default:
        console.log(formatted);
        break;
    }
  }

  info(category: LogCategory, message: string, data?: Record<string, any>): void {
    this.log("INFO", category, message, { data });
  }

  warn(category: LogCategory, message: string, data?: Record<string, any>): void {
    this.log("WARN", category, message, { data });
  }

  error(category: LogCategory, message: string, error?: Error | unknown, data?: Record<string, any>): void {
    this.log("ERROR", category, message, { error, data });
  }

  // --- Domain Helpers ---

  authFailure(action: string, reason: string, data?: Record<string, any>): void {
    this.log("WARN", "AUTH", `Authentication failed: ${action} — ${reason}`, { data });
  }

  authzFailure(actorId: string, role: string, resource: string, action: string, data?: Record<string, any>): void {
    this.log("WARN", "AUTHZ", `Access denied: role=${role} user=${actorId} resource=${resource} action=${action}`, { data });
  }

  uploadFailure(publicId: string, reason: string, data?: Record<string, any>): void {
    this.log("ERROR", "UPLOAD", `Upload failure for ${publicId}: ${reason}`, { data });
  }

  analysisFailure(assetId: string, reason: string, durationMs?: number, data?: Record<string, any>): void {
    this.log("ERROR", "ANALYSIS", `AI analysis failed for ${assetId}: ${reason}`, { durationMs, data });
  }

  analysisSuccess(assetId: string, findingsCount: number, durationMs: number): void {
    this.log("INFO", "ANALYSIS", `AI analysis completed for ${assetId}: ${findingsCount} finding(s)`, { durationMs });
  }

  dbError(operation: string, error: Error | unknown, data?: Record<string, any>): void {
    this.log("ERROR", "DB", `Database operation failed: ${operation}`, { error, data });
  }

  cloudinaryError(operation: string, error: Error | unknown, data?: Record<string, any>): void {
    this.log("ERROR", "CLOUDINARY", `Cloudinary operation failed: ${operation}`, { error, data });
  }

  verifyReport(sha256: string, matched: boolean, durationMs?: number): void {
    this.log("INFO", "VERIFY", `Report verification: sha256=${sha256.slice(0, 16)}… matched=${matched}`, { durationMs });
  }

  shareLinkAccess(tokenHint: string, status: "valid" | "expired" | "not_found" | "revoked"): void {
    this.log("INFO", "SHARE", `Share link accessed: token=${tokenHint} status=${status}`);
  }
}

export const logger = new Logger();
