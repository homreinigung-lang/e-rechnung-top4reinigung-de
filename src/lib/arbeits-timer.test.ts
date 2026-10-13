import { describe, expect, it } from "vitest";
import { parseTimer, stopTimer, type ArbeitsTimer } from "./arbeits-timer";
import { workedHours, toMinutes } from "./time-entry";
const timer: ArbeitsTimer = {
  date: "2026-10-13",
  start: "08:05",
  projectId: "p1",
  breakMin: 0,
  planned: true,
};
describe("Arbeitszeit einfach erfassen", () => {
  it("hält die Endzeit fest und erhält sie nach Neuladen", () => {
    const stopped = stopTimer(timer, new Date(2026, 9, 13, 12, 10));
    const restored = parseTimer(JSON.stringify(stopped))!;
    expect(restored.end).toBe("12:10");
    expect(workedHours(restored.start, restored.end!, 0)).toBe(4.08);
    expect(workedHours(restored.start, restored.end!, 30)).toBe(3.58);
    expect(restored.end).toBe("12:10");
  });
  it("erhält den Tag bei Arbeit über Mitternacht statt Zeiten abzuschneiden", () => {
    const stopped = stopTimer({ ...timer, start: "23:59" }, new Date(2026, 9, 14, 0, 30));
    expect(stopped.date).toBe("2026-10-13");
    expect(stopped.endDate).toBe("2026-10-14");
    expect(stopped.end).toBe("00:30");
  });
  it("lehnt ungültige Uhrzeiten, umgekehrte Zeiten und überlange Pausen ab", () => {
    for (const t of ["24:00", "08:60", "", "08:", "Infinity:00"]) expect(toMinutes(t)).toBeNull();
    expect(workedHours("22:00", "06:00", 0)).toBe(0);
    expect(workedHours("08:00", "08:30", 60)).toBe(0);
    expect(workedHours("08:00", "09:00", NaN)).toBe(0);
  });
  it("lädt alte laufende Timer und ignoriert beschädigten Speicher", () => {
    expect(parseTimer(JSON.stringify(timer))).toEqual(timer);
    expect(parseTimer("{broken")).toBeNull();
    expect(parseTimer(JSON.stringify({ ...timer, start: "99:99" }))).toBeNull();
  });
});
