export type LvPositionItem = {
  id: string;
  position: number;
  section: string;
  title: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  deadline: string | null;
  evidence: string;
  critical: boolean;
  done: boolean;
};

export type LvStatus = "offen" | "pruefen" | "fertig";

export const STATUS_LABEL: Record<LvStatus, string> = {
  offen: "Offen",
  pruefen: "Prüfen",
  fertig: "Fertig",
};

export const STATUS_DOT: Record<LvStatus, string> = {
  offen: "bg-red-500",
  pruefen: "bg-amber-500",
  fertig: "bg-emerald-600",
};

export function missingFields(it: LvPositionItem): string[] {
  const missing: string[] = [];
  if (!(Number(it.quantity) > 0)) missing.push("Menge");
  if (!it.unit.trim()) missing.push("Einheit");
  if (!(Number(it.unit_price) > 0)) missing.push("Preis / Einheit");
  return missing;
}

export function warningFields(it: LvPositionItem): string[] {
  const warn: string[] = [];
  if (!it.title.trim() && !it.description.trim()) warn.push("Beschreibung fehlt");
  if (it.critical && !it.done) warn.push("Kritischer Punkt / Frist noch offen");
  if (it.evidence.trim() && !it.done) warn.push("Nachweis noch nicht bestätigt");
  if (Number(it.unit_price) > 0 && Number(it.unit_price) > 500)
    warn.push("Ungewöhnlich hoher Einzelpreis");
  return warn;
}

export function lvStatus(it: LvPositionItem): LvStatus {
  if (missingFields(it).length > 0) return "offen";
  if (warningFields(it).length > 0) return "pruefen";
  return "fertig";
}

export function total(it: LvPositionItem): number {
  return Math.round(Number(it.quantity || 0) * Number(it.unit_price || 0) * 100) / 100;
}

export function posLabel(it: LvPositionItem): string {
  return String(it.position ?? 0).padStart(3, "0");
}

export type Props = {
  items: LvPositionItem[];
  onPatch: (itemId: string, values: Partial<LvPositionItem>) => void;
  onAdd: () => void;
  onRemove: (itemId: string) => void;
};
