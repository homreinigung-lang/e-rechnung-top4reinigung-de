import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractReceipt } from "./receipt-scan.server";

vi.mock("@tanstack/react-start/server-only", () => ({}));

const receipt = {
  supplier: "Testlieferant",
  document_number: "TEST-1",
  expense_date: "21.09.2026",
  expense_date_text: "21.09.2026",
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
  vi.setSystemTime(new Date("2026-10-23T12:00:00Z"));
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

  it("switches to the existing fallback without a fixed wait", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply({}))
      .mockResolvedValueOnce(reply(receipt));
    vi.stubGlobal("fetch", fetchMock);
    const result = expect(scan()).resolves.toMatchObject({ gross_amount: 119 });
    await vi.runAllTimersAsync();
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toContain("gemini-3.1-flash-lite");
    expect(Date.now()).toBe(new Date("2026-10-23T12:00:00Z").getTime());
  });

  it("stops after two unusable results and retains the attachment", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(reply({})));
    vi.stubGlobal("fetch", fetchMock);
    const result = expect(scan()).rejects.toThrow("erneutes Hochladen ist nicht nötig");
    await vi.runAllTimersAsync();
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it.each([
    ["2022-10-21", "21.10.2026"],
    ["2022-10-21", "21.10.2022"],
    ["2026-02-30", "30.02.2026"],
    ["2026-10-21 trailing text", "21.10.2026"],
    ["2026-10-21", ""],
    ["2026-10-21", "21.10.206"],
    ["2028-01-01", "01.01.2028"],
  ])(
    "requires date review instead of guessing for %s / %s",
    async (expense_date, expense_date_text) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(reply({ ...receipt, expense_date, expense_date_text })),
      );
      expect(await scan()).toMatchObject({
        expense_date: "",
        notes: expect.stringContaining("manuell eingeben"),
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["21.10.2026", "21/10/2026", "21.10.26", "2026-10-21", "21. Oktober 2026"])(
    "accepts matching printed date %s",
    async (expense_date_text) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(reply({ ...receipt, expense_date: "2026-10-21", expense_date_text })),
      );
      expect((await scan()).expense_date).toBe("2026-10-21");
    },
  );

  it("preserves leading zeros in invoice numbers and German decimal totals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        reply({
          ...receipt,
          document_number: "00026-OI/06",
          net_amount: "1.000,00 €",
          vat_amount: "190,00",
          gross_amount: "1.190,00",
        }),
      ),
    );
    expect(await scan()).toMatchObject({
      document_number: "00026-OI/06",
      net_amount: 1000,
      vat_amount: 190,
      gross_amount: 1190,
    });
  });

  it("omits the duplicate schema on the normal path, retaining full image and structured output", async () => {
    const request = vi.fn().mockResolvedValue(reply(receipt));
    vi.stubGlobal("fetch", request);
    await scan();
    const body = JSON.parse(request.mock.calls[0]![1].body);
    expect(body.contents[0].parts[0].text).not.toContain("JSON Schema");
    expect(body.contents[0].parts[1].inlineData.data).toBe("dGVzdA==");
    expect(body.generationConfig.responseJsonSchema.required).toContain("expense_date_text");
  });

  it("bounds all OCR model requests by one 15-second deadline", async () => {
    const fetchMock = vi.fn(async () => {
      await vi.advanceTimersByTimeAsync(fetchMock.mock.calls.length === 1 ? 10_000 : 5_000);
      throw new DOMException("timed out", "TimeoutError");
    });
    vi.stubGlobal("fetch", fetchMock);
    const start = Date.now();
    await expect(scan()).rejects.toThrow("hat zu lange gedauert");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(Date.now() - start).toBe(15_000);
  });
});
