import { describe, expect, it } from "vitest";
import {
  approvedWorkAmount,
  approvedWorkHours,
  approvedWorkTotals,
} from "@/lib/approved-work-totals";

describe("approved work totals", () => {
  const entries = [
    { employee_name: "A", entry_type: "work", approval_status: "approved", hours: 5, hourly_rate: 20 },
    { employee_name: "A", entry_type: "work", approval_status: "pending", hours: 7, hourly_rate: 20 },
    { employee_name: "A", entry_type: "work", approval_status: "rejected", hours: 8, hourly_rate: 20 },
    { employee_name: "B", entry_type: "work", approval_status: null, hours: 3, hourly_rate: 15 },
    { employee_name: "B", entry_type: "absence", approval_status: "approved", hours: 8, hourly_rate: 15 },
  ];

  it("excludes pending, rejected and absence hours from payroll totals", () => {
    expect(approvedWorkTotals(entries)).toEqual({
      hours: 8,
      amount: 145,
      perEmployee: [
        ["A", { hours: 5, amount: 100 }],
        ["B", { hours: 3, amount: 45 }],
      ],
    });
  });

  it("keeps the legacy missing approval status as approved", () => {
    expect(approvedWorkHours(entries[3]!)).toBe(3);
    expect(approvedWorkAmount(entries[3]!)).toBe(45);
  });

  it("never assigns wage value to pending or rejected entries", () => {
    expect(approvedWorkHours(entries[1]!)).toBe(0);
    expect(approvedWorkAmount(entries[2]!)).toBe(0);
  });

  it("ignores invalid or negative values", () => {
    expect(approvedWorkTotals([
      { employee_name: "A", approval_status: "approved", hours: -4, hourly_rate: 20 },
      { employee_name: "A", approval_status: "approved", hours: "oops", hourly_rate: 20 },
    ])).toEqual({ hours: 0, amount: 0, perEmployee: [] });
  });
});
