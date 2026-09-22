const LIVE_HOST = "e-rechnung.top4reinigung.de";

/** Limit HTTPS redirects/HSTS to this application, never the parent domain. */
export function requireHttps(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.hostname !== LIVE_HOST || url.protocol !== "http:") return null;
  url.protocol = "https:";
  return Response.redirect(url.href, 308);
}

export function withSecurityHeaders(response: Response, request: Request): Response {
  if (response.status === 101) return response;
  const result = new Response(response.body, response);
  result.headers.set("X-Content-Type-Options", "nosniff");
  result.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  result.headers.set("Permissions-Policy", "camera=(self), geolocation=(self), microphone=()");
  // Preserve the connected Lovable preview; do not restrict PDF blobs or scripts.
  result.headers.set(
    "Content-Security-Policy",
    "base-uri 'self'; object-src 'none'; frame-ancestors 'self' https://lovable.dev https://*.lovable.dev https://*.lovable.app",
  );
  const url = new URL(request.url);
  if (url.hostname === LIVE_HOST && url.protocol === "https:") {
    result.headers.set("Strict-Transport-Security", "max-age=86400");
  }
  return result;
}
