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

const options = {
  model: "test-pro",
  system: "system",
  prompt: "prompt",
  schema: { type: "object" },
};

it("nutzt bei Google 429 das Ersatzmodell statt sofort abzubrechen", async () => {
  vi.stubEnv("GEMINI_API_KEY", "test-only");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "quota limit: 0" } }), { status: 429 }),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"rooms":[]}' }] } }],
        }),
      ),
    );
  vi.stubGlobal("fetch", fetchMock);
  expect(await generateGeminiJson(options)).toEqual({ rooms: [] });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1]?.[0]).toContain("gemini-3.1-flash-lite:generateContent");
  expect(fetchMock.mock.calls[0]?.[1].body).toBe(fetchMock.mock.calls[1]?.[1].body);
});

it("beendet ausgeschöpfte Modellkontingente ohne Endlosschleife mit einer Google-Meldung", async () => {
  vi.stubEnv("GEMINI_API_KEY", "test-only");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("quota", { status: 429 })),
  );
  await expect(generateGeminiJson(options)).rejects.toThrow("Google-Gemini-Kontingent");
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("ruft bei 429 ein bereits ausgewähltes Ersatzmodell nicht doppelt auf", async () => {
  vi.stubEnv("GEMINI_API_KEY", "test-only");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("quota", { status: 429 })),
  );
  await expect(generateGeminiJson({ ...options, model: "gemini-3.1-flash-lite" })).rejects.toThrow(
    "Google-Gemini-Kontingent",
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("versucht bei ungültigem API-Zugang kein Ersatzmodell", async () => {
  vi.stubEnv("GEMINI_API_KEY", "test-only");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("forbidden", { status: 403 })),
  );
  await expect(generateGeminiJson(options)).rejects.toThrow(
    "KI-Zugang ist nicht korrekt konfiguriert",
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});
