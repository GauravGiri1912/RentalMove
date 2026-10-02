import { NextRequest, NextResponse } from "next/server";
import { AssetRegisterRequestSchema } from "@/lib/schemas";
import { registerAsset } from "@/lib/pipeline";
import { deriveSubmitted, listEvents } from "@/lib/events";
import {
  getAuthenticatedUserOrThrow,
  canUserAccessProperty,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth";

/**
 * POST /api/assets/register
 * Registers a newly uploaded Cloudinary asset in the database and triggers AI analysis.
 * Requires authentication and property access authorization.
 */
export async function POST(req: NextRequest) {
  try {
    // Require authentication
    const user = await getAuthenticatedUserOrThrow(req);

    const body = await req.json();
    const parsed = AssetRegisterRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid asset registration payload", details: parsed.error.format() },
        { status: 400 }
      );
    }

    // Verify user can register assets for this property
    const authorized = await canUserAccessProperty(user, parsed.data.property_id);
    if (!authorized) {
      return forbiddenResponse("You do not have permission to register assets for this property.");
    }

    // A submitted visit is closed: its checklist was locked, so no further photos are added to it.
    if (deriveSubmitted(await listEvents(parsed.data.property_id, ["coverage"]))[parsed.data.inspection_id]) {
      return NextResponse.json({ error: "This visit was already submitted. Start a new visit to add more photos." }, { status: 409 });
    }

    const asset = await registerAsset(parsed.data);
    return NextResponse.json(asset, { status: 201 });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    console.error("Asset registration error:", err);
    return NextResponse.json(
      { error: "Failed to register asset", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}

/** Vision calls can take several seconds; allow the host to keep the function alive. */
export const maxDuration = 60;
