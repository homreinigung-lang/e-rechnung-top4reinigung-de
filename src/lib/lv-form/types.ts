/**
 * Typen für den PDF-Formular-Ausfüller (Leistungsverzeichnisse).
 * Eigenständiges Modul – bewusst ohne Bezug zur Kalkulations-Engine.
 */

/** Fachliche Kennzahl eines LV-Formulars. */
export type LvFieldKey =
  | "unterhalt_pauschale_monat"
  | "unterhalt_stunden_monat"
  | "unterhalt_wertung"
  | "grund_pauschale_jahr"
  | "grund_stunden_jahr"
  | "grund_wertung"
  | "sonder_stundensatz"
  | "sonder_kontingent"
  | "sonder_wertung"
  | "jahr_netto"
  | "mwst_satz"
  | "mwst_betrag"
  | "jahr_brutto";

export type LvFieldKind = "input" | "derived";

export type LvFieldMeta = {
  key: LvFieldKey;
  label: string;
  kind: LvFieldKind;
  /** Anzeigeeinheit, z. B. "€" oder "Std." */
  unit: string;
  /** Nachkommastellen für die Ausgabe im PDF. */
  decimals: number;
  /** Schlüsselwörter zur Erkennung im Dokument. */
  keywords: string[][];
};

export type Confidence = "high" | "medium" | "low";

/** Eine Marke auf einer Seite, an der ein Wert gedruckt werden soll. */
export type LvMarker = {
  id: string;
  key: LvFieldKey | null;
  pageIndex: number;
  /** Position in PDF-Punkten, Ursprung unten links. */
  x: number;
  y: number;
  /** Breite des erkannten Platzhalters in Punkten (nur informativ). */
  width: number;
  fontSize: number;
  confidence: Confidence;
  /** Zeilentext, in dem der Platzhalter gefunden wurde. */
  sourceLine: string;
  /** Vom Benutzer manuell gesetzt oder verschoben. */
  manual: boolean;
};

export type LvConstraint = {
  kind: "min_hours_month" | "min_hours_year" | "fixed_quota_year" | "vat_rate";
  value: number;
  pageIndex: number;
  sourceLine: string;
};

export type LvPageInfo = {
  index: number;
  /** Seitengröße in PDF-Punkten. */
  width: number;
  height: number;
  /** Gerendertes Seitenbild (data URL) für die Vorschau. */
  imageDataUrl: string;
  /** Renderbreite in CSS-Pixeln. */
  imageWidth: number;
  imageHeight: number;
};

export type LvAcroField = {
  name: string;
  suggestedKey: LvFieldKey | null;
};

export type LvDetection = {
  /** "acroform" = echtes Formular-PDF, "flat" = flaches PDF mit Unterstrichen. */
  type: "acroform" | "flat";
  pages: LvPageInfo[];
  markers: LvMarker[];
  constraints: LvConstraint[];
  acroFields: LvAcroField[];
  /** Wahr, wenn keine Textebene gefunden wurde (Scan). */
  scanned: boolean;
};

/** Basiswerte, die der Benutzer eingibt. Beträge in Cent, Stunden als Dezimalzahl. */
export type LvInputs = {
  unterhalt_pauschale_monat: number;
  unterhalt_stunden_monat: number;
  grund_pauschale_jahr: number;
  grund_stunden_jahr: number;
  sonder_stundensatz: number;
  sonder_kontingent: number;
  mwst_satz: number;
};

export type LvDerived = {
  unterhalt_wertung: number;
  grund_wertung: number;
  sonder_wertung: number;
  jahr_netto: number;
  mwst_betrag: number;
  jahr_brutto: number;
};

export type LvWarning = {
  level: "hard" | "soft";
  message: string;
  detail?: string;
};
