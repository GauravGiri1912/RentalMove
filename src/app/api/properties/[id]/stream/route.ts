import { NextRequest } from "next/server";
import { getAuthenticatedUserOrThrow, canUserAccessProperty, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";
import { eventBus, type PropertyEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

/**
 * GET /api/properties/:id/stream — Server-Sent Events. Emits a small notice whenever an event
 * is appended for the property (upload, analysis, review, position, comment, signature), so
 * every open page — laptop and phone — refreshes within a second.
 * Single-process broadcast: fine for one server instance; a multi-instance deployment would
 * use Supabase Realtime on rm_events instead.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user;
  const { id } = await params;
  try {
    user = await getAuthenticatedUserOrThrow(req);
  } catch {
    return unauthorizedResponse();
  }
  if (!(await canUserAccessProperty(user, id))) return forbiddenResponse("No access to this property.");

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { cleanup(); }
      };
      const onEvent = (e: PropertyEvent) => send({ type: e.type, id: e.id, resource_id: e.resource_id, actor: e.actor_name, at: e.created_at });
      eventBus.on(`property:${id}`, onEvent);
      const beat = setInterval(() => { try { controller.enqueue(encoder.encode(": keep-alive\n\n")); } catch { cleanup(); } }, 20000);
      cleanup = () => { clearInterval(beat); eventBus.off(`property:${id}`, onEvent); };
      req.signal.addEventListener("abort", () => { cleanup(); try { controller.close(); } catch {} });
      send({ type: "hello", at: new Date().toISOString() });
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
