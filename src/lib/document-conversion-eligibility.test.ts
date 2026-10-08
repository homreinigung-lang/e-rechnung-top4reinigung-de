import { describe, expect, it } from "vitest";
import { assertDocumentConversionAllowed as check } from "./document-conversion-eligibility";

describe("document conversion eligibility", () => {
  it("allows accepted quote to order or invoice", () => {
    for (const target of ["order", "invoice"] as const) {
      expect(() => check({ type: "quote", status: "accepted" }, target)).not.toThrow();
    }
  });

  it.each(["draft", "sent"])("allows open order status %s to invoice", (status) => {
    expect(() => check({ type: "order", status }, "invoice")).not.toThrow();
  });

  it.each(["draft", "sent", "declined", "paid", "cancelled"])("rejects nonaccepted quote %s", (status) => {
    expect(() => check({ type: "quote", status }, "invoice")).toThrow();
  });

  it.each(["paid", "cancelled", "accepted"])("rejects nonopen order %s", (status) => {
    expect(() => check({ type: "order", status }, "invoice")).toThrow();
  });

  it("rejects cancelled, deleted, storno and already converted sources", () => {
    const base = { type: "order", status: "sent" };
    expect(() => check({ ...base, is_storno: true }, "invoice")).toThrow();
    expect(() => check({ ...base, deleted_at: "2026-10-08" }, "invoice")).toThrow();
    expect(() => check({ ...base, converted_document_id: "other-id" }, "invoice")).toThrow();
  });

  it("rejects invalid source document types", () => {
    expect(() => check({ type: "invoice", status: "sent" }, "invoice")).toThrow();
    expect(() => check({ type: "order", status: "sent" }, "order")).toThrow();
  });
});
