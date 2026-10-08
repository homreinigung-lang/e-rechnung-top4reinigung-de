import { describe, expect, it } from "vitest";
import { computeEuer, isReceivedIncome } from "./euer";

describe("cash-basis income", () => {
  const invoice = {
    type: "invoice",
    status: "paid",
    issue_date: "2025-12-20",
    paid_at: "2026-01-15",
    total: 119,
    net_total: 100,
    vat_amount: 19,
  };

  it("includes an older invoice only in the period when payment arrived", () => {
    expect(computeEuer([invoice], [], "2025-01-01", "2025-12-31").incomeGross).toBe(0);
    const result = computeEuer([invoice], [], "2026-01-01", "2026-12-31");
    expect(result.incomeGross).toBe(119);
    expect(result.incomeNet).toBe(100);
    expect(result.incomeCount).toBe(1);
  });

  it("excludes unpaid, draft, cancelled, storno and undated invoices", () => {
    expect(isReceivedIncome({ ...invoice, status: "sent" })).toBe(false);
    expect(isReceivedIncome({ ...invoice, status: "draft" })).toBe(false);
    expect(isReceivedIncome({ ...invoice, status: "cancelled" })).toBe(false);
    expect(isReceivedIncome({ ...invoice, is_storno: true })).toBe(false);
    expect(isReceivedIncome({ ...invoice, paid_at: null })).toBe(false);
  });

  it("does not count payments outside the selected period", () => {
    expect(computeEuer([invoice], [], "2026-02-01", "2026-12-31").incomeCount).toBe(0);
  });
});
