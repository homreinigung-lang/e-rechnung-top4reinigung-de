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
  result.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://squkjqvofugkanzuqtqn.supabase.co",
      "font-src 'self' data:",
      "connect-src 'self' https://squkjqvofugkanzuqtqn.supabase.co wss://squkjqvofugkanzuqtqn.supabase.co",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  );
  const url = new URL(request.url);
  if (url.hostname === LIVE_HOST && url.protocol === "https:") {
    result.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  return result;
}
