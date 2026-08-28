import { formatCents, formatGermanNumber } from "./number";
import type { LvConstraint, LvDerived, LvInputs, LvWarning } from "./types";

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
