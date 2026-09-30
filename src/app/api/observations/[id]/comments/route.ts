import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserOrThrow, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";
import { observationWithProperty } from "@/lib/access";
import { appendEvent } from "@/lib/events";
import { checkVoiceClip, VOICE_LANGS } from "@/lib/voice";

const Body = z.object({
  text: z.string().trim().max(1000).default(""),
  /** A voice note uploaded with a signature from POST /api/observations/:id/voice. */
  voice: z.object({ public_id: z.string().min(1).max(300), lang: z.enum(VOICE_LANGS), transcribed: z.boolean().default(false) }).optional(),
}).refine((b) => b.text.length > 0 || !!b.voice, "Comment must have text or a voice note");

/** POST /api/observations/:id/comments — add to the tenant/owner discussion on a finding. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getAuthenticatedUserOrThrow(req);
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Comment must be 1–1000 characters, or a voice note" }, { status: 400 });
    const found = await observationWithProperty(user, id);
    if (!found) return forbiddenResponse("You do not have access to this finding.");
    let voice: Record<string, unknown> | undefined;
    if (parsed.data.voice) {
      const clip = await checkVoiceClip(found.propertyId, id, parsed.data.voice.public_id);
      if ("error" in clip) return NextResponse.json({ error: clip.error }, { status: 400 });
      voice = { ...clip, lang: parsed.data.voice.lang, transcribed: parsed.data.voice.transcribed && parsed.data.text.length > 0 };
    }
    const event = await appendEvent({
      property_id: found.propertyId,
      type: "comment",
      resource_id: id,
      actor_id: user.id,
      actor_name: user.name,
      actor_role: user.role,
      payload: voice ? { text: parsed.data.text, voice } : { text: parsed.data.text },
    });
    return NextResponse.json({ ok: true, event }, { status: 201 });
  } catch (err: any) {
    if (err?.statusCode === 401) return unauthorizedResponse();
    return NextResponse.json({ error: "Failed to add comment", message: err?.message || String(err) }, { status: 500 });
  }
}
