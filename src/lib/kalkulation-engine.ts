/**
 * Zentrale Rechenlogik der Kalkulation.
 *
 * Grundsatz (Single Source of Truth): Die Gesamtsumme entsteht AUSSCHLIESSLICH
 * aus den Positionen des Leistungsverzeichnisses. Die Grundkalkulation ist nur
 * ein Zwischenschritt, der Positionen erzeugt – sie wird nie zusätzlich addiert.
 */

export type CalcPosition = {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
};

/** Fester, höherer Satz für Glas- und Fensterreinigung (netto, pro Stunde). */
export const GLASS_HOURLY_RATE = 38;
/** Realistische Leistung Glasreinigung in m² pro Stunde. */
export const GLASS_SQM_PER_HOUR = 40;
/** Mindestpreis je Etage Treppenhausreinigung (netto) – verhindert 0,00 €. */
export const MIN_STAIR_RATE = 12.5;

export function round2(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

/** Erkennt Glas-/Fensterleistungen anhand des Positionstextes. */
export function isGlassText(text: string): boolean {
  return /glas|fenster|verglas|scheib/i.test(text);
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
};

/**
 * Plausibilitätsprüfung: meldet unrealistische Kombinationen
 * (z. B. 3 Etagen und 8 Räume auf 18 m²).
 */
export function checkPlausibility(input: PlausibilityInput): string[] {
  const warnings: string[] = [];
  const area = Number(input.areaSqm) || 0;
  const rooms = Number(input.rooms) || 0;
  const floors = Number(input.floors) || 0;
  const toilets = Number(input.toilets) || 0;

  if (area <= 0) return warnings;

  if (rooms > 0 && area / rooms < 6) {
    warnings.push(
      `Nur ${round2(area / rooms)} m² je Raum bei ${rooms} Räumen – bitte die Flächenangabe prüfen (Tippfehler, z. B. 18 statt 180 m²?).`,
    );
  }
  if (floors > 1 && area / floors < 25) {
    warnings.push(
      `${floors} Etagen auf nur ${round2(area)} m² Gesamtfläche – bitte Fläche oder Etagenanzahl prüfen.`,
    );
  }
  if (toilets > 0 && area < toilets * 15) {
    warnings.push(
      `${toilets} Sanitärbereiche bei ${round2(area)} m² – die Fläche wirkt zu klein, bitte prüfen.`,
    );
  }
  if (area < 20 && (rooms > 2 || floors > 1)) {
    warnings.push(
      "Die angegebene Fläche ist ungewöhnlich klein für die genannte Raum-/Etagenanzahl. Bitte Flächenangabe kontrollieren.",
    );
  }
  return warnings;
}

export type ConsolidatedInput = {
  typeValue: string;
  typeLabel: string;
  mode: "area" | "hours";
  areaSqm: number;
  pricePerSqm: number;
  hours: number;
  hourlyRate: number;
  visitsPerMonth: number;
  stairs: boolean;
  floors: number;
  stairRate: number;
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
  const visits = Math.max(1, round2(input.visitsPerMonth || 1));
  const positions: CalcPosition[] = [];
  const glass = input.typeValue === "glas";

  if (glass) {
    // Glas-/Fensterreinigung: fester, höherer Stundensatz.
    const hoursPerVisit =
      input.mode === "hours"
        ? input.hours
        : input.areaSqm > 0
          ? input.areaSqm / GLASS_SQM_PER_HOUR
          : 0;
    const qty = round2(hoursPerVisit * visits);
    if (qty > 0) {
      positions.push({
        description: `${input.typeLabel} – ${round2(input.areaSqm)} m² Glasfläche, ${visits} Einsätze/Monat`,
        quantity: qty,
        unit: "Std.",
        unit_price: round2(Math.max(input.hourlyRate, GLASS_HOURLY_RATE)),
      });
    }
  } else if (input.mode === "area") {
    const perVisit = round2(input.areaSqm * input.pricePerSqm);
    if (perVisit > 0) {
      positions.push({
        description: `${input.typeLabel} – ${round2(input.areaSqm)} m² × ${round2(input.pricePerSqm)} €/m² je Einsatz`,
        quantity: visits,
        unit: "Einsatz",
        unit_price: perVisit,
      });
    }
  } else {
    const qty = round2(input.hours * visits);
    if (qty > 0 && input.hourlyRate > 0) {
      positions.push({
        description: `${input.typeLabel} – ${round2(input.hours)} Std. je Einsatz, ${visits} Einsätze/Monat`,
        quantity: qty,
        unit: "Std.",
        unit_price: round2(input.hourlyRate),
      });
    }
  }

  if (input.stairs) {
    const floors = Math.max(1, Math.round(input.floors || 1));
    const rate = round2(input.stairRate > 0 ? input.stairRate : MIN_STAIR_RATE);
    positions.push({
      description: `Treppenhausreinigung – ${floors} Etagen, ${visits} Einsätze/Monat`,
      quantity: round2(floors * visits),
      unit: "Etage",
      unit_price: rate,
    });
    if (input.hasLift && input.liftRate > 0) {
      positions.push({
        description: "Aufzugkabine reinigen",
        quantity: visits,
        unit: "Einsatz",
        unit_price: round2(input.liftRate),
      });
    }
  }

  for (const extra of input.extras) {
    if (extra.price > 0) {
      positions.push({
        description: extra.label,
        quantity: 1,
        unit: "Pauschal",
        unit_price: round2(extra.price),
      });
    }
  }

  if (input.travel > 0) {
    positions.push({
      description: "Anfahrtspauschale",
      quantity: 1,
      unit: "Pauschal",
      unit_price: round2(input.travel),
    });
  }

  const pct = Math.min(100, Math.max(0, input.discountPercent || 0));
  if (pct > 0 && positions.length > 0) {
    const sum = positions.reduce((s, p) => s + p.quantity * p.unit_price, 0);
    positions.push({
      description: `Rabatt ${round2(pct)} %${input.discountReason ? ` – ${input.discountReason}` : ""}`,
      quantity: 1,
      unit: "Pauschal",
      unit_price: -round2((sum * pct) / 100),
    });
  }

  return positions;
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
      let quantity = round2(item.quantity);
      let price = round2(item.unit_price);
      const unit = item.unit.trim() || "Std.";

      if (quantity <= 0) quantity = 1;

      if (price <= 0) {
        if (isGlassText(description)) price = GLASS_HOURLY_RATE;
        else if (isStairText(description))
          price = round2(fallback.stairRate > 0 ? fallback.stairRate : MIN_STAIR_RATE);
        else price = round2(fallback.hourlyRate > 0 ? fallback.hourlyRate : 35);
      } else if (isGlassText(description) && /std|stunde/i.test(unit)) {
        price = round2(Math.max(price, GLASS_HOURLY_RATE));
      }

      return { description, quantity, unit, unit_price: price };
    })
    .filter((i) => i.description.length > 0 && Math.abs(i.quantity * i.unit_price) >= 0.01);
}

/** Netto-Summe der Positionen – die einzige gültige Gesamtsumme. */
export function positionsTotal(items: { quantity: number; unit_price: number }[]): number {
  return round2(items.reduce((s, i) => s + round2(i.quantity * i.unit_price), 0));
}
