/**
 * Typen für die LV-Ausschreibungsanalyse (Gebäudereinigung).
 * Eigenständiges Modul – unabhängig vom PDF-Formular-Ausfüller.
 */

/** Erkannter Dokumenttyp. */
export type LvDocumentKind =
  | "detailed_lv"
  | "pricing_form"
  | "cleaning_spec"
  | "scanned_pdf"
  | "unsupported";

export type LvItemCategory =
  | "unterhaltsreinigung"
  | "glasreinigung"
  | "grundreinigung"
  | "sonderreinigung"
  | "winterdienst"
  | "verbrauchsmaterial"
  | "sonstiges";

/** Reinigungsintervall, normalisiert auf Einsätze pro Jahr. */
export type LvFrequency = {
  /** Originaltext aus dem Dokument, z. B. "5x wöchentlich". */
  label: string;
  /** Rechnerische Einsätze pro Jahr; null = unbekannt. */
  perYear: number | null;
};

/** Eigene Kalkulationsdaten – ausschließlich manuell erfasst. */
export type LvCalculation = {
  /** Eigener Einheitspreis (€). null = „Noch kein eigener Preis eingetragen". */
  own_unit_price: number | null;
  /** Eigene Arbeitskosten (€) je Position. */
  labor_cost: number | null;
  /** Materialkosten (€) je Position. */
  material_cost: number | null;
  /** Gemeinkosten (€) je Position. */
  overhead_cost: number | null;
  /** Gewinnmarge in Prozent. */
  profit_percent: number | null;
};

export type LvCalcStatus = "not_calculated" | "calculated_review" | "released";

/** Eine normalisierte Position aus der Ausschreibung. */
export type LvNormalizedItem = {
  id: string;
  /** Verknüpfung mit der aktuellen Analyse/Dokument-ID. */
  analysis_id: string;
  item_number: string;
  description: string;
  category: LvItemCategory;
  quantity: number | null;
  unit: string;
  frequency: LvFrequency;
  area_m2: number | null;
  working_hours: number | null;
  unit_price: number | null;
  total_price: number | null;
  vat_rate: number | null;
  /** 1-basierte Seitenzahl bzw. Zeilennummer der Quelle. */
  source_page: number | null;
  /** 0–1. */
  confidence_score: number;
  /** Erkennungsweg, z. B. "tabelle", "ki", "regel", "ocr". */
  source_method: string;
  approved: boolean;
};

/** Einzelne Summenzeile eines reinen Preisblatts. */
export type LvTotalLine = {
  label: string;
  amount: number;
  source_page: number | null;
};

export type LvValidationLevel = "error" | "warning";

export type LvValidationIssue = {
  itemId: string | null;
  field: "quantity" | "unit" | "frequency" | "unit_price" | "description" | "document";
  level: LvValidationLevel;
  message: string;
  hint: string;
};

export type LvProcessStep = {
  state: "ok" | "warn" | "error" | "running";
  label: string;
  detail?: string;
};

export type LvAnalysisResult = {
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  kind: LvDocumentKind;
  kindReason: string;
  /** Verarbeitungsstatus – nie leer. */
  status: "success" | "partial" | "empty" | "error";
  statusMessage: string;
  recommendedAction: string;
  items: LvNormalizedItem[];
  totals: LvTotalLine[];
  issues: LvValidationIssue[];
  steps: LvProcessStep[];
  pageCount: number;
  rawText: string;
};

/** Eintrag im Import-Protokoll. */
export type LvImportLogEntry = {
  id: string;
  file_name: string;
  uploaded_at: string;
  document_kind: LvDocumentKind;
  item_count: number;
  status: LvAnalysisResult["status"];
  status_message: string;
};

export const DOCUMENT_KIND_LABELS: Record<LvDocumentKind, { de: string; ar: string }> = {
  detailed_lv: { de: "Detailliertes Leistungsverzeichnis", ar: "كشف خدمات تفصيلي" },
  pricing_form: { de: "Preisblatt – teilweise strukturierte Daten", ar: "نموذج تسعير – بيانات جزئية" },
  cleaning_spec: { de: "Reinigungs-Leistungsbeschreibung", ar: "مواصفات تنظيف" },
  scanned_pdf: { de: "Gescanntes PDF (OCR)", ar: "ملف PDF ممسوح ضوئياً" },
  unsupported: { de: "Nicht unterstütztes Dokument", ar: "مستند غير مدعوم" },
};

export const CATEGORY_LABELS: Record<LvItemCategory, { de: string; ar: string }> = {
  unterhaltsreinigung: { de: "Unterhaltsreinigung", ar: "تنظيف دوري" },
  glasreinigung: { de: "Glas- und Rahmenreinigung", ar: "تنظيف زجاج" },
  grundreinigung: { de: "Grundreinigung", ar: "تنظيف شامل" },
  sonderreinigung: { de: "Sonderreinigung", ar: "تنظيف خاص" },
  winterdienst: { de: "Winterdienst", ar: "خدمة الشتاء" },
  verbrauchsmaterial: { de: "Verbrauchsmaterial", ar: "مواد استهلاكية" },
  sonstiges: { de: "Sonstiges", ar: "أخرى" },
};
