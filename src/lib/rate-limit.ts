/**
 * rate-limit.ts — Rate limiting abstraction supporting both distributed Redis
 * (Upstash / serverless Redis) and local in-memory sliding window fallback.
 */

import { NextRequest, NextResponse } from "next/server";

export interface RateLimitOptions {
  /** Max requests per windowMs */
  limit?: number;
  /** Window in milliseconds */
  windowMs?: number;
  /** Identifier prefix (e.g. "upload", "auth") */
  prefix?: string;
  /** Explicit key override (defaults to client IP) */
  key?: string;
}

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitStoreResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSecs: number;
}

export interface RateLimitStore {
  readonly name: string;
  consume(key: string, limit: number, windowMs: number): Promise<RateLimitStoreResult> | RateLimitStoreResult;
  reset?(key?: string): Promise<void> | void;
}

// =========================================================================
// IN-MEMORY STORE (Default for dev, test, and fallback)
// =========================================================================

export class MemoryRateLimitStore implements RateLimitStore {
  readonly name = "memory";
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private maxEntries = 10_000;

  constructor() {
    if (typeof setInterval !== "undefined") {
      this.cleanupInterval = setInterval(() => this.purgeExpired(), 60_000);
      if (this.cleanupInterval && typeof (this.cleanupInterval as any).unref === "function") {
        (this.cleanupInterval as any).unref();
      }
    }
  }

  purgeExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetAt < now) {
        this.store.delete(key);
      }
    }
    // Safeguard against unbound memory growth
    if (this.store.size > this.maxEntries) {
      const keysToDelete = Array.from(this.store.keys()).slice(0, 1000);
      for (const k of keysToDelete) this.store.delete(k);
    }
  }

  consume(key: string, limit: number, windowMs: number): RateLimitStoreResult {
    const now = Date.now();
    let entry = this.store.get(key);

    if (!entry || entry.resetAt < now) {
      entry = { count: 1, resetAt: now + windowMs };
      this.store.set(key, entry);
      return {
        success: true,
        limit,
        remaining: Math.max(0, limit - 1),
        resetAt: entry.resetAt,
        retryAfterSecs: 0,
      };
    }

    entry.count += 1;
    const remaining = Math.max(0, limit - entry.count);
    const retryAfterSecs = Math.ceil(Math.max(0, entry.resetAt - now) / 1000);

    return {
      success: entry.count <= limit,
      limit,
      remaining,
      resetAt: entry.resetAt,
      retryAfterSecs,
    };
  }

  reset(key?: string): void {
    if (key) {
      this.store.delete(key);
    } else {
      this.store.clear();
    }
  }

  destroy(): void {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
  }
}

// =========================================================================
// DISTRIBUTED REDIS STORE (Upstash REST API for serverless/edge deployments)
// =========================================================================

export class UpstashRedisRateLimitStore implements RateLimitStore {
  readonly name = "upstash-redis";
  private url: string;
  private token: string;
  private fallbackMemory: MemoryRateLimitStore;

  constructor(url: string, token: string) {
    this.url = url.replace(/\/$/, "");
    this.token = token;
    this.fallbackMemory = new MemoryRateLimitStore();
  }

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitStoreResult> {
    try {
      const response = await fetch(`${this.url}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          ["INCR", key],
          ["PTTL", key],
        ]),
      });

      if (!response.ok) {
        throw new Error(`Upstash returned HTTP ${response.status}`);
      }

      const results = (await response.json()) as Array<{ result?: any }>;
      const count = Number(results[0]?.result ?? 1);
      let pttl = Number(results[1]?.result ?? -1);

      // New key: set expiry window
      if (pttl <= 0) {
        await fetch(`${this.url}/pexpire/${encodeURIComponent(key)}/${windowMs}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.token}` },
        }).catch(() => {});
        pttl = windowMs;
      }

      const now = Date.now();
      const resetAt = now + Math.max(pttl, 0);
      const remaining = Math.max(0, limit - count);
      const retryAfterSecs = Math.ceil(Math.max(0, pttl) / 1000);

      return {
        success: count <= limit,
        limit,
        remaining,
        resetAt,
        retryAfterSecs,
      };
    } catch (err) {
      console.warn("[RateLimit] Upstash Redis call failed; falling back to in-memory store:", err);
      return this.fallbackMemory.consume(key, limit, windowMs);
    }
  }

  async reset(key?: string): Promise<void> {
    if (key) {
      await fetch(`${this.url}/del/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}` },
      }).catch(() => {});
    }
  }
}

// =========================================================================
// STORE FACTORY & SINGLETON
// =========================================================================

let activeStore: RateLimitStore | null = null;

export function getRateLimitStore(): RateLimitStore {
  if (activeStore) return activeStore;

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    activeStore = new UpstashRedisRateLimitStore(upstashUrl, upstashToken);
  } else {
    activeStore = new MemoryRateLimitStore();
  }

  return activeStore;
}

export function setRateLimitStore(store: RateLimitStore | null): void {
  activeStore = store;
}

/**
 * Get the best available client IP from request headers.
 */
export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

/**
 * Primary rate limiter for API routes.
 */
export async function rateLimit(
  req: NextRequest,
  { limit = 60, windowMs = 60_000, prefix = "api", key }: RateLimitOptions = {}
): Promise<{ success: true } | { success: false; response: NextResponse }> {
  const store = getRateLimitStore();
  const clientKey = key || `${prefix}:${getClientIp(req)}`;

  const res = await store.consume(clientKey, limit, windowMs);

  if (!res.success) {
    return {
      success: false,
      response: NextResponse.json(
        {
          error: "Too Many Requests",
          message: `Rate limit exceeded. Try again in ${res.retryAfterSecs}s.`,
          retryAfter: res.retryAfterSecs,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(res.retryAfterSecs),
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": String(res.remaining),
            "X-RateLimit-Reset": String(Math.ceil(res.resetAt / 1000)),
          },
        }
      ),
    };
  }

  return { success: true };
}

/** Synchronous rate limiter for testing or non-async call sites */
const syncMemory = new MemoryRateLimitStore();
export function rateLimitSync(
  req: NextRequest,
  { limit = 60, windowMs = 60_000, prefix = "api", key }: RateLimitOptions = {}
): { success: true } | { success: false; response: NextResponse } {
  const clientKey = key || `${prefix}:${getClientIp(req)}`;
  const res = syncMemory.consume(clientKey, limit, windowMs);

  if (!res.success) {
    return {
      success: false,
      response: NextResponse.json(
        {
          error: "Too Many Requests",
          message: `Rate limit exceeded. Try again in ${res.retryAfterSecs}s.`,
          retryAfter: res.retryAfterSecs,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(res.retryAfterSecs),
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": String(res.remaining),
            "X-RateLimit-Reset": String(Math.ceil(res.resetAt / 1000)),
          },
        }
      ),
    };
  }

  return { success: true };
}

/** Convenience: strict rate limit for auth endpoints (10 req/min per IP) */
export async function authRateLimit(req: NextRequest) {
  return rateLimit(req, { limit: 10, windowMs: 60_000, prefix: "auth" });
}

/** Convenience: strict rate limit for upload/analysis (5 req/min per IP) */
export async function uploadRateLimit(req: NextRequest) {
  return rateLimit(req, { limit: 5, windowMs: 60_000, prefix: "upload" });
}

/** Convenience: AI analysis (10 req/min per IP) */
export async function aiRateLimit(req: NextRequest) {
  return rateLimit(req, { limit: 10, windowMs: 60_000, prefix: "ai" });
}
