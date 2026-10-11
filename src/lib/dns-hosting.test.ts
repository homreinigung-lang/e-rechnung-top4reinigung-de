import { describe, expect, it } from "vitest";
import { APP_DOMAIN, validHostingAddresses, isCurrentHttpsConnection } from "./dns-hosting";

describe("Cloudflare hosting check", () => {
  it("accepts rotating edge addresses including the reported pair", () => {
    expect(validHostingAddresses(APP_DOMAIN, ["188.114.97.3", "188.114.96.3"])).toBe(true);
    expect(validHostingAddresses(APP_DOMAIN, ["104.16.0.1", "172.64.1.1"])).toBe(true);
  });
  it("rejects absent, mixed, private, malformed and out-of-range answers", () => {
    for (const records of [
      [],
      ["185.158.133.1"],
      ["127.0.0.1"],
      ["188.114.97.3", "10.0.0.1"],
      ["188.114.112.0"],
      ["104.16.999.1"],
      ["not-an-ip"],
    ]) {
      expect(validHostingAddresses(APP_DOMAIN, records)).toBe(false);
    }
  });
  it("does not treat an unrelated Cloudflare tenant as this deployment", () => {
    expect(validHostingAddresses("other.example", ["188.114.97.3"])).toBe(false);
  });
  it("only confirms an actual HTTPS request on the exact checked domain", () => {
    expect(isCurrentHttpsConnection(APP_DOMAIN, `https://${APP_DOMAIN}/_serverFn/x`)).toBe(true);
    expect(isCurrentHttpsConnection(APP_DOMAIN, `http://${APP_DOMAIN}/`)).toBe(false);
    expect(isCurrentHttpsConnection(APP_DOMAIN, "https://localhost/")).toBe(false);
    expect(isCurrentHttpsConnection(APP_DOMAIN, `https://${APP_DOMAIN}.example/`)).toBe(false);
  });
});
