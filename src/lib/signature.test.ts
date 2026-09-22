import { describe, expect, it } from "vitest";
import { buildEmailHtml, buildSignatureHtml, sanitizeSignatureHtml } from "./signature";

describe("signature HTML security", () => {
  it.each([
    "<a href=javascript:alert(1)>click</a>",
    '<a href="java&#x73;cript:alert(1)">click</a>',
    '<a href="java\nscript:alert(1)">click</a>',
    '<svg><a xlink:href="javascript:alert(1)">click</a></svg>',
    "<img src=x onerror=alert(1)>",
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    '<div style="background-image:url(https://tracker.invalid);position:fixed">ok</div>',
  ])("removes active content from %s", (html) => {
    const clean = sanitizeSignatureHtml(html);
    expect(clean).not.toMatch(
      /javascript|onerror|<svg|<iframe|srcdoc|<script|background-image|position:/i,
    );
  });
  it("preserves ordinary company formatting and logo", () => {
    const html = buildSignatureHtml({
      email_signature_html:
        '<strong style="color:#123456">Company</strong><br><a href="mailto:test@example.invalid">Email</a>',
      email_signature_logo_url: "https://example.invalid/logo.png",
      website_url: "https://example.invalid",
    });
    expect(html).toContain('src="https://example.invalid/logo.png"');
    expect(html).toContain('<strong style="color:#123456">Company</strong>');
    expect(html).toContain('href="mailto:test@example.invalid"');
  });
  it("sanitizes website URLs and the complete signature passed to email", () => {
    expect(buildSignatureHtml({ website_url: "javascript:alert(1)" })).not.toContain(
      'href="javascript:',
    );
    expect(
      buildEmailHtml("<script>text only</script>", '<img src=x onerror="alert(1)">'),
    ).not.toContain("onerror");
    expect(buildEmailHtml("<script>text only</script>", "")).toContain("&lt;script&gt;");
  });
});
