import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { analyzeCalculation } from "@/lib/item-ai.functions";

import { supabase } from "@/integrations/supabase/client";

import { STAIR_RATE_PER_FLOOR, type RecurrenceUnit } from "@/lib/constants";

import { useRaumbuch } from "@/lib/raumbuch";
import { DEFAULT_PERFORMANCE_RATES, type PerformanceRate } from "@/lib/leistungswerte";

import { type Mode, CLEANING_TYPES, type Attachment, type AiItem } from "./shared";
import { getRouteApi } from "@tanstack/react-router";
const routeApi = getRouteApi("/_authenticated/kalkulation");

export function useKalkulationForm() {
  const navigate = useNavigate();

  const search = routeApi.useSearch();
  const [type, setType] = useState(CLEANING_TYPES[0]!.value);
  const [mode, setMode] = useState<Mode>("area");
  const [area, setArea] = useState(search.area ? String(search.area).replace(".", ",") : "100");
  const [pricePerSqm, setPricePerSqm] = useState(String(CLEANING_TYPES[0]!.area));
  const [hours, setHours] = useState("4");
  const [hourlyRate, setHourlyRate] = useState(String(CLEANING_TYPES[0]!.hourly));
  const [frequency, setFrequency] = useState("1");
  const [frequencyUnit, setFrequencyUnit] = useState<RecurrenceUnit>("month");
  const [travel, setTravel] = useState("0");
  const [extras, setExtras] = useState<string[]>([]);
  const [stairs, setStairs] = useState(false);
  const [floors, setFloors] = useState("1");
  const [stairRate, setStairRate] = useState(String(STAIR_RATE_PER_FLOOR));
  /** Eigener Turnus des Treppenhauses (Einsätze/Monat). Leer/0 = wie Grundleistung. */
  const [stairFrequency, setStairFrequency] = useState("0");
  const [hasLift, setHasLift] = useState(false);
  const [liftRate, setLiftRate] = useState("5,00");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [discountAmountInput, setDiscountAmountInput] = useState("0");
  const [discountReason, setDiscountReason] = useState("");
  const [glassArea, setGlassArea] = useState("0");
  const [taxMode, setTaxMode] = useState("domestic");
  // Interne Kostenkalkulation: Standardwerte kommen aus den Firmeneinstellungen.
  const [laborWage, setLaborWage] = useState("15");
  const [laborBurdenPercent, setLaborBurdenPercent] = useState("32");
  const [materialCost, setMaterialCost] = useState("1,20");
  const [overheadCost, setOverheadCost] = useState("3,50");
  const [profitMarkup, setProfitMarkup] = useState("20");
  const [calcId, setCalcId] = useState<string | null>(null);
  const [calcTitle, setCalcTitle] = useState(search.objekt ?? "");
  const [projectId, setProjectId] = useState<string | null>(search.projekt ?? null);
  const queryClient = useQueryClient();
  const { data: performanceRates = [] } = useQuery({
    queryKey: ["performance_rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("performance_rates")
        .select("id,label,usage_type,floor_covering,sqm_per_hour,active")
        .order("label");
      if (error) throw error;
      return (data ?? []) as PerformanceRate[];
    },
  });
  const visiblePerformanceRates =
    performanceRates.length > 0
      ? performanceRates.filter((rate) => rate.active !== false)
      : DEFAULT_PERFORMANCE_RATES.map((rate, index) => ({
          ...rate,
          id: `default-${index}`,
          active: true,
        }));

  // Steuerart und interne Kostenbasis einmalig aus den Firmeneinstellungen vorbelegen.
  useEffect(() => {
    let active = true;
    void supabase
      .from("company_settings")
      .select(
        "small_business,calc_worker_hourly_wage,calc_labor_burden_percent,calc_material_cost_hour,calc_overhead_cost_hour,calc_profit_markup_percent",
      )
      .maybeSingle()
      .then(({ data }) => {
        if (!active || !data) return;
        if (data.small_business) setTaxMode("kleinunternehmer");
        setLaborWage(String(Number(data.calc_worker_hourly_wage ?? 15)).replace(".", ","));
        setLaborBurdenPercent(
          String(Number(data.calc_labor_burden_percent ?? 32)).replace(".", ","),
        );
        setMaterialCost(String(Number(data.calc_material_cost_hour ?? 1.2)).replace(".", ","));
        setOverheadCost(String(Number(data.calc_overhead_cost_hour ?? 3.5)).replace(".", ","));
        setProfitMarkup(String(Number(data.calc_profit_markup_percent ?? 20)).replace(".", ","));
      });
    return () => {
      active = false;
    };
  }, []);

  const [note, setNote] = useState(() => {
    const parts: string[] = [];
    if (search.objekt) parts.push(`Objekt: ${search.objekt}`);
    if (search.belag) parts.push(`Bodenbelag: ${search.belag}`);
    return parts.join(" · ");
  });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [tenderDocs, setTenderDocs] = useState<Attachment[]>([]);
  const [floorplanSummary, setFloorplanSummary] = useState("");
  const [proposalTitle, setProposalTitle] = useState("");
  const [proposalText, setProposalText] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const selected = CLEANING_TYPES.find((t) => t.value === type) ?? CLEANING_TYPES[0]!;

  /**
   * Raumbuch des verknüpften Projekts. Liegen erfasste Räume vor, kommen
   * Fläche und Stundenbedarf daraus statt aus der KI-Schätzung.
   */
  const { data: raumbuch, error: raumbuchError } = useRaumbuch(projectId);
  const [raumbuchApplied, setRaumbuchApplied] = useState(false);

  // Ladefehler des Raumbuchs sichtbar machen, statt still zu schweigen.
  useEffect(() => {
    if (raumbuchError) {
      toast.error(
        `Raumbuch konnte nicht geladen werden: ${raumbuchError.message ?? "Unbekannter Fehler"}`,
      );
    }
  }, [raumbuchError]);

  useEffect(() => {
    if (!raumbuch) {
      setRaumbuchApplied(false);
      return;
    }
    setArea(String(raumbuch.totalArea).replace(".", ","));
    if (raumbuch.hoursPerVisit > 0) setHours(String(raumbuch.hoursPerVisit).replace(".", ","));
    setRaumbuchApplied(true);
  }, [raumbuch]);

  function updateAttachment(path: string, patch: Partial<Attachment>) {
    setAttachments((prev) => prev.map((a) => (a.path === path ? { ...a, ...patch } : a)));
  }

  // ---- KI-Positionsvorschläge (eigener Bereich, kein Zugriff aufs LV) ------
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiReviewQuestions, setAiReviewQuestions] = useState<string[]>([]);
  const [aiReviewNotes, setAiReviewNotes] = useState<string[]>([]);
  const [kiBillingPeriod, setKiBillingPeriod] = useState<"once" | "month">("month");
  const [kiPricingBasis, setKiPricingBasis] = useState<"area" | "hours" | "floor">("area");
  const [kiPrompt, setKiPrompt] = useState("");
  const [kiOriginalItem, setKiOriginalItem] = useState<AiItem | null>(null);
  const [kiBasis, setKiBasis] = useState<{
    type: string;
    mode: Mode;
    area: number;
    hours: number;
    frequency: number;
    frequencyUnit: "week" | "month";
    pricePerSqm: number;
    hourlyRate: number;
    floors: number;
  } | null>(null);
  /** Vorschläge der KI-/Grundriss-Analyse – reine Vorschau bis zur Übernahme. */
  const [kiItems, setKiItems] = useState<AiItem[]>([]);
  /** Das Leistungsverzeichnis: einzige Quelle für Angebot, PDF und Speicherung. */
  const [lvItems, setLvItems] = useState<AiItem[]>([]);
  const analyze = useServerFn(analyzeCalculation);
  return {
    aiPrompt,
    aiReviewNotes,
    aiReviewQuestions,
    analyze,
    area,
    attachments,
    calcId,
    calcTitle,
    confirmed,
    discountAmountInput,
    discountPercent,
    discountReason,
    extras,
    floorplanSummary,
    floors,
    frequency,
    frequencyUnit,
    glassArea,
    hasLift,
    hourlyRate,
    hours,
    kiBasis,
    kiBillingPeriod,
    kiItems,
    kiOriginalItem,
    kiPricingBasis,
    kiPrompt,
    laborBurdenPercent,
    laborWage,
    liftRate,
    lvItems,
    materialCost,
    mode,
    navigate,
    note,
    overheadCost,
    pricePerSqm,
    profitMarkup,
    projectId,
    proposalText,
    proposalTitle,
    queryClient,
    raumbuch,
    raumbuchApplied,
    search,
    selected,
    setAiPrompt,
    setAiReviewNotes,
    setAiReviewQuestions,
    setArea,
    setAttachments,
    setCalcId,
    setCalcTitle,
    setConfirmed,
    setDiscountAmountInput,
    setDiscountPercent,
    setDiscountReason,
    setExtras,
    setFloorplanSummary,
    setFloors,
    setFrequency,
    setFrequencyUnit,
    setGlassArea,
    setHasLift,
    setHourlyRate,
    setHours,
    setKiBasis,
    setKiBillingPeriod,
    setKiItems,
    setKiOriginalItem,
    setKiPricingBasis,
    setKiPrompt,
    setLiftRate,
    setLvItems,
    setMode,
    setNote,
    setPricePerSqm,
    setProjectId,
    setProposalText,
    setProposalTitle,
    setStairFrequency,
    setStairRate,
    setStairs,
    setTaxMode,
    setTenderDocs,
    setTravel,
    setType,
    stairFrequency,
    stairRate,
    stairs,
    taxMode,
    tenderDocs,
    travel,
    type,
    updateAttachment,
    visiblePerformanceRates,
  };
}
