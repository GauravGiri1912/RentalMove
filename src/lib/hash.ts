import crypto from "crypto";

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
 * Computes SHA-256 hash from a remote URL via fetching (Server-side)
 */
export async function computeRemoteImageSha256(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const arrayBuffer = await res.arrayBuffer();
    return crypto.createHash("sha256").update(Buffer.from(arrayBuffer)).digest("hex");
  } catch (err) {
    console.error("Failed to compute SHA-256 for remote image:", err);
    return undefined;
  }
}
