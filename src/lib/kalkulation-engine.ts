/**
 * Zentrale Rechenlogik der Kalkulation.
 *
 * Grundsatz (Single Source of Truth): Die Gesamtsumme entsteht AUSSCHLIESSLICH
 * aus den Positionen des Leistungsverzeichnisses. Die Grundkalkulation ist nur
 * ein Zwischenschritt, der Positionen erzeugt – sie wird nie zusätzlich addiert.
 */
import { STAIR_RATE_PER_FLOOR } from "@/lib/constants";
import { formatMoney, formatNumber } from "@/lib/format";

export type CalcPosition = {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  kind?: "travel" | "extra" | "stairs" | "lift" | "discount";
};

/** Fester, höherer Satz für Glas- und Fensterreinigung (netto, pro Stunde). */
export const GLASS_HOURLY_RATE = 38;
/** Realistische Leistung Glasreinigung in m² pro Stunde. */
export const GLASS_SQM_PER_HOUR = 40;
/** Mindestpreis je Etage Treppenhausreinigung (netto) – verhindert 0,00 €. */
export const MIN_STAIR_RATE = STAIR_RATE_PER_FLOOR;

/**
 * Geldbeträge werden für Vergleiche und Summen immer als ganze Cent verarbeitet.
 * Die Rundung selbst liegt zentral in src/lib/money.ts.
 */
import { toCents, fromCents, round2 } from "@/lib/money";
export { toCents, fromCents, round2 };

/** Erkennt Glas-/Fensterleistungen anhand des Positionstextes. */
export function isGlassText(text: string): boolean {
  return /glas|verglas|scheib|fenster(?!bank|bänke|brett|rahmen)/i.test(text);
}

/** Erkennt Treppen-/Treppenhausleistungen anhand des Textes. */
export function isStairText(text: string): boolean {
  return /treppe|treppenhaus|stiege|etagenflur/i.test(text);
}

/** Liest Treppen-Hinweise und Etagenanzahl aus einem Freitext. */
export function detectStairs(text: string): { stairs: boolean; floors: number } {
  const stairs = isStairText(text);
  const match = text.match(/(\d{1,2})\s*(etagen|geschosse?|stockwerke?|og\b)/i);
  const floors = match ? Number(match[1]) : 0;
  return { stairs, floors: Number.isFinite(floors) ? floors : 0 };
}

export type PlausibilityInput = {
  areaSqm: number;
  rooms: number;
  floors: number;
  toilets?: number;
  /** Netto-Monatssumme der Kalkulation (optional, für die Preisprüfung). */
  monthlyNet?: number;
  oneTime?: boolean;
  /** Kalkulierte Arbeitsstunden pro Monat (optional, für die Preisprüfung). */
  hoursPerMonth?: number;
};

/** Obergrenze für einen plausiblen Monatspreis je m² (Unterhaltsreinigung). */
export const MAX_MONTHLY_EUR_PER_SQM = 2.5;
/** Untergrenze für einen wirtschaftlich tragfähigen Stundenerlös. */
export const MIN_EFFECTIVE_HOURLY_RATE = 25;

/**
 * Plausibilitätsprüfung: meldet unrealistische Kombinationen
 * (z. B. 3 Etagen und 8 Räume auf 18 m²) sowie unrealistische Preisniveaus.
 */
export function checkPlausibility(input: PlausibilityInput): string[] {
  const warnings: string[] = [];
  const area = Number(input.areaSqm) || 0;
  const rooms = Number(input.rooms) || 0;
  const floors = Number(input.floors) || 0;
  const toilets = Number(input.toilets) || 0;
  const monthly = Number(input.monthlyNet) || 0;
  const hoursPerMonth = Number(input.hoursPerMonth) || 0;

  // Der Stundenerlös lässt sich auch ohne Flächenangabe prüfen.
  // Fehlende Fläche darf diese unabhängige Wirtschaftlichkeitsprüfung nicht überspringen.
  if (monthly > 0 && hoursPerMonth > 0) {
    const effective = monthly / hoursPerMonth;
    if (effective < MIN_EFFECTIVE_HOURLY_RATE) {
      warnings.push(
        `Rechnerischer Stundenerlös nur ${formatMoney(round2(effective))} €/Std. – unterhalb des allgemeinen Richtwerts von ${formatNumber(MIN_EFFECTIVE_HOURLY_RATE)} €/Std. Bitte individuelle Kosten prüfen.`,
      );
    }
  }

  if (area <= 0) return warnings;

  if (rooms > 0 && area / rooms < 6) {
    warnings.push(
      `Nur ${formatNumber(round2(area / rooms))} m² je Raum bei ${rooms} Räumen – bitte die Flächenangabe prüfen (Tippfehler, z. B. 18 statt 180 m²?).`,
    );
  }
  if (floors > 1 && area / floors < 25) {
    warnings.push(
      `${floors} Etagen auf nur ${formatNumber(round2(area))} m² Gesamtfläche – bitte Fläche oder Etagenanzahl prüfen.`,
    );
  }
  if (toilets > 0 && area < toilets * 15) {
    warnings.push(
      `${toilets} Sanitärbereiche bei ${formatNumber(round2(area))} m² – die Fläche wirkt zu klein, bitte prüfen.`,
    );
  }
  if (area < 20 && (rooms > 2 || floors > 1)) {
    warnings.push(
      "Die angegebene Fläche ist ungewöhnlich klein für die genannte Raum-/Etagenanzahl. Bitte Flächenangabe kontrollieren.",
    );
  }
  if (!input.oneTime && monthly > 0) {
    const perSqm = monthly / area;
    if (perSqm > MAX_MONTHLY_EUR_PER_SQM) {
      warnings.push(
        `Der Monatspreis entspricht ${formatNumber(round2(perSqm))} €/m² – marktüblich sind bis ca. ${MAX_MONTHLY_EUR_PER_SQM.toFixed(2).replace(".", ",")} €/m² pro Monat. Bitte m²-Preis oder Turnus prüfen.`,
      );
    }
  }
  return warnings;
}

export type ConsolidatedInput = {
  typeValue: string;
  typeLabel: string;
  /** Aktueller gespeicherter Leistungswert, 0 bei fehlender Zuordnung. */
  performanceSqmPerHour?: number;
  oneTime?: boolean;
  mode: "area" | "hours";
  areaSqm: number;
  pricePerSqm: number;
  hours: number;
  hourlyRate: number;
  visitsPerMonth: number;
  stairs: boolean;
  floors: number;
  stairRate: number;
  /** Eigener Turnus der Treppenhausreinigung (Einsätze/Monat). 0 = wie Grundleistung. */
  stairVisitsPerMonth?: number;
  hasLift: boolean;
  liftRate: number;
  extras: { label: string; price: number }[];
  travel: number;
  discountPercent: number;
  discountReason: string;
};

/**
 * Erzeugt den konsolidierten Positionssatz der Grundkalkulation.
 * Jede Position ist kaufmännisch auf 2 Nachkommastellen gerundet.
 */
export function buildConsolidatedPositions(input: ConsolidatedInput): CalcPosition[] {
  // Monatsdurchschnitte dürfen unter 1 liegen (z. B. jährlich: 1/12).
  const requestedVisits = Number(input.visitsPerMonth);
  const visits = input.oneTime
    ? 1
    : Number.isFinite(requestedVisits) && requestedVisits > 0
      ? requestedVisits
      : 1;
  const positions: CalcPosition[] = [];
  const glass = input.typeValue === "glas";

  if (glass) {
    const hoursPerVisit =
      input.mode === "hours"
        ? input.hours
        : input.areaSqm > 0
          ? input.performanceSqmPerHour && input.performanceSqmPerHour > 0
            ? input.areaSqm / input.performanceSqmPerHour
            : 0
          : 0;
    const qty = round2(hoursPerVisit * visits);
    if (qty > 0 && input.hourlyRate > 0) {
      positions.push({
        description: `${input.typeLabel} – ${formatNumber(round2(input.areaSqm))} m² Glasfläche, ${input.oneTime ? "einmalige Reinigung" : `${formatNumber(visits)} Einsätze/Monat`}`,
        quantity: qty,
        unit: "Std.",
        unit_price: round2(input.hourlyRate),
      });
    }
  } else if (input.mode === "area") {
    const perVisit = round2(input.areaSqm * input.pricePerSqm);
    if (perVisit > 0) {
      positions.push({
        description: `${input.typeLabel} – ${formatNumber(round2(input.areaSqm))} m² × ${formatMoney(round2(input.pricePerSqm))} €/m² je Einsatz${input.oneTime ? " – einmalige Reinigung" : !Number.isInteger(visits) ? `, durchschnittlich ${formatNumber(visits)} Einsätze/Monat` : ""}`,
        quantity: !input.oneTime && !Number.isInteger(visits) ? 1 : visits,
        unit: !input.oneTime && !Number.isInteger(visits) ? "Monat" : "Einsatz",
        unit_price: !input.oneTime && !Number.isInteger(visits) ? round2(perVisit * visits) : perVisit,
      });
    }
  } else {
    const qty = round2(input.hours * visits);
    if (qty > 0 && input.hourlyRate > 0) {
      positions.push({
        description: `${input.typeLabel} – ${formatNumber(round2(input.hours))} Std. je Einsatz, ${input.oneTime ? "einmalige Reinigung" : `${formatNumber(visits)} Einsätze/Monat`}`,
        quantity: qty,
        unit: "Std.",
        unit_price: round2(input.hourlyRate),
      });
    }
  }

  if (input.stairs) {
    const floors = Math.max(1, Math.round(input.floors || 1));
    const rate = round2(input.stairRate > 0 ? input.stairRate : MIN_STAIR_RATE);
    const stairVisits = input.oneTime
      ? 1
      : Number.isFinite(Number(input.stairVisitsPerMonth)) && Number(input.stairVisitsPerMonth) > 0
        ? Number(input.stairVisitsPerMonth)
        : visits;
    positions.push({
      description: `Treppenhausreinigung – ${floors} Etagen, ${input.oneTime ? "einmalige Reinigung" : `${formatNumber(stairVisits)} Einsätze/Monat`}`,
      quantity: !input.oneTime && !Number.isInteger(stairVisits) ? 1 : floors * stairVisits,
      unit: !input.oneTime && !Number.isInteger(stairVisits) ? "Monat" : "Etage",
      unit_price: !input.oneTime && !Number.isInteger(stairVisits) ? round2(floors * stairVisits * rate) : rate,
      kind: "stairs",
    });
    if (input.hasLift && input.liftRate > 0) {
      positions.push({
        description: !input.oneTime && !Number.isInteger(stairVisits) ? `Aufzugkabine reinigen – durchschnittlich ${formatNumber(stairVisits)} Einsätze/Monat` : "Aufzugkabine reinigen",
        quantity: !input.oneTime && !Number.isInteger(stairVisits) ? 1 : stairVisits,
        unit: !input.oneTime && !Number.isInteger(stairVisits) ? "Monat" : "Einsatz",
        unit_price: !input.oneTime && !Number.isInteger(stairVisits) ? round2(input.liftRate * stairVisits) : round2(input.liftRate),
        kind: "lift",
      });
    }
  }

  for (const extra of input.extras) {
    if (extra.price > 0) {
      positions.push({
        description: extra.label,
        kind: "extra",
        quantity: 1,
        unit: "Pauschal",
        unit_price: round2(extra.price),
      });
    }
  }

  if (input.travel > 0) {
    positions.push({
      description: !input.oneTime && !Number.isInteger(visits) ? `Anfahrtspauschale – durchschnittlich ${formatNumber(visits)} Einsätze/Monat` : "Anfahrtspauschale je Einsatz",
      quantity: !input.oneTime && !Number.isInteger(visits) ? 1 : visits,
      unit: !input.oneTime && !Number.isInteger(visits) ? "Monat" : "Einsatz",
      unit_price: !input.oneTime && !Number.isInteger(visits) ? round2(input.travel * visits) : round2(input.travel),
      kind: "travel",
    });
  }

  if (positions.length > 0) {
    const discount = buildDiscountPosition(positions, {
      percent: input.discountPercent || 0,
      amount: 0,
      reason: input.discountReason ?? "",
    });
    if (discount) positions.push(discount);
  }

  return positions;
}

/**
 * Erzeugt eine ausdrückliche, für den Kunden nachvollziehbare Rabattposition
 * (Prozentsatz und/oder fester Betrag). Ein Rabatt darf die positive
 * Zwischensumme niemals überschreiten; dadurch können Netto- und Bruttosumme
 * nicht durch einen Rabatt negativ werden.
 */
export function buildDiscountPosition(
  positions: CalcPosition[],
  discount: { percent: number; amount: number; reason: string },
): CalcPosition | null {
  const baseCents = Math.max(0, toCents(positionsTotal(positions)));
  if (baseCents <= 0) return null;

  const pct = Math.min(100, Math.max(0, Number(discount.percent) || 0));
  const fixedCents = Math.max(0, toCents(Number(discount.amount) || 0));
  const percentCents = pct > 0 ? Math.round((baseCents * pct) / 100) : 0;
  const requestedCents = percentCents + fixedCents;
  if (requestedCents <= 0) return null;

  const totalCents = Math.min(baseCents, requestedCents);
  const total = fromCents(totalCents);

  const parts: string[] = [];
  if (pct > 0) parts.push(`${formatNumber(pct)} %`);
  if (fixedCents > 0) parts.push(`Festbetrag ${formatMoney(fromCents(fixedCents))}`);
  const reason = discount.reason.trim();

  return {
    description: `Rabatt (${parts.join(" + ")})${reason ? ` – ${reason}` : ""}`,
    quantity: 1,
    unit: "Pauschal",
    unit_price: -total,
    kind: "discount",
  };
}

/**
 * Bereinigt KI-Positionen: sinnvolle Preise statt 0,00 €, saubere Rundung,
 * Glas-Positionen mit dem höheren Fixsatz.
 */
export function normalizeItems(
  items: CalcPosition[],
  fallback: { hourlyRate: number; stairRate: number; floors: number },
): CalcPosition[] {
  return items
    .map((item) => {
      const description = item.description.trim();
      const quantity = round2(item.quantity);
      let price = round2(item.unit_price);
      const unit = item.unit.trim() || "Std.";

      // Ungültige Mengen nicht stillschweigend zu einer Leistung machen.

      if (price === 0) {
        if (isGlassText(description)) price = GLASS_HOURLY_RATE;
        else if (isStairText(description))
          price = round2(fallback.stairRate > 0 ? fallback.stairRate : MIN_STAIR_RATE);
        else price = round2(fallback.hourlyRate > 0 ? fallback.hourlyRate : 35);
      } else if (isGlassText(description) && /std|stunde/i.test(unit)) {
        price = round2(Math.max(price, GLASS_HOURLY_RATE));
      }

      return { ...item, description, quantity, unit, unit_price: price };
    })
    .filter((i) => i.description.length > 0 && i.quantity > 0 && Math.abs(i.quantity * i.unit_price) >= 0.01);
}

/** Netto-Summe der Positionen – die einzige gültige Gesamtsumme. */
export function positionsTotal(items: { quantity: number; unit_price: number }[]): number {
  const totalCents = items.reduce(
    (sum, item) => sum + toCents(Number(item.quantity) * round2(item.unit_price)),
    0,
  );
  return fromCents(totalCents);
}

/** Umsatz ohne separat berechnete Nebenleistungen für die Rentabilitätsprüfung. */
export function profitabilityPositions<T extends CalcPosition>(positions: T[]): T[] {
  return positions.filter((position) =>
    !["travel", "extra", "stairs", "lift", "discount"].includes(position.kind ?? "") &&
    !/^(Anfahrtspauschale|Aufzugkabine reinigen|Treppenhausreinigung\s*[–-]\s*\d+\s+Etagen|Rabatt\s*\()/i.test(position.description) &&
    !["Fensterreinigung innen/außen", "Müllentsorgung"].includes(position.description)
  );
}
