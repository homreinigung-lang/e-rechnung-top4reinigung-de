import type { DatevChart } from "./datev-extf";

export function automaticExpenseAccount(category: string, chart: DatevChart): string {
  const normalized = category.trim().toLowerCase();
  if (normalized === "löhne" || normalized === "loehne") return chart === "SKR03" ? "4110" : "6010";
  if (normalized === "reinigungsmittel") return chart === "SKR03" ? "4250" : "6330";
  if (normalized === "versicherung" || normalized === "versicherungen") return chart === "SKR03" ? "4360" : "6400";
  return chart === "SKR03" ? "4900" : "6300";
}

export function buildAutomaticExpenseMappings(categories: Iterable<string>, chart: DatevChart): Record<string, string> {
  const mappings: Record<string, string> = {};
  for (const category of categories) mappings[category] = automaticExpenseAccount(category, chart);
  return mappings;
}
