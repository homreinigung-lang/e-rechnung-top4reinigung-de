import { describe, expect, it } from "vitest";
import {
  approvedWorkAmount,
  approvedWorkHours,
  approvedProjectWorkTotals,
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

  it("uses the employee's hourly rate when an entry rate is missing", () => {
    expect(approvedWorkTotals(
      [{ employee_id: "e1", employee_name: "A", approval_status: "approved", hours: 2, hourly_rate: 0 }],
      new Map([["e1", 17]]),
    )).toEqual({
      hours: 2,
      amount: 34,
      perEmployee: [["A", { hours: 2, amount: 34 }]],
    });
  });

  it("ignores invalid or negative values", () => {
    expect(approvedWorkTotals([
      { employee_name: "A", approval_status: "approved", hours: -4, hourly_rate: 20 },
      { employee_name: "A", approval_status: "approved", hours: "oops", hourly_rate: 20 },
    ])).toEqual({ hours: 0, amount: 0, perEmployee: [] });
  });

  it("uses only approved project work for hours and costs, with employee rate fallback", () => {
    const totals = approvedProjectWorkTotals([
      { project_id: "p1", employee_id: "e1", entry_type: "work", approval_status: "approved", hours: 3, hourly_rate: 20 },
      { project_id: "p1", employee_id: "e1", entry_type: "work", approval_status: "pending", hours: 9, hourly_rate: 20 },
      { project_id: "p1", employee_id: "e1", entry_type: "work", approval_status: "rejected", hours: 2, hourly_rate: 20 },
      { project_id: "p1", employee_id: "e1", entry_type: "absence", approval_status: "approved", hours: 8, hourly_rate: 20 },
      { project_id: "p1", employee_id: "e2", entry_type: "work", approval_status: "approved", hours: 2, hourly_rate: null },
      { project_id: "p2", employee_id: "e1", entry_type: "work", approval_status: null, hours: 4, hourly_rate: 25 },
      { project_id: null, employee_id: "e1", entry_type: "work", approval_status: "approved", hours: 5, hourly_rate: 20 },
    ], new Map([["e1", 20], ["e2", 18]]));

    expect(totals.get("p1")).toEqual({ hours: 5, amount: 96 });
    expect(totals.get("p2")).toEqual({ hours: 4, amount: 100 });
    expect(totals.size).toBe(2);
  });

  it("does not assign negative or unapproved hours to project costs", () => {
    const totals = approvedProjectWorkTotals([
      { project_id: "p1", approval_status: "pending", hours: 3, hourly_rate: 100 },
      { project_id: "p1", approval_status: "approved", hours: -3, hourly_rate: 100 },
      { project_id: "p1", approval_status: "rejected", hours: 4, hourly_rate: 100 },
    ]);
    expect(totals.size).toBe(0);
  });

});
