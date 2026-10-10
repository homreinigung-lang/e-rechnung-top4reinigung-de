import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

import { formatMoney, parseGermanNumber } from "@/lib/format";

import { positionsTotal, round2 } from "@/lib/kalkulation-engine";
import { type KalkulationSnapshot } from "@/components/ProjektAnalyse";
import { num, type AiItem, KALK_SECTION, KI_SECTION } from "./shared";

import type { PendingApply } from "./useKalkulationStateModel";
import type { useKalkulationForm } from "./useKalkulationForm";
import type { useKalkulationSuggestions } from "./useKalkulationSuggestions";
import type { useCalculationTotals } from "./useCalculationTotals";

export function useCalculationApply(input: {
  aiReviewQuestions: ReturnType<typeof useKalkulationForm>["aiReviewQuestions"];
  analysisTotals: ReturnType<typeof useKalkulationSuggestions>["analysisTotals"];
  area: ReturnType<typeof useKalkulationForm>["area"];
  attachments: ReturnType<typeof useKalkulationForm>["attachments"];
  confirmed: ReturnType<typeof useKalkulationForm>["confirmed"];
  frequency: ReturnType<typeof useKalkulationForm>["frequency"];
  kiBasisChanged: ReturnType<typeof useCalculationTotals>["kiBasisChanged"];
  kiPositions: ReturnType<typeof useCalculationTotals>["kiPositions"];
  kiTotal: ReturnType<typeof useCalculationTotals>["kiTotal"];
  lvItems: ReturnType<typeof useKalkulationForm>["lvItems"];
  lvPositions: ReturnType<typeof useCalculationTotals>["lvPositions"];
  lvTotal: ReturnType<typeof useCalculationTotals>["lvTotal"];
  mode: ReturnType<typeof useKalkulationForm>["mode"];
  monthlyHours: ReturnType<typeof useCalculationTotals>["monthlyHours"];
  sectionOf: ReturnType<typeof useCalculationTotals>["sectionOf"];
  selected: ReturnType<typeof useKalkulationForm>["selected"];
  setCalcId: ReturnType<typeof useKalkulationForm>["setCalcId"];
  setCalcTitle: ReturnType<typeof useKalkulationForm>["setCalcTitle"];
  setLvItems: ReturnType<typeof useKalkulationForm>["setLvItems"];
  stagedPositions: ReturnType<typeof useCalculationTotals>["stagedPositions"];
  suggested: ReturnType<typeof useCalculationTotals>["suggested"];
  visitsPerMonth: ReturnType<typeof useKalkulationSuggestions>["visitsPerMonth"];
  warnings: ReturnType<typeof useCalculationTotals>["warnings"];
}) {
  const {
    aiReviewQuestions,
    analysisTotals,
    area,
    attachments,
    confirmed,
    frequency,
    kiBasisChanged,
    kiPositions,
    kiTotal,
    lvItems,
    lvPositions,
    lvTotal,
    mode,
    monthlyHours,
    sectionOf,
    selected,
    setCalcId,
    setCalcTitle,
    setLvItems,
    stagedPositions,
    suggested,
    visitsPerMonth,
    warnings,
  } = input;
  const [pendingApply, setPendingApply] = useState<PendingApply | null>(null);

  /**
   * Schreibt genau eine Quelle ins Leistungsverzeichnis. Wiederholtes
   * Übernehmen ersetzt nur die eigenen Zeilen (idempotent, keine Duplikate).
   * `replaceAll` verwirft zusätzlich alle Zeilen anderer Herkunft.
   */
  function writeSource(section: string, items: AiItem[], replaceAll: boolean) {
    setLvItems((prev) =>
      replaceAll ? items : [...prev.filter((i) => sectionOf(i) !== section), ...items],
    );
    const kept = replaceAll ? 0 : lvItems.filter((i) => sectionOf(i) !== section).length;
    toast.success(
      `Bereich „${section}“ übernommen – netto ${formatMoney(
        positionsTotal(
          items.map((i) => ({
            description: i.description,
            quantity: num(i.quantity),
            unit: i.unit,
            unit_price: parseGermanNumber(i.unit_price),
          })),
        ),
      )}` + (kept > 0 ? ` · ${kept} Position(en) anderer Herkunft bleiben erhalten.` : ""),
    );
  }

  /** Gemeinsamer Einstieg: warnt, wenn Zeilen anderer Herkunft im LV liegen. */
  function applySource(section: string, label: string, items: AiItem[]) {
    if (items.length === 0) {
      toast.error(`${label} enthält noch keine gültigen Positionen.`);
      return;
    }
    const foreign = lvItems.filter((i) => sectionOf(i) !== section);
    if (foreign.length === 0) {
      writeSource(section, items, false);
      return;
    }
    setPendingApply({
      section,
      label,
      items,
      foreignCount: foreign.length,
      foreignTotal: positionsTotal(lvPositions.filter((p) => p.section !== section)),
    });
  }

  const toAiItems = (
    positions: { description: string; quantity: number; unit: string; unit_price: number }[],
    section: string,
    prefix: string,
  ): AiItem[] => {
    const stamp = Date.now();
    return positions.map((p, n) => ({
      id: `${prefix}-${stamp}-${n}`,
      description: p.description,
      quantity: String(p.quantity).replace(".", ","),
      unit: p.unit,
      unit_price: String(p.unit_price).replace(".", ","),
      section,
      sourceLvItemId: null,
    }));
  };

  /**
   * Übernimmt die Grundkalkulation als Positionssatz in das
   * Leistungsverzeichnis. Ein gewünschter Rabatt erscheint als eigene,
   * für den Kunden sichtbare Position – keine stille Ausgleichsbuchung.
   */
  function applyCalculation() {
    if (num(frequency) <= 0) {
      toast.error("Bitte zuerst die Anzahl der Einsätze angeben.");
      return;
    }
    if (warnings.length > 0) {
      toast.error("Bitte zuerst die markierten Plausibilitätshinweise prüfen.");
      return;
    }
    applySource(KALK_SECTION, "Grundkalkulation", toAiItems(stagedPositions, KALK_SECTION, "calc"));
  }

  /** Übernimmt ausschließlich die Positionen der KI-/Grundriss-Analyse. */
  function applyKiAnalysis() {
    if (aiReviewQuestions.length > 0 || kiBasisChanged) {
      toast.error("Bitte die Angaben prüfen und die KI-Kalkulation erneut erstellen.");
      return;
    }
    applySource(KI_SECTION, "KI-Analyse", toAiItems(kiPositions, KI_SECTION, "ki"));
  }

  /**
   * Abgleich zwischen aktuellem Kalkulations-Vorschlag und dem, was im
   * Leistungsverzeichnis unter „Kalkulation" tatsächlich steht. Weicht beides
   * ab, entsteht das Angebot aus einem veralteten Stand – darauf wird
   * ausdrücklich hingewiesen.
   */
  const lvCalcTotal = useMemo(
    () => positionsTotal(lvPositions.filter((p) => p.section === KALK_SECTION)),
    [lvPositions],
  );
  const calcOutOfSync = useMemo(
    () => Math.abs(round2(lvCalcTotal) - round2(suggested)) >= 0.01,
    [lvCalcTotal, suggested],
  );
  /** Gleicher Abgleich für den KI-Bereich. */
  const lvKiTotal = useMemo(
    () => positionsTotal(lvPositions.filter((p) => p.section === KI_SECTION)),
    [lvPositions],
  );
  const kiOutOfSync = useMemo(
    () => kiPositions.length > 0 && Math.abs(round2(lvKiTotal) - round2(kiTotal)) >= 0.01,
    [lvKiTotal, kiTotal, kiPositions],
  );

  const analyseSnapshot: KalkulationSnapshot = {
    typeLabel: selected.label,
    areaSqm: mode === "area" ? num(area) : analysisTotals.sqm,
    monthlyHours,
    visitsPerMonth,
    positions: lvPositions.length,
    attachments: attachments.length,
    netTotal: lvTotal,
    confirmed,
  };

  // ---- Speichern / Laden ---------------------------------------------------
  const { data: savedCalcs = [] } = useQuery({
    queryKey: ["calculations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calculations")
        .select("id, title, net_total, updated_at, project_id")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  function resetCalculation() {
    setCalcId(null);
    setCalcTitle("");
    setLvItems([]);
    toast.success("Neue Kalkulation gestartet");
  }
  return {
    analyseSnapshot,
    applyCalculation,
    applyKiAnalysis,
    calcOutOfSync,
    kiOutOfSync,
    lvCalcTotal,
    lvKiTotal,
    pendingApply,
    resetCalculation,
    savedCalcs,
    setPendingApply,
    writeSource,
  };
}
