import { NextResponse } from "next/server";
import { KitError } from "./kit-node";

/** Maps a thrown error to a JSON response; kit errors carry their own status and a user-safe message. */
export function kitErrorResponse(err: unknown): NextResponse {
  if (err instanceof KitError) return NextResponse.json({ error: err.message }, { status: err.status });
  const message = (err as any)?.message || String(err);
  console.error("[Kit]", message);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
