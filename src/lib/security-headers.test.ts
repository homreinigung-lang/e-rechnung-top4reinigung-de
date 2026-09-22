import { describe, expect, it } from "vitest";
import { requireHttps, withSecurityHeaders } from "./security-headers";

describe("application response security", () => {
  it("upgrades production HTTP preserving path, query and POST semantics", () => {
    const response = requireHttps(
      new Request("http://e-rechnung.top4reinigung.de/auth?next=x", { method: "POST" }),
    );
    expect(response?.status).toBe(308);
    expect(response?.headers.get("location")).toBe(
      "https://e-rechnung.top4reinigung.de/auth?next=x",
    );
    expect(requireHttps(new Request("http://localhost:3000/auth"))).toBeNull();
  });
  it("keeps streamed bodies, status and cookies on error responses", async () => {
    const original = new Response("error", {
      status: 500,
      headers: { "set-cookie": "a=b; Secure", "content-type": "text/plain" },
    });
    const response = withSecurityHeaders(
      original,
      new Request("https://e-rechnung.top4reinigung.de/auth"),
    );
    expect(response.status).toBe(500);
    expect(response.headers.get("set-cookie")).toBe("a=b; Secure");
    expect(await response.text()).toBe("error");
    expect(response.headers.get("strict-transport-security")).toBe("max-age=86400");
    expect(response.headers.get("content-security-policy")).toContain("https://*.lovable.app");
    expect(response.headers.get("permissions-policy")).toContain("camera=(self)");
  });
  it("does not set HSTS on previews or local development", () => {
    const response = withSecurityHeaders(
      new Response("ok"),
      new Request("https://preview.example.invalid"),
    );
    expect(response.headers.has("strict-transport-security")).toBe(false);
  });
});
