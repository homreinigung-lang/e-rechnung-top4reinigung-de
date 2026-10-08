import { describe, expect, it } from "vitest";
import { summarizeOpenInvoices } from "./open-invoices";

describe("open invoice summary", () => {
  it("keeps amount, count and list consistent when drafts exist", () => {
    const draft = { id: "draft", status: "draft", total: 1000 };
    const sent = { id: "sent", status: "sent", total: 500 };
    expect(summarizeOpenInvoices([draft, sent])).toEqual({ items: [sent], total: 500 });
  });
  it("excludes paid and cancelled invoices and preserves overdue invoices", () => {
    const overdue = { status: "overdue", total: "250.50" };
    expect(
      summarizeOpenInvoices([
        { status: "paid", total: 900 },
        { status: "cancelled", total: 100 },
        overdue,
      ]),
    ).toEqual({ items: [overdue], total: 250.5 });
  });
  it("returns a real zero only for an empty set of issued unpaid invoices", () => {
    expect(summarizeOpenInvoices([{ status: "draft", total: 1000 }])).toEqual({
      items: [],
      total: 0,
    });
  });
  it("excludes storno invoices even when their status is sent or overdue", () => {
    const sent = { status: "sent", total: 120, is_storno: false };
    const storno = { status: "sent", total: -120, is_storno: true };
    const overdueStorno = { status: "overdue", total: 75, is_storno: true };
    expect(summarizeOpenInvoices([sent, storno, overdueStorno])).toEqual({
      items: [sent],
      total: 120,
    });
  });
});
