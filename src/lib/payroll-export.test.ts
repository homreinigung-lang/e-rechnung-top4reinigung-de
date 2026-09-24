import { describe, expect, it } from "vitest";
import { buildPayrollSummary, payrollCode } from "./payroll-export";

describe("payroll export", () => {
  it("maps work and absence codes", () => {
    expect(payrollCode({ entry_type: "work" })).toBe("A");
    expect(payrollCode({ entry_type: "absence", absence_reason: "vacation" })).toBe("U");
    expect(payrollCode({ entry_type: "absence", absence_reason: "sick" })).toBe("K");
    expect(payrollCode({ entry_type: "absence", absence_reason: "other" })).toBe("S");
  });

  it("groups by employee id and counts unique absence days", () => {
    const rows = buildPayrollSummary([
      {
        employee_id: "e1",
        employee_name: "Anna",
        personnel_number: "1001",
        contract_type: "Teilzeit",
        weekly_hours: 20,
        hourly_rate: 15,
        work_date: "2026-09-01",
        hours: 5,
        entry_type: "work",
        approval_status: "approved",
      },
      {
        employee_id: "e1",
        employee_name: "Anna",
        personnel_number: "1001",
        hourly_rate: 15,
        work_date: "2026-09-02",
        hours: 4,
        entry_type: "work",
        approval_status: "approved",
      },
      {
        employee_id: "e1",
        employee_name: "Anna",
        personnel_number: "1001",
        work_date: "2026-09-03",
        entry_type: "absence",
        absence_reason: "vacation",
        approval_status: "approved",
      },
      {
        employee_id: "e1",
        employee_name: "Anna",
        personnel_number: "1001",
        work_date: "2026-09-03",
        entry_type: "absence",
        absence_reason: "vacation",
        approval_status: "approved",
      },
      {
        employee_id: "e1",
        employee_name: "Anna",
        personnel_number: "1001",
        work_date: "2026-09-04",
        entry_type: "absence",
        absence_reason: "sick",
        approval_status: "pending",
      },
    ]);

    expect(rows).toEqual([
      {
        Mitarbeiter: "Anna",
        "Personal-Nr.": "1001",
        Vertragsart: "Teilzeit",
        Wochenstunden: "20,00",
        "Ist-Stunden": "9,00",
        Stundensatz: "15,00",
        Arbeitslohn: "135,00",
        "Urlaubstage (U)": "1",
        "Kranktage (K)": "0",
        "Sonstige Abwesenheitstage (S)": "0",
      },
    ]);
  });
});
