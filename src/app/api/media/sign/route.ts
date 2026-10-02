import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserOrThrow, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { assetWithProperty } from "@/lib/access";
import { rateLimit } from "@/lib/rate-limit";
import { signedDeliveryUrl } from "@/lib/media";
import { RecipeSchema, isGenerative, transformationFor } from "@/lib/recipes";
import { derivePrivacy, listEvents } from "@/lib/events";
import { pixelateSteps } from "@/lib/privacy";

const Body = z.object({ items: z.array(z.object({ asset_id: z.string().min(1), recipe: RecipeSchema })).min(1).max(8) });

/**
 * POST /api/media/sign — signed Cloudinary URLs for whitelisted dynamic recipes (listing
 * edits, media lab, tiles). Strict-Transformations–ready: the client never builds dynamic
 * transformation URLs itself, and generative edits are owner-only.
 */
export async function POST(req: NextRequest) {
  const rl = await rateLimit(req, { limit: 120, windowMs: 60_000, prefix: "media-sign" });
  if (!rl.success) return rl.response;
  try {
    const user = await getAuthenticatedUserOrThrow(req);
    if (!can(user, "media:transform")) return forbiddenResponse("Media transformations are not permitted for this account.");
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid recipe", details: parsed.error.format() }, { status: 400 });
    const urls: string[] = [];
    const publicIds = new Map<string, string>();
    const hides = new Map<string, string[]>();
    const privacyByProperty = new Map<string, ReturnType<typeof derivePrivacy>>();
    for (const { asset_id, recipe } of parsed.data.items) {
      if (isGenerative(recipe) && !can(user, "media:generative")) return forbiddenResponse("Generative listing edits are available to owners.");
      let pid = publicIds.get(asset_id);
      if (!pid) {
        const found = await assetWithProperty(user, asset_id);
        if (!found) return forbiddenResponse("You do not have access to this photo.");
        pid = found.asset.cloudinary_public_id;
        publicIds.set(asset_id, pid);
        // Private areas (letters, screens…) are hidden in every signed copy, server-side.
        let priv = privacyByProperty.get(found.propertyId);
        if (!priv) { priv = derivePrivacy(await listEvents(found.propertyId, ["privacy"])); privacyByProperty.set(found.propertyId, priv); }
        hides.set(asset_id, pixelateSteps(priv[asset_id] ?? [], found.asset.width ?? 0, found.asset.height ?? 0));
      }
      urls.push(signedDeliveryUrl(pid, transformationFor(recipe, hides.get(asset_id) ?? [])));
    }
    return NextResponse.json({ urls });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    return NextResponse.json({ error: "Failed to sign", message: err?.message || String(err) }, { status: 500 });
  }
}
