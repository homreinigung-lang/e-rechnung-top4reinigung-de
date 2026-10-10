import {
  CATEGORY_LABELS,
  type LvItemCategory,
  type LvNormalizedItem,
} from "@/lib/lv-analyse/types";

export const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABELS) as LvItemCategory[];

export const EMPTY = "—";

export const COLUMNS = [
  "Pos.",
  "Beschreibung",
  "Kategorie",
  "Geforderte Menge",
  "Einheit",
  "Intervall",
  "Fläche (m²)",
  "Geforderte Arbeitsstunden",
  "Eigener Einheitspreis (€)",
  "Gesamtpreis (€)",
  "Jahrespreis (€)",
  "MwSt. (%)",
  "Seite",
  "Sicherheitswert",
  "Kalkulationsstatus",
  "Freigabe",
  "Aktionen",
] as const;

export type Filter = "alle" | "offen" | "pruefung" | "freigegeben";

export const FILTERS: { key: Filter; label: string }[] = [
  { key: "alle", label: "Alle" },
  { key: "offen", label: "Offen" },
  { key: "pruefung", label: "Prüfung erforderlich" },
  { key: "freigegeben", label: "Freigegeben" },
];

export type Props = {
  items: LvNormalizedItem[];
  issueCount: number;
  exporting: boolean;
  exportHint: string;
  exportDisabled: boolean;
  onExport: (kind: "csv" | "xlsx" | "pdf") => void;
  onUpdate: (id: string, patch: Partial<LvNormalizedItem>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  onApproveAll: () => void;
  emptyState: React.ReactNode;
};
