import { describe, expect, it } from "vitest";
import { dailyHours, urlaubskontoFor, zeitkontoFor } from "./zeitkonto";

const emp = "e1";

describe("zeitkontoFor", () => {
  it("schreibt genehmigten Urlaub mit der Tages-Sollzeit gut", () => {
    const konto = zeitkontoFor(
      emp,
      40,
      [
        {
          employee_id: emp,
          work_date: "2026-03-02",
          hours: 0,
          entry_type: "absence",
          absence_reason: "vacation",
          approval_status: "approved",
        },
      ],
      [],
      "2026-03",
    );
    expect(dailyHours(40)).toBe(8);
    expect(konto.abwesenheit).toBe(8);
    expect(konto.ist).toBe(8);
  });

  it("zählt offene Anträge nicht", () => {
    const konto = zeitkontoFor(
      emp,
      40,
      [
        {
          employee_id: emp,
          work_date: "2026-03-02",
          hours: 0,
          entry_type: "absence",
          absence_reason: "vacation",
          approval_status: "pending",
        },
      ],
      [],
      "2026-03",
    );
    expect(konto.abwesenheit).toBe(0);
  });

  it("summiert Arbeitsstunden und Abwesenheit", () => {
    const konto = zeitkontoFor(
      emp,
      20,
      [
        { employee_id: emp, work_date: "2026-03-02", hours: 6, entry_type: "work" },
        {
          employee_id: emp,
          work_date: "2026-03-03",
          hours: 0,
          entry_type: "absence",
          absence_reason: "sick",
          approval_status: "approved",
        },
      ],
      [],
      "2026-03",
    );
    expect(konto.gearbeitet).toBe(6);
    expect(konto.ist).toBe(10);
  });
});

describe("urlaubskontoFor", () => {
  const entries = [
    {
      employee_id: emp,
      work_date: "2026-03-02",
      entry_type: "absence",
      absence_reason: "vacation",
      approval_status: "approved",
    },
    {
      employee_id: emp,
      work_date: "2026-03-03",
      entry_type: "absence",
      absence_reason: "vacation",
      approval_status: "pending",
    },
    {
      employee_id: emp,
      work_date: "2025-03-03",
      entry_type: "absence",
      absence_reason: "vacation",
      approval_status: "approved",
    },
  ];

  it("rechnet Anspruch, Übertrag und Resturlaub", () => {
    const k = urlaubskontoFor(
      emp,
      { vacation_days_per_year: 24, vacation_carryover_days: 2 },
      entries,
      "2026",
    );
    expect(k.genommen).toBe(1);
    expect(k.beantragt).toBe(1);
    expect(k.rest).toBe(24);
  });
});
