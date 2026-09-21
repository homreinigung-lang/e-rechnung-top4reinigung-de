import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractReceipt } from "./receipt-scan.server";

vi.mock("@tanstack/react-start/server-only", () => ({}));

const receipt = {
  supplier: "Testlieferant",
  document_number: "TEST-1",
  expense_date: "21.09.2026",
  net_amount: 100,
  vat_amount: 19,
  gross_amount: 119,
  category: "Material",
  notes: "",
};
const reply = (value: unknown, finishReason = "STOP") =>
  new Response(
    JSON.stringify({
      candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(value) }] } }],
    }),
  );
const scan = () => extractReceipt("data:application/pdf;base64,dGVzdA==", "application/pdf");

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("GEMINI_API_KEY", "synthetic-test-key");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("receipt extraction", () => {
  it("sends the correct JSON Schema and accepts a valid receipt on the first attempt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(receipt));
    vi.stubGlobal("fetch", fetchMock);
    expect(await scan()).toMatchObject({
      supplier: "Testlieferant",
      expense_date: "2026-09-21",
      net_amount: 100,
      vat_amount: 19,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.generationConfig.responseJsonSchema.required).toContain("net_amount");
    expect(body.generationConfig.responseSchema).toBeUndefined();
  });

  it.each([
    {},
    null,
    [],
    { category: "Sonstiges" },
    { ...receipt, net_amount: 0, vat_amount: 0, gross_amount: 0 },
  ])("retries unusable output with the same attachment: %j", async (empty) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(empty))
      .mockResolvedValueOnce(reply(receipt));
    vi.stubGlobal("fetch", fetchMock);
    const result = expect(scan()).resolves.toMatchObject({ gross_amount: 119 });
    await vi.runAllTimersAsync();
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![1].body).toBe(fetchMock.mock.calls[1]![1].body);
  });

  it("switches to the fallback after two empty responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply({}))
      .mockResolvedValueOnce(reply({}))
      .mockResolvedValueOnce(reply(receipt));
    vi.stubGlobal("fetch", fetchMock);
    const result = expect(scan()).resolves.toMatchObject({ gross_amount: 119 });
    await vi.runAllTimersAsync();
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]![0]).toContain("gemini-3.1-flash-lite");
  });

  it("stops after four unusable results and retains the attachment", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(reply({})));
    vi.stubGlobal("fetch", fetchMock);
    const result = expect(scan()).rejects.toThrow("erneutes Hochladen ist nicht nötig");
    await vi.runAllTimersAsync();
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it.each([401, 403, 429, 400])("does not retry permanent HTTP %i errors", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("invalid request", { status }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(scan()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retains field names when a legacy model rejects schema enforcement", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("responseJsonSchema unsupported", { status: 400 }))
      .mockResolvedValueOnce(reply(receipt));
    vi.stubGlobal("fetch", fetchMock);
    expect((await scan()).gross_amount).toBe(119);
    const body = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(body.generationConfig.responseJsonSchema).toBeUndefined();
    expect(body.contents[0].parts[0].text).toContain("net_amount");
  });

  it("retries transient service failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("overloaded", { status: 503 }))
      .mockResolvedValueOnce(reply(receipt));
    vi.stubGlobal("fetch", fetchMock);
    const result = expect(scan()).resolves.toMatchObject({ gross_amount: 119 });
    await vi.runAllTimersAsync();
    await result;
  });

  it("rejects truncated output even when it contains parseable JSON", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(receipt, "MAX_TOKENS"))
      .mockResolvedValueOnce(reply(receipt));
    vi.stubGlobal("fetch", fetchMock);
    const result = expect(scan()).resolves.toMatchObject({ gross_amount: 119 });
    await vi.runAllTimersAsync();
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not invent VAT when the receipt has only a gross amount", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(reply({ ...receipt, net_amount: 0, vat_amount: 0, gross_amount: 50 })),
    );
    expect(await scan()).toMatchObject({ net_amount: 50, vat_amount: 0, gross_amount: 50 });
  });

  it("rejects contradictory totals", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ ...receipt, gross_amount: 120 })));
    await expect(scan()).rejects.toThrow("stimmen nicht überein");
  });
});
