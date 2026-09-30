import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserOrThrow, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";
import { observationWithProperty } from "@/lib/access";
import { isCloudinaryConfigured } from "@/lib/media";
import { uploadRateLimit } from "@/lib/rate-limit";
import { signVoiceUpload } from "@/lib/voice";

/**
 * POST /api/observations/:id/voice — signature for uploading one voice note about a finding.
 * The note itself is posted through POST /api/observations/:id/comments with `voice`.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = await uploadRateLimit(req);
  if (!rl.success) return rl.response;
  try {
    const { id } = await params;
    const user = await getAuthenticatedUserOrThrow(req);
    const found = await observationWithProperty(user, id);
    if (!found) return forbiddenResponse("You do not have access to this finding.");
    if (!isCloudinaryConfigured()) return NextResponse.json({ error: "Voice notes need Cloudinary configured." }, { status: 503 });
    return NextResponse.json(signVoiceUpload(found.propertyId, id));
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    return NextResponse.json({ error: "Could not sign voice upload", message: err?.message || String(err) }, { status: 500 });
  }
}
