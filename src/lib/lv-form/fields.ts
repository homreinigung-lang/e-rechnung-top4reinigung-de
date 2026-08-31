import type { LvFieldKey, LvFieldMeta } from "./types";

/**
 * Feldkatalog mit deutschen Erkennungsbegriffen.
 * Jede Keyword-Gruppe ist eine UND-Verknüpfung; eine Zeile passt,
 * wenn mindestens eine Gruppe vollständig enthalten ist.
 */
export const LV_FIELDS: LvFieldMeta[] = [
  {
    key: "unterhalt_pauschale_monat",
    label: "Pauschalpreis pro Monat (Unterhaltsreinigung)",
    kind: "input",
    unit: "€",
    decimals: 2,
    keywords: [
      ["pauschalpreis", "monat"],
      ["pauschale", "monatlich"],
    ],
  },
  {
    key: "unterhalt_stunden_monat",
    label: "Zugrunde liegende Stunden pro Monat",
    kind: "input",
    unit: "Std.",
    decimals: 2,
    keywords: [
      ["stunden", "monat"],
      ["std", "monat"],
    ],
  },
  {
    key: "unterhalt_wertung",
    label: "Wertungseintrag Unterhaltsreinigung (Monat × 12)",
    kind: "derived",
    unit: "€",
    decimals: 2,
    keywords: [
      ["wertungseintrag", "unterhalt"],
      ["wertung", "12"],
    ],
  },
  {
    key: "grund_pauschale_jahr",
    label: "Grundreinigung – Pauschalpreis 1× jährlich",
    kind: "input",
    unit: "€",
    decimals: 2,
    keywords: [
      ["grundreinigung", "pauschalpreis"],
      ["pauschalpreis", "jährlich"],
    ],
  },
  {
    key: "grund_stunden_jahr",
    label: "Grundreinigung – zugrunde liegende Stunden pro Jahr",
    kind: "input",
    unit: "Std.",
    decimals: 2,
    keywords: [
      ["stunden", "jährlich"],
      ["stunden", "jahr"],
    ],
  },
  {
    key: "grund_wertung",
    label: "Wertungseintrag Grundreinigung",
    kind: "derived",
    unit: "€",
    decimals: 2,
    keywords: [["wertungseintrag", "grundreinigung"]],
  },
  {
    key: "sonder_stundensatz",
    label: "Stundenverrechnungssatz Sonderaufträge",
    kind: "input",
    unit: "€",
    decimals: 2,
    keywords: [["stundenverrechnungssatz"], ["verrechnungssatz", "stunde"]],
  },
  {
    key: "sonder_kontingent",
    label: "Fiktives Stundenkontingent (Sonderaufträge)",
    kind: "input",
    unit: "Std.",
    decimals: 2,
    keywords: [
      ["fiktiv", "stunden"],
      ["kontingent", "stunden"],
    ],
  },
  {
    key: "sonder_wertung",
    label: "Wertungseintrag Sonderaufträge",
    kind: "derived",
    unit: "€",
    decimals: 2,
    keywords: [["wertungseintrag", "sonder"]],
  },
  {
    key: "jahr_netto",
    label: "Jahresbetrag netto",
    kind: "derived",
    unit: "€",
    decimals: 2,
    keywords: [
      ["jahresbetrag", "netto"],
      ["gesamt", "netto"],
    ],
  },
  {
    key: "mwst_satz",
    label: "Mehrwertsteuersatz",
    kind: "input",
    unit: "%",
    decimals: 2,
    keywords: [["mehrwertsteuersatz"], ["ust", "satz"]],
  },
  {
    key: "mwst_betrag",
    label: "Mehrwertsteuer",
    kind: "derived",
    unit: "€",
    decimals: 2,
    keywords: [["mehrwertsteuer"], ["mwst"], ["umsatzsteuer"]],
  },
  {
    key: "jahr_brutto",
    label: "Jahresbetrag brutto",
    kind: "derived",
    unit: "€",
    decimals: 2,
    keywords: [
      ["jahresbetrag", "brutto"],
      ["gesamt", "brutto"],
    ],
  },
];

export const LV_FIELD_MAP = new Map<LvFieldKey, LvFieldMeta>(LV_FIELDS.map((f) => [f.key, f]));

export function fieldLabel(key: LvFieldKey | null): string {
  if (!key) return "Nicht zugeordnet";
  return LV_FIELD_MAP.get(key)?.label ?? key;
}
