import { describe, expect, it } from "vitest";
import { normalizeItem } from "./normalize";
import { reconcileWorkingTime } from "./working-time";
import {
  aggregateByCategory,
  recommendPrice,
  summarizeHours,
  DEFAULT_PRICE_INPUTS,
} from "./aggregate";
import { canRelease, emptyCalculation, updateLvItem } from "./calculation";
import { validateItems } from "./validate";

function priceSheet(days: number, hours: number, saturdays: number, sundays: number, deep: number) {
  return `a. Unterhaltsreinigung montags bis freitags
Pauschalpreis pro Jahr (${days} Arbeitstage)
Der Pauschale liegt eine Reinigungszeit von insgesamt ____Stunden / Tag ${String(hours).replace(".", ",")} zugrunde.
b. Unterhaltsreinigung im Zusammenhang mit Veranstaltungen am Wochenende
Reinigungszeit von ____Stunden / Einsatz ${String(hours).replace(".", ",")} zugrunde.
Für die Angebotswertung werden ${saturdays} Veranstaltungen an einem Samstag und ${sundays} Veranstaltungen an einem Sonntag pro Jahr zugrunde gelegt.
Wertungseintrag (Pauschalpreis SAMSTAG x ${saturdays} + SONNTAG x ${sundays})
c. Grundreinigung (1x jährlich)
Reinigungszeit von insgesamt ____Stunden / jährlich ${deep} zugrunde.
d. Stundenverrechnungssatz für unvorhergesehene Sonderaufträge
Fiktives Stundenkontingent
Wertungseintrag (Stundenverrechnungssatz x 10 Stunden)`;
}
function rows(hours: number, days: number, deep: number, frequency: string, aiAnnual = false) {
  return [
    {
      description: "Unterhaltsreinigung montags bis freitags",
      quantity: aiAnnual ? days : 1,
      unit: aiAnnual ? "Tage" : "Jahr",
      frequency,
      working_hours: aiAnnual ? days * hours : hours,
    },
    {
      description: "Unterhaltsreinigung Samstag",
      quantity: 1,
      unit: "Einsatz",
      frequency: "nach Bedarf",
      working_hours: hours,
    },
    {
      description: "Unterhaltsreinigung Sonntag",
      quantity: 1,
      unit: "Einsatz",
      frequency: "nach Abruf",
      working_hours: hours,
    },
    {
      description: "Grundreinigung",
      quantity: 1,
      unit: "jährlich",
      frequency: "1x jährlich",
      working_hours: deep,
    },
    {
      description: "Stundenverrechnungssatz für Sonderaufträge",
      quantity: 10,
      unit: "Stunden",
      frequency: "nach Bedarf",
      working_hours: 10,
    },
  ].map((raw) => normalizeItem(raw, "ki"));
}

describe("Explizite Jahresmengen statt KI-Zeitinterpretation", () => {
  it.each([
    [144, 3, 5, 5, 24, "3x wöchentlich", false, 496, 40],
    [144, 3.5, 10, 20, 26, "144 Arbeitstage", false, 645, 115],
    [240, 4, 15, 10, 40, "jährlich", true, 1110, 110],
  ] as const)(
    "rechnet %s Arbeitstage mit %s Std./Tag",
    (days, hours, sat, sun, deep, frequency, annual, expected, evaluation) => {
      const items = reconcileWorkingTime(
        rows(hours, days, deep, frequency, annual),
        priceSheet(days, hours, sat, sun, deep),
      );
      const summary = summarizeHours(items);
      expect(summary.annualHoursTotal).toBe(expected);
      expect(summary.evaluationHours).toBe(evaluation);
      expect(summary.unresolvedItems).toBe(0);
      expect(items[0]?.working_hours).toBe(hours);
      expect(items[0]?.working_time?.executions_per_year).toBe(days);
      expect(aggregateByCategory(items).reduce((s, row) => s + row.hours, 0)).toBe(expected);
      expect(recommendPrice(items, DEFAULT_PRICE_INPUTS).annualHours).toBe(expected);
      expect(items.every((i) => i.calculation.own_unit_price === null && !i.approved)).toBe(true);
    },
  );

  it("übernimmt abweichende Arbeitstage aus der Quelle statt feste Hallenwerte zu verwenden", () => {
    const items = reconcileWorkingTime(
      rows(2, 101, 7, "5x wöchentlich"),
      priceSheet(101, 2, 2, 3, 7),
    );
    expect(summarizeHours(items).annualHoursTotal).toBe(229);
  });
  it("verwendet eine ausdrücklich geprüfte eigene Frequenz", () => {
    const items = reconcileWorkingTime(
      rows(3, 144, 24, "3x wöchentlich"),
      priceSheet(144, 3, 5, 5, 24),
    );
    items[0]!.calculation = {
      ...emptyCalculation(),
      own_frequency: { label: "geprüft", perYear: 100 },
    };
    expect(summarizeHours(items).annualHoursTotal).toBe(364);
  });
  it("rät bei widersprüchlichen Bewertungsmengen nicht und sperrt die Preisempfehlung", () => {
    const text = priceSheet(144, 3, 5, 5, 24).replace("SAMSTAG x 5", "SAMSTAG x 6");
    const items = reconcileWorkingTime(rows(3, 144, 24, "3x wöchentlich"), text);
    expect(items[1]?.working_time?.basis).toBe("unknown");
    expect(summarizeHours(items).unresolvedItems).toBe(1);
    expect(recommendPrice(items, DEFAULT_PRICE_INPUTS).complete).toBe(false);
    expect(validateItems(items).some((i) => i.field === "document" && i.level === "error")).toBe(
      true,
    );
    items[1]!.calculation = { ...emptyCalculation(), own_unit_price: 10, pricing_basis: "year" };
    expect(canRelease(items[1]!)).toBe(false);
  });
  it("erfindet keinen Einsatz, wenn die Quelle keine Wochenendanzahl nennt", () => {
    const text = priceSheet(144, 3, 5, 5, 24).replace(
      /Für die Angebotswertung[^\n]+\nWertungseintrag[^\n]+/,
      "Abruf nach Bedarf",
    );
    const items = reconcileWorkingTime(rows(3, 144, 24, "3x wöchentlich"), text);
    expect(summarizeHours(items).unresolvedItems).toBe(2);
    expect(summarizeHours(items).annualHoursTotal).toBe(466);
  });
  it("verwirft den Zeitnachweis nach Änderungen an den Quelldaten", () => {
    const [item] = reconcileWorkingTime(
      rows(3, 144, 24, "3x wöchentlich"),
      priceSheet(144, 3, 5, 5, 24),
    );
    const updated = updateLvItem(item!, { working_hours: 4 });
    expect(updated.working_time?.basis).toBe("unknown");
    expect(summarizeHours([updated]).unresolvedItems).toBe(1);
  });
});

it("verarbeitet durch PDF-Zeilenumbrüche getrennte Wörter", () => {
  const text = priceSheet(240, 4, 15, 10, 40)
    .replace(/Reinigungszeit/g, "Reini-\ngungszeit")
    .replace(/Veranstaltungen/g, "Ver-\nanstaltungen");
  const items = reconcileWorkingTime(rows(4, 240, 40, "jährlich", true), text);
  expect(summarizeHours(items).annualHoursTotal).toBe(1110);
  expect(summarizeHours(items).unresolvedItems).toBe(0);
});

it("blockiert auch strukturierte KI-Zeitansätze ohne Einsatzanzahl", () => {
  const item = normalizeItem(
    {
      description: "Reinigung nach Abruf",
      quantity: 1,
      unit: "Jahr",
      working_hours: 4,
      working_hours_basis: "execution",
      executions_per_year: 0,
      frequency: "nach Bedarf",
    },
    "ki",
  );
  expect(summarizeHours([item]).unresolvedItems).toBe(1);
  expect(recommendPrice([item], DEFAULT_PRICE_INPUTS).complete).toBe(false);
});
it("multipliziert ausdrücklich ausgewiesene Jahresstunden nicht ein zweites Mal", () => {
  const item = normalizeItem(
    {
      description: "Reinigung 240 Arbeitstage",
      quantity: 240,
      unit: "Tage",
      working_hours: 960,
      working_hours_basis: "annual_total",
      executions_per_year: 240,
      frequency: "5x wöchentlich",
    },
    "ki",
  );
  expect(summarizeHours([item]).annualHoursTotal).toBe(960);
});
