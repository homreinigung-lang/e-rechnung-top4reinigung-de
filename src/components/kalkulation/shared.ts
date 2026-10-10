import { parsePositiveNumber } from "@/lib/format";

export type KalkulationSearch = {
  area?: number;
  objekt?: string;
  belag?: string;
  projekt?: string;
};

export type Mode = "area" | "hours";

export const CLEANING_TYPES: {
  value: string;
  label: string;
  area: number;
  hourly: number;
  /** Empfohlener Stundensatz-Korridor (netto). */
  range: [number, number];
}[] = [
  { value: "unterhalt", label: "Unterhaltsreinigung", area: 0.35, hourly: 35, range: [34, 37] },
  {
    value: "grund",
    label: "Grundreinigung (Tiefenreinigung)",
    area: 1.9,
    hourly: 43,
    range: [42, 45],
  },
  {
    value: "bau",
    label: "Bauendreinigung (Tiefenreinigung)",
    area: 2.6,
    hourly: 44,
    range: [42, 45],
  },
  { value: "glas", label: "Glas- und Fensterreinigung", area: 1.4, hourly: 36, range: [34, 37] },
  { value: "treppenhaus", label: "Treppenhausreinigung", area: 0.6, hourly: 35, range: [34, 37] },
  { value: "buero", label: "Büroreinigung", area: 0.4, hourly: 35, range: [34, 37] },
  { value: "wohn", label: "Wohnungsreinigung", area: 0.4, hourly: 35, range: [34, 37] },
  { value: "praxis", label: "Praxisreinigung", area: 0.4, hourly: 35, range: [34, 37] },
];

export const EXTRAS: { key: string; label: string; price: number }[] = [
  { key: "fenster", label: "Fensterreinigung innen/außen", price: 60 },
  { key: "entsorgung", label: "Müllentsorgung", price: 35 },
];

export function num(value: string): number {
  return parsePositiveNumber(value);
}

export type Attachment = {
  path: string;
  name: string;
  url: string;
  isImage: boolean;
  sqm: string;
  rooms: string;
  floors: string;
  note: string;
};

export type AiItem = {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  unit_price: string;
  /** Ursprünglicher LV-Bereich (bleibt beim Rückschreiben erhalten). */
  section?: string;
  /** Herkunfts-Zeile in project_lv_items – verhindert Duplikate. */
  sourceLvItemId?: string | null;
};

export const KALK_SECTION = "Kalkulation";

export const KI_SECTION = "KI-Analyse";
