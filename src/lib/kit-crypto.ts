/**
 * kit-crypto.ts — signed kit links and the sealing hash (server side; uses Node's crypto).
 *
 * A *write* link (kept by the tenant) can add photos, seal and delete the kit; a *read* link
 * (for the landlord, family, a deposit scheme) can only open the report. Both are HMACs, so
 * neither can be forged or widened.
 */

import crypto from "crypto";

export interface KitClaims {
  p: string; // property id (the kit)
  i: string; // inspection id (the move-in visit)
  s: "w" | "r"; // write = tenant, read = report only
  g?: number; // read links: generation, so the tenant can replace (and thereby cancel) a shared link
  exp: number; // epoch ms
}

/** Records are needed for years (deposit disputes), so links last; deleting the kit ends them. */
const KIT_TOKEN_TTL_MS = 5 * 365 * 24 * 3600 * 1000;

function key(): Buffer {
  const secret = process.env.HANDOFF_SECRET || process.env.CLOUDINARY_API_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("No secret available to sign kit tokens");
  return crypto.createHash("sha256").update(`rentalmove-kit:${secret}`).digest();
}
const b64url = (b: Buffer) => b.toString("base64url");

export function signKit(claims: Omit<KitClaims, "exp">): string {
  const body = b64url(Buffer.from(JSON.stringify({ ...claims, exp: Date.now() + KIT_TOKEN_TTL_MS })));
  return `${body}.${b64url(crypto.createHmac("sha256", key()).update(body).digest())}`;
}

export function verifyKit(token: string): KitClaims | null {
  const [body, mac] = String(token).split(".");
  if (!body || !mac) return null;
  const expected = b64url(crypto.createHmac("sha256", key()).update(body).digest());
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as KitClaims;
    if (!c.exp || c.exp < Date.now() || !c.p || !c.i || (c.s !== "w" && c.s !== "r")) return null;
    return c;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sealing
// ---------------------------------------------------------------------------

export interface SealInput {
  kit: string;
  name: string;
  address: string;
  rooms: { id: string; name: string; shots: { shot: string; sha256: string }[] }[];
}

/**
 * SHA-256 of the kit's canonical content. It changes if any photo, any shot assignment, a room
 * or the tenant's name changes, so a sealed record can be re-checked at any time.
 */
export function sealHash(input: SealInput): string {
  const canonical = JSON.stringify({
    v: 1,
    kit: input.kit,
    name: input.name,
    address: input.address,
    rooms: [...input.rooms]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((r) => ({ id: r.id, name: r.name, shots: [...r.shots].sort((a, b) => a.shot.localeCompare(b.shot)).map((s) => [s.shot, s.sha256]) })),
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

