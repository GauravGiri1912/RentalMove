/**
 * invite-crypto.ts — signed tenant invitations.
 *
 * An invite link is an HMAC over { property, invite id, expiry }. It cannot be forged or edited, so a tenant
 * cannot choose which property they join or what role they get. Single use and revocation are enforced from the
 * event log (lib/events.ts deriveInvites), not by the token itself.
 */

import crypto from "crypto";

export interface InviteClaims { p: string; id: string; exp: number }

export const INVITE_TTL_MS = 14 * 24 * 3600 * 1000;

function key(): Buffer {
  const secret = process.env.HANDOFF_SECRET || process.env.CLOUDINARY_API_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("No secret available to sign invites");
  return crypto.createHash("sha256").update(`rentalmove-invite:${secret}`).digest();
}
const b64url = (b: Buffer) => b.toString("base64url");

/** Deterministic for a given (property, id, exp), so the owner can be shown the same link again. */
export function signInvite(claims: InviteClaims): string {
  const body = b64url(Buffer.from(JSON.stringify(claims)));
  return `${body}.${b64url(crypto.createHmac("sha256", key()).update(body).digest())}`;
}

export function verifyInvite(token: string): InviteClaims | null {
  const [body, mac] = String(token).split(".");
  if (!body || !mac) return null;
  const expected = b64url(crypto.createHmac("sha256", key()).update(body).digest());
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as InviteClaims;
    if (!c.p || !c.id || !c.exp || c.exp < Date.now()) return null;
    return c;
  } catch {
    return null;
  }
}
