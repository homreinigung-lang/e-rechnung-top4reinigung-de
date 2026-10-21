import type { LvValidationIssue } from './types';

export function buildLvReviewReport(issues: LvValidationIssue[]): string {
  const errors = issues.filter(i => i.level === 'error').length;
  const warnings = issues.length - errors;
  const lines = [`LV-Prüfbericht`, `Fehler: ${errors}; Hinweise: ${warnings}`, '', 'Prüfpunkte:'];
  for (const issue of issues) lines.push(`- ${issue.message} ${issue.hint}`);
  if (!issues.length) lines.push('- Keine Auffälligkeiten erkannt.');
  lines.push('', 'Bitte Originalunterlagen prüfen. Diese Prüfung ist nicht vollständig.');
  return lines.join('\n');
}

export function buildBieterfragen(
  issues: LvValidationIssue[],
  items: Array<{ id: string; item_number: string; source_page: number | null }>,
): string {
  const questions: string[] = [];
  const seen = new Set<string>();
  for (const issue of issues) {
    const question =
      issue.field === "quantity" ? "Welche verbindliche Menge ist vorgesehen?" :
      issue.field === "unit" ? "Welche Abrechnungseinheit gilt?" :
      issue.field === "frequency" ? "Welcher Reinigungsturnus ist verbindlich?" :
      issue.field === "document" ? "Können Sie die Mengen-, Flächen- oder Zeitangaben klarstellen?" :
      issue.field === "description" && issue.message.includes("fehlt") ? "Können Sie den Leistungsumfang präzisieren?" :
      null;
    if (!question) continue;
    const item = items.find(i => i.id === issue.itemId);
    const prefix = item ? `Position ${item.item_number || "ohne Nummer"}${item.source_page ? `, Seite ${item.source_page}` : ""}` : "Dokument";
    const line = `- ${prefix}: ${question}`;
    if (!seen.has(line)) {
      seen.add(line);
      questions.push(line);
    }
  }
  return [
    "Entwurf Bieterfragen – vor Versand fachlich prüfen",
    "",
    "Sehr geehrte Damen und Herren,",
    "zu den Vergabeunterlagen bitten wir um Klärung folgender Punkte:",
    "",
    ...(questions.length ? questions : ["Keine automatisch vorgeschlagenen Fragen."]),
    "",
    "Mit freundlichen Grüßen",
    "Hom Reinigung Service",
  ].join("\n");
}
