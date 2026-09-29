/**
 * hash.ts — SHA-256 utilities for evidence integrity.
 *
 * SECURITY:
 * - computeRemoteImageSha256 validates the URL against allowed domains before fetching.
 * - This prevents Server-Side Request Forgery (SSRF) attacks where an attacker
 *   could supply an internal URL (e.g., http://169.254.169.254/...) to probe internal services.
 */

import crypto from "crypto";

/** Cloudinary domains that are safe to fetch from server-side */
const ALLOWED_FETCH_DOMAINS = ["res.cloudinary.com", "res-1.cloudinary.com", "res-2.cloudinary.com"];

/**
 * Computes SHA-256 hash from a Buffer or string in Node.js
 */
export function computeSha256(data: Buffer | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Computes SHA-256 hash from a File or Blob in the browser
 */
export async function computeBrowserFileSha256(file: Blob): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Validates that a URL points to an allowed domain (SSRF mitigation).
 * Returns true if the URL is safe to fetch server-side.
 */
export function isAllowedFetchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Must be HTTPS
    if (parsed.protocol !== "https:") return false;

    // Must be from an allowed domain
    const hostname = parsed.hostname.toLowerCase();
    if (!ALLOWED_FETCH_DOMAINS.some((d) => hostname === d || hostname.endsWith("." + d))) {
      return false;
    }

    // Must not have credentials in URL
    if (parsed.username || parsed.password) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Computes SHA-256 hash from a remote Cloudinary URL (Server-side).
 * Validates the URL against allowed domains to prevent SSRF.
 */
export async function computeRemoteImageSha256(url: string): Promise<string | undefined> {
  if (!isAllowedFetchUrl(url)) {
    console.warn(`[Hash] Blocked fetch of disallowed URL: ${url}`);
    return undefined;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000); // 15s timeout

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "RentalMove-Integrity-Check/1.0",
      },
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[Hash] Non-OK response (${res.status}) for URL: ${url}`);
      return undefined;
    }

    // Limit to 50MB to prevent memory exhaustion
    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > 50 * 1024 * 1024) {
      console.warn(`[Hash] File too large (${contentLength} bytes) for SHA-256: ${url}`);
      return undefined;
    }

    const arrayBuffer = await res.arrayBuffer();
    return crypto.createHash("sha256").update(Buffer.from(arrayBuffer)).digest("hex");
  } catch (err: any) {
    if (err?.name === "AbortError") {
      console.warn(`[Hash] Timeout fetching SHA-256 for: ${url}`);
    } else {
      console.error("[Hash] Failed to compute SHA-256 for remote image:", err);
    }
    return undefined;
  }
}
