import { expect, it } from "vitest";
import { readDescribedDuration } from "./calculation-language";
it.each([
 ["90 Minuten je Einsatz", 1.5], ["1 Stunde 30 Minuten", 1.5], ["1h30min", 1.5],
 ["eineinhalb Stunden", 1.5], ["eine halbe Stunde", 0.5], ["zwei Stunden und 15 Minuten", 2.25],
 ["1:30 Std.", 1.5], ["45 min", 0.75], ["2,5 Stunden", 2.5],
])("recognizes visit duration: %s", (text, hours) => expect(readDescribedDuration(text)).toMatchObject({ hours, period: "visit", ambiguous: false }));
it.each([["20 Stunden pro Monat", "month"], ["5 Stunden pro Woche", "week"]])("keeps the period for %s", (text, period) => expect(readDescribedDuration(text)).toMatchObject({ period }));
it("does not treat travel or per-floor time as total cleaning time", () => {
 expect(readDescribedDuration("Anfahrt: 30 Minuten; Reinigung 2 Stunden").hours).toBe(2);
 expect(readDescribedDuration("Treppenhaus 8 Minuten je Etage").hours).toBe(0);
});
it("asks about separate durations rather than silently ignoring a room", () => expect(readDescribedDuration("Büro 2 Stunden, WC 30 Minuten").ambiguous).toBe(true));
it("does not interpret an hourly price as work duration", () => expect(readDescribedDuration("38 Euro pro Stunde").hours).toBe(0));
