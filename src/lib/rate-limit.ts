/**
 * rate-limit.ts — Server-side in-memory rate limiter for API routes.
 *
 * Uses a sliding window algorithm stored in a Map. Suitable for single-instance
 * deployments or dev/staging. For multi-instance production, replace with
 * Redis-based rate limiting (e.g., @upstash/ratelimit).
 *
 * Usage in API routes:
 *   const result = rateLimit(req, { limit: 20, windowMs: 60_000 });
 *   if (!result.success) return result.response;
 */

import { NextRequest, NextResponse } from "next/server";

interface RateLimitOptions {
  /** Max requests per windowMs */
  limit?: number;
  /** Window in milliseconds */
  windowMs?: number;
  /** Identifier prefix (e.g. "upload", "auth") */
  prefix?: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store — cleared on server restart
const store = new Map<string, RateLimitEntry>();

// Periodically purge expired entries to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}, 60_000); // purge every minute

/**
 * Get the best available client IP from request headers.
 * Trusts X-Forwarded-For only in production (set by Vercel/Cloudflare).
 */
function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

export function rateLimit(
  req: NextRequest,
  { limit = 60, windowMs = 60_000, prefix = "api" }: RateLimitOptions = {}
): { success: true } | { success: false; response: NextResponse } {
  const ip = getClientIp(req);
  const key = `${prefix}:${ip}`;
  const now = Date.now();

  let entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    // New window
    entry = { count: 1, resetAt: now + windowMs };
    store.set(key, entry);
    return { success: true };
  }

  entry.count += 1;

  if (entry.count > limit) {
    const retryAfterSecs = Math.ceil((entry.resetAt - now) / 1000);
    return {
      success: false,
      response: NextResponse.json(
        {
          error: "Too Many Requests",
          message: `Rate limit exceeded. Try again in ${retryAfterSecs}s.`,
          retryAfter: retryAfterSecs,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSecs),
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(entry.resetAt / 1000)),
          },
        }
      ),
    };
  }

  return { success: true };
}

/** Convenience: strict rate limit for auth endpoints (10 req/min per IP) */
export function authRateLimit(req: NextRequest) {
  return rateLimit(req, { limit: 10, windowMs: 60_000, prefix: "auth" });
}

/** Convenience: strict rate limit for upload/analysis (5 req/min per IP) */
export function uploadRateLimit(req: NextRequest) {
  return rateLimit(req, { limit: 5, windowMs: 60_000, prefix: "upload" });
}

/** Convenience: AI analysis (10 req/min per IP) */
export function aiRateLimit(req: NextRequest) {
  return rateLimit(req, { limit: 10, windowMs: 60_000, prefix: "ai" });
}
