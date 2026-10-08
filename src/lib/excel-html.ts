/** Escape untrusted strings before placing them into an HTML-based .xls export. */
export function escapeExcelHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Prevent Excel from interpreting a customer-supplied string as a formula. */
export function excelHtmlCell(value: unknown): string {
  const raw = String(value ?? "");
  const trimmed = raw.replace(/^[\t\r\n ]+/, "");
  const numeric = /^-?\d+(?:[.,]\d+)?(?:\s*€)?$/.test(trimmed);
  const formula = /^[=+@]/.test(trimmed) || (trimmed.startsWith("-") && !numeric);
  if (formula) {
    return `<td style="mso-number-format:'\\\\@'">${escapeExcelHtml("'" + raw)}</td>`;
  }
  return `<td>${escapeExcelHtml(raw)}</td>`;
}
