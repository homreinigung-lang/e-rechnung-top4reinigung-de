import { positionsTotal, type CalcPosition } from "./kalkulation-engine";

export const CALCULATION_WORKFLOWS = ["schnell", "raum", "ki", "ausschreibung"] as const;
export type CalculationWorkflow = (typeof CALCULATION_WORKFLOWS)[number];

export const WORKFLOW_LABELS: Record<CalculationWorkflow, string> = {
  schnell: "Schnellkalkulation",
  raum: "Raumkalkulation",
  ki: "KI-Kalkulation",
  ausschreibung: "LV / Ausschreibungen",
};

/** Preview and document creation use this exact set, never a sum of different workflows. */
export function calculationTransfer(input: {
  workflow: CalculationWorkflow;
  calculated: CalcPosition[];
  ai: CalcPosition[];
  lv: CalcPosition[];
  roomEnabled: boolean;
  aiStale: boolean;
  aiQuestions: string[];
  warnings: string[];
  frequency: number;
}) {
  const positions = input.workflow === "ausschreibung" ? input.lv
    : input.workflow === "ki" ? input.ai : input.calculated;
  const issues = [...input.warnings];
  if (input.workflow === "raum" && !input.roomEnabled)
    issues.push("Bitte zuerst Räume erfassen und die raumweise Stundenberechnung aktivieren.");
  if (input.workflow === "ki" && (input.aiStale || input.aiQuestions.length > 0))
    issues.push("Bitte offene KI-Angaben ergänzen und die KI-Kalkulation erneut erstellen.");
  if ((input.workflow === "schnell" || input.workflow === "raum") && !input.roomEnabled && input.frequency <= 0)
    issues.push("Bitte zuerst die Anzahl der Einsätze angeben.");
  if (positions.some((p) => !p.description.trim() || !Number.isFinite(p.quantity) || p.quantity <= 0 || !Number.isFinite(p.unit_price)))
    issues.push("Bitte Beschreibung, Menge und Einzelpreis jeder Position prüfen.");
  const total = positionsTotal(positions);
  if (!positions.length || !Number.isFinite(total) || total <= 0)
    issues.push("Noch keine gültigen Leistungspositionen mit positivem Gesamtpreis vorhanden.");
  return { positions, total, issues };
}
