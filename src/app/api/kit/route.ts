import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText, KIT_ROOM_TYPES, MAX_KIT_ROOMS } from "@/lib/kit";
import { createKit, KitError } from "@/lib/kit-node";
import { kitErrorResponse } from "@/lib/kit-http";

const counts = z.object(Object.fromEntries(KIT_ROOM_TYPES.map((t) => [t.category, z.number().int().min(0).max(t.max).optional()])) as any);
const Body = z.object({ name: z.string(), address: z.string().optional().default(""), rooms: counts });

/**
 * POST /api/kit — starts a free move-in kit. No account: the response holds two links, a private
 * one for the tenant and a read-only one for sharing the report. Limited per IP because anyone can call it.
 */
export async function POST(req: NextRequest) {
  // Loose cap on every attempt (cheap to reject) …
  const loose = await rateLimit(req, { limit: 60, windowMs: 3_600_000, prefix: "kit-create-attempts" });
  if (!loose.success) return loose.response;
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new KitError(400, "Please enter your name and choose your rooms.");
    const name = cleanText(parsed.data.name, 60);
    if (name.length < 2) throw new KitError(400, "Please enter your name.");
    const total = Object.values(parsed.data.rooms as Record<string, number | undefined>).reduce((n: number, v) => n + (v ?? 0), 0);
    if (total < 1) throw new KitError(400, "Pick at least one room.");
    if (total > MAX_KIT_ROOMS) throw new KitError(400, `A kit can have up to ${MAX_KIT_ROOMS} rooms.`);
    // … and a strict cap only on kits actually created, so a typo never costs a real user their quota.
    const strict = await rateLimit(req, { limit: 6, windowMs: 3_600_000, prefix: "kit-create" });
    if (!strict.success) return strict.response;
    const kit = await createKit({ name, address: cleanText(parsed.data.address, 120), counts: parsed.data.rooms as any });
    return NextResponse.json({ path: `/k/${kit.token}`, token: kit.token }, { status: 201 });
  } catch (err) {
    return kitErrorResponse(err);
  }
}
