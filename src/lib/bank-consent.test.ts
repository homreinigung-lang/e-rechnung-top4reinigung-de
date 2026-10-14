import { describe, expect, it, vi } from "vitest";
import { bankConsentValidUntil, BANK_RENEWAL_MESSAGE } from "../../supabase/functions/enable-banking/consent";
import { bankRequestError } from "./bank-request-error";

const now = new Date("2026-10-14T15:00:00Z");
describe("bankabhängige Freigabedauer", () => {
  it.each([180, 90, 30])("nutzt die von der Bank erlaubten %s Tage", async (days) => {
    const api = vi.fn(async () => ({ aspsps: [{ name: "Sparkasse", country: "DE", maximum_consent_validity: days * 86400 }] }));
    expect(await bankConsentValidUntil(api, "Sparkasse", "DE", now))
      .toBe(new Date(now.getTime() + days * 86400000).toISOString());
    expect(api).toHaveBeenCalledWith("/aspsps?country=DE");
  });
  it.each([undefined, 0, -1, NaN, Infinity, "180"])("erfindet bei ungültiger Dauer %s keine Frist", async (value) => {
    const api = async () => ({ aspsps: [{ name: "Sparkasse", country: "DE", maximum_consent_validity: value }] });
    await expect(bankConsentValidUntil(api, "Sparkasse", "DE", now)).rejects.toThrow("Freigabedauer");
  });
  it("verwendet weder einen gleichnamigen Eintrag eines anderen Landes noch eine andere Bank", async () => {
    const api = async () => ({ aspsps: [{ name: "Sparkasse", country: "AT", maximum_consent_validity: 180 * 86400 }] });
    await expect(bankConsentValidUntil(api, "Sparkasse", "DE", now)).rejects.toThrow("Freigabedauer");
  });
});

describe("erneute Bankfreigabe", () => {
  it.each(["CLOSED_SESSION", "EXPIRED_SESSION"])("übersetzt %s aus der bisherigen Funktion", async (code) => {
    const error = await bankRequestError({ message: "Edge Function returned a non-2xx status code", context: new Response(JSON.stringify({ error: "Enable Banking API (401)", details: { error: code, message: "private-provider-data" } }), { status: 401 }) });
    expect(error.message).toBe(BANK_RENEWAL_MESSAGE);
    expect(error.message).not.toContain("private-provider-data");
  });
  it("liest den neuen Freigabehinweis und erhält die ursprüngliche Response", async () => {
    const context = new Response(JSON.stringify({ error: "renew", reauthorization_required: true }), { status: 403 });
    expect((await bankRequestError({ context })).message).toBe(BANK_RENEWAL_MESSAGE);
    expect(context.bodyUsed).toBe(false);
  });
  it("erhält Transportfehler bei nicht lesbarer Antwort", async () => {
    expect((await bankRequestError({ message: "network", context: new Response("invalid json") })).message).toBe("network");
  });
});
