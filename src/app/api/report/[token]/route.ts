import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/report/:token
 * @deprecated Legacy duplicate route. Canonical route is /api/share/:token.
 * Returns HTTP 307 redirect to /api/share/:token with Deprecation header.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const canonicalUrl = new URL(`/api/share/${token}`, req.url);
  const response = NextResponse.redirect(canonicalUrl, 307);
  response.headers.set("Deprecation", "true");
  response.headers.set("Link", `<${canonicalUrl.pathname}>; rel="canonical"`);
  return response;
}
