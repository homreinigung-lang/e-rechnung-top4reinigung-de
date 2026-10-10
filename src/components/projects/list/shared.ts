export const MODES = [
  { value: "floorplan", label: "Grundriss-Analyse (Raumbuch)" },
  { value: "tender", label: "Ausschreibungs-Analyse (Leistungsverzeichnis)" },
] as const;

export function modeLabel(value: string | null | undefined) {
  return MODES.find((m) => m.value === value)?.label ?? MODES[0].label;
}
