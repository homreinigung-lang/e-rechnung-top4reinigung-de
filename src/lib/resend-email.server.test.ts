import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendVerifiedEmail } from "./resend-email.server";
vi.mock("@tanstack/react-start/server-only", () => ({}));
const options = {
  to: "receiver@example.invalid",
  subject: "Synthetic",
  text: "Test only",
  idempotencyKey: "synthetic/test-1",
};
beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "synthetic-only");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("mail provider failure and retry", () => {
  it.each([400, 429, 500, 503])(
    "does not report success or retry automatically on HTTP %i",
    async (status) => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(new Response('{"message":"synthetic failure"}', { status }));
      vi.stubGlobal("fetch", fetcher);
      await expect(sendVerifiedEmail(options)).rejects.toThrow("synthetic failure");
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("reuses the idempotency key when the first response is lost", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce(new Response('{"id":"synthetic-id"}'));
    vi.stubGlobal("fetch", fetcher);
    await expect(sendVerifiedEmail(options)).rejects.toThrow("connection lost");
    expect((await sendVerifiedEmail(options)).id).toBe("synthetic-id");
    for (const [, init] of fetcher.mock.calls) {
      expect(init.headers["Idempotency-Key"]).toBe("synthetic/test-1");
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });
  it.each(["{}", '{"error":"failed"}'])("requires a provider acknowledgement: %s", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
    await expect(sendVerifiedEmail(options)).rejects.toThrow();
  });
});
