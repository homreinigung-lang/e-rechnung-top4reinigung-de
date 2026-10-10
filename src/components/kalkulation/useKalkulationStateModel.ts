import { type AiItem } from "./shared";

export type PendingApply = {
  section: string;
  label: string;
  items: AiItem[];
  /** Zeilen im LV, die aus einer anderen Quelle stammen. */
  foreignCount: number;
  foreignTotal: number;
};
