/**
 * handoff.ts — short-lived, single-room capture tokens for the laptop → phone handoff.
 *
 * The laptop (signed in) asks for a token scoped to ONE property, inspection and room, valid
 * for 15 minutes. It is shown as a QR code; the phone needs no login — the token is the
 * permission, and it is an HMAC so it cannot be forged or widened. Uploads made with it are
 * attributed to the user who created it.
 */

import crypto from "crypto";

export const HANDOFF_TTL_MS = 15 * 60 * 1000;

export interface HandoffClaims {
  p: string; // property id
  i: string; // inspection id
  r: string; // room id
  u: string; // user id who created it
  n: string; // user name (for attribution)
  role: "tenant" | "owner";
  exp: number; // epoch ms
}

function key(): Buffer {
  const secret = process.env.HANDOFF_SECRET || process.env.CLOUDINARY_API_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("No secret available to sign handoff tokens");
  // Derive a purpose-specific key so the upstream secret is never used directly.
  return crypto.createHash("sha256").update(`rentalmove-handoff:${secret}`).digest();
}

const b64url = (b: Buffer) => b.toString("base64url");

export function signHandoff(claims: Omit<HandoffClaims, "exp">, ttlMs = HANDOFF_TTL_MS): { token: string; expires_at: string } {
  const full: HandoffClaims = { ...claims, exp: Date.now() + ttlMs };
  const body = b64url(Buffer.from(JSON.stringify(full)));
  const mac = b64url(crypto.createHmac("sha256", key()).update(body).digest());
  return { token: `${body}.${mac}`, expires_at: new Date(full.exp).toISOString() };
}

export function verifyHandoff(token: string): HandoffClaims | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = b64url(crypto.createHmac("sha256", key()).update(body).digest());
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as HandoffClaims;
    if (!claims.exp || claims.exp < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}
