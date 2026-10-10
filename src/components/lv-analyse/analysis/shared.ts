import {
  CATEGORY_LABELS,
  type LvAnalysisResult,
  type LvItemCategory,
} from "@/lib/lv-analyse/types";

export const STATUS_STYLE: Record<
  LvAnalysisResult["status"],
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  success: { label: "Erfolgreich verarbeitet", variant: "default" },
  partial: { label: "Teilweise verarbeitet", variant: "secondary" },
  empty: { label: "Keine Positionen gefunden", variant: "outline" },
  error: { label: "Fehler", variant: "destructive" },
};

export const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABELS) as LvItemCategory[];
