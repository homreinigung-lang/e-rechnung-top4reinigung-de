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
