import { afterEach, expect, it, vi } from "vitest";
import { generateGeminiJson } from "./gemini-json.server";

vi.mock("@tanstack/react-start/server-only", () => ({}));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("wiederholt einen Timeout mit demselben Modell und derselben Anfrage", async () => {
  vi.useFakeTimers();
  vi.stubEnv("GEMINI_API_KEY", "test-only");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const fetchMock = vi
    .fn()
    .mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"rooms":[]}' }] } }],
        }),
      ),
    );
  vi.stubGlobal("fetch", fetchMock);
  const pending = generateGeminiJson({
    model: "test-pro",
    system: "unchanged system",
    prompt: "unchanged prompt",
    schema: { type: "object" },
    dataUrl: "data:application/pdf;base64,cGxhbg==",
  });
  await vi.advanceTimersByTimeAsync(1200);
  expect(await pending).toEqual({ rooms: [] });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[0]?.[0]).toBe(fetchMock.mock.calls[1]?.[0]);
  expect(fetchMock.mock.calls[0]?.[1].body).toBe(fetchMock.mock.calls[1]?.[1].body);
  expect(fetchMock.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
});
