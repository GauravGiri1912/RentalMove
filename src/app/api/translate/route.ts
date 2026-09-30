import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserOrThrow, canUserAccessProperty, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { translateTexts } from "@/lib/translate";

const Body = z.object({
  property_id: z.string().min(1).max(80),
  lang: z.enum(["hi"]),
  texts: z.array(z.string().max(600)).max(150).refine((a) => a.reduce((n, t) => n + t.length, 0) <= 20000, "Too much text"),
});

/**
 * POST /api/translate — machine translation of report text for one property.
 * Cached per property + language (translation events); only uncached strings reach the model.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { limit: 12, windowMs: 60_000, prefix: "translate" });
  if (!rl.success) return rl.response;
  try {
    const user = await getAuthenticatedUserOrThrow(req);
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid translation request", details: parsed.error.format() }, { status: 400 });
    const { property_id, lang, texts } = parsed.data;
    if (!(await canUserAccessProperty(user, property_id))) return forbiddenResponse("You do not have access to this property.");
    const r = await translateTexts(property_id, lang, texts);
    return NextResponse.json(r);
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    const quota = /daily token limit|rate limit/i.test(String(err?.message));
    return NextResponse.json({ error: quota ? "Translation quota reached — try again later." : "Translation failed", message: err?.message || String(err) }, { status: quota ? 429 : 500 });
  }
}
