/**
 * Ersetzt Zeichen, die die WinAnsi-Kodierung der Standard-PDF-Schriften
 * (Helvetica & Co.) nicht darstellen kann. Ohne diese Bereinigung wirft
 * pdf-lib beim Zeichnen eine Exception (z. B. bei schmalen Leerzeichen aus
 * der de-DE-Zahlenformatierung oder bei typografischen Strichen).
 */
export function cleanPdfText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\u202f|\u2009|\u2007/g, "\u00a0")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019\u201a\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201e\u2033]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[^\S\n]/g, (c) => (c === "\u00a0" ? "\u00a0" : " "));
}
