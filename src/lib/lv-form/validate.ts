import { deriveLvValues } from "./derive";
import { fieldLabel } from "./fields";
import { formatCents, formatGermanNumber } from "./number";
import type { LvConstraint, LvDerived, LvFieldKey, LvInputs, LvWarning } from "./types";

/**
 * Plausibilitätsprüfung. Harte Warnungen blockieren den Export,
 * bis der Benutzer die Abweichung ausdrücklich bestätigt.
 */
export function validateLvForm(
  inputs: LvInputs,
  derived: LvDerived,
  constraints: LvConstraint[],
): LvWarning[] {
  const warnings: LvWarning[] = [];

  const minMonth = constraints.find((c) => c.kind === "min_hours_month");
  if (minMonth && inputs.unterhalt_stunden_monat > 0 && inputs.unterhalt_stunden_monat < minMonth.value) {
    warnings.push({
      level: "hard",
      message: `Die angesetzten ${formatGermanNumber(inputs.unterhalt_stunden_monat)} Std./Monat liegen unter dem geforderten Mindestumfang von ${formatGermanNumber(minMonth.value)} Std./Monat.`,
      detail: `Seite ${minMonth.pageIndex + 1}: „${minMonth.sourceLine}“`,
    });
  }

  const minYear = constraints.find((c) => c.kind === "min_hours_year");
  if (minYear && inputs.grund_stunden_jahr > 0 && inputs.grund_stunden_jahr < minYear.value) {
    warnings.push({
      level: "hard",
      message: `Die angesetzten ${formatGermanNumber(inputs.grund_stunden_jahr)} Std./Jahr liegen unter dem geforderten Mindestumfang von ${formatGermanNumber(minYear.value)} Std./Jahr.`,
      detail: `Seite ${minYear.pageIndex + 1}: „${minYear.sourceLine}“`,
    });
  }

  if (inputs.unterhalt_pauschale_monat <= 0) {
    warnings.push({ level: "hard", message: "Der Pauschalpreis pro Monat ist 0,00 €." });
  }
  if (inputs.unterhalt_stunden_monat <= 0) {
    warnings.push({ level: "hard", message: "Es sind keine Stunden pro Monat hinterlegt." });
  }
  if (inputs.sonder_stundensatz <= 0) {
    warnings.push({
      level: "hard",
      message: "Der Stundenverrechnungssatz für Sonderaufträge ist 0,00 €.",
    });
  }

  if (inputs.unterhalt_stunden_monat > 0) {
    const rate = inputs.unterhalt_pauschale_monat / inputs.unterhalt_stunden_monat / 100;
    if (rate < 15 || rate > 60) {
      warnings.push({
        level: "soft",
        message: `Rechnerischer Stundensatz Unterhaltsreinigung: ${formatGermanNumber(rate)} €/Std. – bitte prüfen.`,
      });
    }
  }
  if (inputs.mwst_satz !== 19) {
    warnings.push({
      level: "soft",
      message: `Abweichender Mehrwertsteuersatz: ${formatGermanNumber(inputs.mwst_satz)} %.`,
    });
  }
  if (derived.jahr_netto <= 0) {
    warnings.push({ level: "soft", message: "Der Jahresbetrag netto beträgt 0,00 €." });
  } else {
    const quota = constraints.find((c) => c.kind === "fixed_quota_year");
    if (quota && inputs.sonder_kontingent > 0 && inputs.sonder_kontingent !== quota.value) {
      warnings.push({
        level: "soft",
        message: `Das fiktive Stundenkontingent weicht von der Vorgabe (${formatGermanNumber(quota.value)} Std./Jahr) ab.`,
        detail: `Seite ${quota.pageIndex + 1}: „${quota.sourceLine}“`,
      });
    }
  }

  if (derived.jahr_brutto > 0 && derived.jahr_brutto < derived.jahr_netto) {
    warnings.push({
      level: "soft",
      message: `Bruttobetrag (${formatCents(derived.jahr_brutto)} €) ist kleiner als der Nettobetrag.`,
    });
  }

  return warnings;
}

export function hasBlockingWarnings(warnings: LvWarning[]): boolean {
  return warnings.some((w) => w.level === "hard");
}

/** Kontext der Zuordnung (AcroForm-Felder bzw. gesetzte Marker). */
export type LvAssignmentContext = {
  type: "acroform" | "flat";
  /** Alle zugeordneten Kennzahlen – Reihenfolge egal, Duplikate zählen. */
  assignedKeys: LvFieldKey[];
  /** Anzahl gesetzter, aber noch nicht zugeordneter Marker (nur flache PDFs). */
  unassignedMarkers: number;
  /** Wahr, wenn keine Textebene gefunden wurde. */
  scanned: boolean;
};

/**
 * Prüft die Zuordnung vor dem Export: fehlende, doppelte oder unvollständige
 * Zuordnungen führen zu klaren Hinweisen statt zu stillen Fehlausgaben.
 */
export function validateLvAssignment(ctx: LvAssignmentContext): LvWarning[] {
  const warnings: LvWarning[] = [];
  const counts = new Map<LvFieldKey, number>();
  for (const key of ctx.assignedKeys) counts.set(key, (counts.get(key) ?? 0) + 1);

  if (ctx.assignedKeys.length === 0) {
    warnings.push({
      level: "hard",
      message:
        ctx.type === "acroform"
          ? "Es ist noch kein Formularfeld einer Kennzahl zugeordnet."
          : "Es ist noch keine Position im PDF einer Kennzahl zugeordnet.",
    });
  }

  const duplicates = [...counts.entries()].filter(([, n]) => n > 1);
  for (const [key, n] of duplicates) {
    warnings.push({
      level: "hard",
      message: `„${fieldLabel(key)}" ist ${n}× zugeordnet – der Wert würde mehrfach gedruckt.`,
    });
  }

  const missingTotals = (["jahr_netto", "mwst_betrag", "jahr_brutto"] as LvFieldKey[]).filter(
    (k) => !counts.has(k),
  );
  if (ctx.assignedKeys.length > 0 && missingTotals.length > 0) {
    warnings.push({
      level: "soft",
      message: `Ohne Zuordnung bleiben: ${missingTotals.map((k) => fieldLabel(k)).join(", ")}.`,
    });
  }

  if (ctx.unassignedMarkers > 0) {
    warnings.push({
      level: "soft",
      message: `${ctx.unassignedMarkers} gesetzte Position(en) ohne Kennzahl werden nicht gedruckt.`,
    });
  }

  if (ctx.scanned) {
    warnings.push({
      level: "soft",
      message: "Gescanntes PDF ohne Textebene – bitte jede Position visuell gegenprüfen.",
    });
  }

  return warnings;
}

/**
 * Endkontrolle der Rechenkette: die angezeigten Werte werden erneut aus den
 * Eingaben berechnet und cent-genau verglichen.
 */
export function validateLvArithmetic(inputs: LvInputs, derived: LvDerived): LvWarning[] {
  const warnings: LvWarning[] = [];
  const expected = deriveLvValues(inputs);
  const rows: { key: keyof LvDerived; label: string }[] = [
    { key: "unterhalt_wertung", label: "Wertungseintrag Unterhaltsreinigung" },
    { key: "grund_wertung", label: "Wertungseintrag Grundreinigung" },
    { key: "sonder_wertung", label: "Wertungseintrag Sonderaufträge" },
    { key: "jahr_netto", label: "Jahresbetrag netto" },
    { key: "mwst_betrag", label: "Mehrwertsteuer" },
    { key: "jahr_brutto", label: "Jahresbetrag brutto" },
  ];
  for (const row of rows) {
    if (derived[row.key] !== expected[row.key]) {
      warnings.push({
        level: "hard",
        message: `Rechenkontrolle fehlgeschlagen: ${row.label} zeigt ${formatCents(derived[row.key])} €, erwartet ${formatCents(expected[row.key])} €.`,
      });
    }
  }

  const sum = derived.unterhalt_wertung + derived.grund_wertung + derived.sonder_wertung;
  if (sum !== derived.jahr_netto) {
    warnings.push({
      level: "hard",
      message: `Netto-Summenprüfung: Einzelwertungen ergeben ${formatCents(sum)} €, ausgewiesen sind ${formatCents(derived.jahr_netto)} €.`,
    });
  }
  if (derived.jahr_netto + derived.mwst_betrag !== derived.jahr_brutto) {
    warnings.push({
      level: "hard",
      message: "Brutto-Prüfung: netto + MwSt. ergibt nicht den ausgewiesenen Bruttobetrag.",
    });
  }

  if (inputs.mwst_satz < 0 || inputs.mwst_satz > 25) {
    warnings.push({
      level: "hard",
      message: `Unplausibler Mehrwertsteuersatz: ${formatGermanNumber(inputs.mwst_satz)} %.`,
    });
  }

  const negatives = Object.entries(inputs).filter(([, v]) => typeof v === "number" && v < 0);
  if (negatives.length > 0) {
    warnings.push({ level: "hard", message: "Negative Eingabewerte sind nicht zulässig." });
  }

  if (inputs.grund_pauschale_jahr > 0 && inputs.grund_stunden_jahr <= 0) {
    warnings.push({
      level: "soft",
      message: "Grundreinigung: Pauschale hinterlegt, aber keine Stunden pro Jahr.",
    });
  }
  if (inputs.sonder_stundensatz > 0 && inputs.sonder_kontingent <= 0) {
    warnings.push({
      level: "soft",
      message: "Sonderaufträge: Stundensatz hinterlegt, aber kein Stundenkontingent.",
    });
  }

  return warnings;
}
