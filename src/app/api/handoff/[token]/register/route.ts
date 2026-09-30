import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyHandoff } from "@/lib/handoff";
import { registerAsset } from "@/lib/pipeline";
import { appendEvent } from "@/lib/events";

const Body = z.object({
  cloudinary_public_id: z.string().min(1),
  secure_url: z.string().url(),
  etag: z.string().optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  width: z.number().optional(),
  height: z.number().optional(),
});

/** POST /api/handoff/:token/register — registers the phone's upload for the token's room. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = verifyHandoff(token);
  if (!c) return NextResponse.json({ error: "Capture link invalid or expired" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid registration" }, { status: 400 });
  // The upload must be inside this token's folder — the signature already enforced it; re-check.
  if (!parsed.data.cloudinary_public_id.startsWith(`properties/${c.p}/${c.i}/`)) {
    return NextResponse.json({ error: "Upload is outside this capture link's scope" }, { status: 403 });
  }
  const asset = await registerAsset({ property_id: c.p, inspection_id: c.i, room_id: c.r, captured_at: new Date().toISOString(), ...parsed.data });
  await appendEvent({ property_id: c.p, type: "pipeline", resource_id: asset.id, actor_id: c.u, actor_name: c.n, actor_role: c.role, payload: { stage: "upload", label: "Photo received from phone", detail: `${parsed.data.cloudinary_public_id} · via QR handoff` } }).catch(() => {});
  return NextResponse.json({ asset_id: asset.id, analysis_status: asset.analysis_status }, { status: 201 });
}

export const maxDuration = 60;
