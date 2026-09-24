import type { LvNormalizedItem } from "@/lib/lv-analyse/types";
import { offerPrice } from "@/lib/lv-analyse/calculation";

export const LV_KALKULATION_HANDOFF_KEY = "homr:lv-kalkulation-handoff:v1";

export type LvKalkulationHandoffItem = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  sourceItemNumber: string;
  frequencyLabel: string;
};

export type LvKalkulationHandoff = {
  sourceFile: string;
  createdAt: string;
  items: LvKalkulationHandoffItem[];
};

export function buildLvKalkulationHandoff(
  sourceFile: string,
  items: LvNormalizedItem[],
): LvKalkulationHandoff {
  return {
    sourceFile,
    createdAt: new Date().toISOString(),
    items: items
      .filter((item) => item.approved)
      .map((item) => {
        const total = offerPrice(item);
        const quantity = Number(item.quantity ?? 0);
        const unitPrice = total !== null && quantity > 0 ? total / quantity : 0;
        return {
          description: item.description.trim(),
          quantity,
          unit: item.unit.trim() || "Pauschal",
          unitPrice,
          sourceItemNumber: item.item_number.trim(),
          frequencyLabel: item.frequency.label.trim(),
        };
      })
      .filter(
        (item) =>
          item.description.length > 0 &&
          Number.isFinite(item.quantity) &&
          item.quantity > 0 &&
          Number.isFinite(item.unitPrice) &&
          item.unitPrice > 0,
      ),
  };
}

export function writeLvKalkulationHandoff(payload: LvKalkulationHandoff): void {
  sessionStorage.setItem(LV_KALKULATION_HANDOFF_KEY, JSON.stringify(payload));
}

export function readLvKalkulationHandoff(): LvKalkulationHandoff | null {
  const raw = sessionStorage.getItem(LV_KALKULATION_HANDOFF_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LvKalkulationHandoff>;
    if (!Array.isArray(parsed.items) || typeof parsed.sourceFile !== "string") return null;
    const items = parsed.items.filter(
      (item): item is LvKalkulationHandoffItem =>
        Boolean(item) &&
        typeof item.description === "string" &&
        typeof item.quantity === "number" &&
        typeof item.unit === "string" &&
        typeof item.unitPrice === "number" &&
        typeof item.sourceItemNumber === "string" &&
        typeof item.frequencyLabel === "string",
    );
    return {
      sourceFile: parsed.sourceFile,
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : "",
      items,
    };
  } catch {
    return null;
  }
}

export function clearLvKalkulationHandoff(): void {
  sessionStorage.removeItem(LV_KALKULATION_HANDOFF_KEY);
}
