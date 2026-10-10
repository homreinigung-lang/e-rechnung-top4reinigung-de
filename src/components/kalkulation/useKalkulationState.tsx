import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { analyzeCalculation } from "@/lib/item-ai.functions";
import { analyzeProject } from "@/lib/project-scan.functions";
import { supabase } from "@/integrations/supabase/client";
import { createDocument } from "@/lib/create-document";
import {
  formatMoney,
  formatNumber,
  parseGermanNumber,
  taxNoteForTaxMode,
  vatRateForTaxMode,
} from "@/lib/format";
import {
  STAIR_RATE_PER_FLOOR,
  recurrenceUnitLabel,
  visitsPerMonth as calculateVisitsPerMonth,
  visitsPerYear,
  type RecurrenceUnit,
} from "@/lib/constants";
import { fileUrl } from "@/lib/storage";
import { saveFile } from "@/lib/download";
import { useRaumbuch } from "@/lib/raumbuch";
import { DEFAULT_PERFORMANCE_RATES, type PerformanceRate } from "@/lib/leistungswerte";
import { computeDocumentTotals } from "@/lib/document-totals";
import {
  buildConsolidatedPositions,
  buildDiscountPosition,
  checkPlausibility,
  detectStairs,
  normalizeItems,
  positionsTotal,
  round2,
} from "@/lib/kalkulation-engine";
import { type KalkulationSnapshot } from "@/components/ProjektAnalyse";
import {
  Mode,
  CLEANING_TYPES,
  EXTRAS,
  num,
  Attachment,
  AiItem,
  KALK_SECTION,
  KI_SECTION,
} from "./shared";
import { getRouteApi } from "@tanstack/react-router";
const routeApi = getRouteApi("/_authenticated/kalkulation");

export function useKalkulationState() {
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
  const aiSuggest = useMutation({
    mutationFn: async () => analyze({ data: { prompt: aiPrompt } }),
    onMutate: () => {
      setKiItems([]);
      setAiReviewQuestions([]);
      setAiReviewNotes([]);
      setKiBasis(null);
      setKiPrompt("");
      setKiOriginalItem(null);
    },
    onSuccess: (res) => {
      setKiPrompt(aiPrompt.trim());
      setAiReviewQuestions(res.review_questions);
      setAiReviewNotes(res.review_notes);
      setKiBillingPeriod(res.billing_period);
      setKiPricingBasis(res.pricing_basis);
      setKiBasis(
        res.items.length > 0
          ? {
              type: res.cleaning_type,
              mode: res.mode,
              area: res.area_sqm,
              hours: res.hours,
              frequency: res.frequency,
              frequencyUnit: res.frequency_unit,
              pricePerSqm: res.price_per_sqm,
              hourlyRate: res.hourly_rate,
              floors: res.floors,
            }
          : null,
      );
      const dec = (v: number) => String(v).replace(".", ",");
      const preset = CLEANING_TYPES.find((t) => t.value === res.cleaning_type);
      if (preset) {
        setType(preset.value);
        setPricePerSqm(dec(res.price_per_sqm > 0 ? res.price_per_sqm : preset.area));
        setHourlyRate(dec(res.hourly_rate > 0 ? res.hourly_rate : preset.hourly));
      }
      setMode(res.mode);
      // Fläche/Stunden kommen aus dem Raumbuch, sobald ein Projekt mit erfassten
      // Räumen verknüpft ist – sonst weiterhin aus der KI-Schätzung.
      if (raumbuch) {
        setArea(String(raumbuch.totalArea).replace(".", ","));
        if (raumbuch.hoursPerVisit > 0) setHours(String(raumbuch.hoursPerVisit).replace(".", ","));
      } else {
        setArea(res.area_sqm > 0 ? dec(res.area_sqm) : "0");
        setHours(res.hours > 0 ? dec(res.hours) : "0");
      }
      if (res.cleaning_type === "glas" && res.area_sqm > 0) setGlassArea(dec(res.area_sqm));

      setFrequency(res.frequency > 0 ? dec(res.frequency) : "0");
      setFrequencyUnit(res.frequency_unit);
      setTravel(dec(res.travel));
      // Treppen aus Antwort ODER Freitext erkennen – nie mit 0,00 € anlegen.
      const fromText = detectStairs(aiPrompt);
      const stairsDetected = res.cleaning_type !== "treppenhaus" && fromText.stairs;
      const detectedFloors = Math.max(res.floors, fromText.floors, stairsDetected ? 1 : 0);
      if (res.cleaning_type === "treppenhaus" && res.floors > 0) setFloors(dec(res.floors));
      if (stairsDetected) {
        setStairs(true);
        if (detectedFloors > 0) setFloors(dec(detectedFloors));
      }
      if (res.note.trim())
        setNote((prev) =>
          prev.includes(res.note) ? prev : prev.trim() ? `${prev}\n${res.note}` : res.note,
        );

      const rate = res.hourly_rate || num(hourlyRate);
      const cleaned = normalizeItems(res.items, {
        hourlyRate: rate,
        stairRate: num(stairRate),
        floors: detectedFloors,
      });

      const list = cleaned.map((i, n) => ({
        id: `ki-${Date.now()}-${n}`,
        description: i.description,
        quantity: String(i.quantity).replace(".", ","),
        unit: i.unit,
        unit_price: String(i.unit_price).replace(".", ","),
        section: KI_SECTION,
        sourceLvItemId: null,
      }));
      // Die KI schreibt ausschließlich in ihren eigenen Bereich – das
      // Leistungsverzeichnis ändert sich erst per bewusstem Klick.
      setKiItems(list);
      setKiOriginalItem(list[0] ?? null);
      if (list.length === 0 && res.review_questions.length > 0) {
        toast.info(
          "Bitte die offenen Angaben ergänzen, damit eine Position berechnet werden kann.",
        );
      } else {
        toast.success(
          `KI-Analyse fertig – ${list.length} Vorschlagspositionen (noch nicht im Angebot)`,
        );
      }
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });

  const patchLvItem = (id: string, patch: Partial<AiItem>) =>
    setLvItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const patchKiItem = (id: string, patch: Partial<AiItem>) =>
    setKiItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  // ---- Projekt-Analyse direkt aus den hochgeladenen Unterlagen -------------
  const runProjectScan = useServerFn(analyzeProject);
  const [scanningPath, setScanningPath] = useState<string | null>(null);
  const scanFile = useMutation({
    mutationFn: async (a: Attachment) => {
      setScanningPath(a.path);
      const url = a.url || (await fileUrl(a.path));
      const scan = await runProjectScan({
        data: {
          fileUrl: url,
          mimeType: a.isImage ? "image/jpeg" : "application/pdf",
          mode: a.isImage ? "floorplan" : "tender",
        },
      });
      return { a, scan };
    },
    onSuccess: ({ a, scan }) => {
      const sqm = scan.rooms.reduce((s, r) => s + Number(r.area_sqm || 0), 0);
      const floorSet = new Set(scan.rooms.map((r) => r.floor).filter(Boolean));
      updateAttachment(a.path, {
        sqm: sqm > 0 ? String(Math.round(sqm * 100) / 100).replace(".", ",") : a.sqm,
        rooms: scan.rooms.length > 0 ? String(scan.rooms.length) : a.rooms,
        floors: floorSet.size > 0 ? String(floorSet.size) : a.floors,
        note: [a.note.trim(), scan.executive_summary.trim(), ...scan.highlights]
          .filter(Boolean)
          .join(" · "),
      });

      if (sqm > 0 && !raumbuch) {
        setMode("area");
        setArea(String(Math.round(sqm * 100) / 100).replace(".", ","));
      }

      if (floorSet.size > 1) {
        setStairs(true);
        setFloors(String(floorSet.size));
      }
      if (scan.requirements.length > 0) {
        const line = `Kundenanforderungen: ${scan.requirements.join("; ")}`;
        setNote((prev) => (prev.trim() ? `${prev}\n${line}` : line));
      }

      const posFromItems = scan.items.map((it, n) => ({
        id: `scan-${Date.now()}-${n}`,
        description: [it.section, it.title, it.description]
          .filter(Boolean)
          .join(" – ")
          .slice(0, 200),
        quantity: String(it.quantity > 0 ? it.quantity : 1).replace(".", ","),
        unit: it.unit || "Pauschal",
        unit_price: hourlyRate,
        section: KI_SECTION,
        sourceLvItemId: null,
      }));
      // Auch der Dokumenten-Scan bleibt im KI-Bereich.
      if (posFromItems.length > 0) setKiItems((prev) => [...prev, ...posFromItems]);

      toast.success(
        `Analyse fertig – ${scan.rooms.length} Räume, ${posFromItems.length} Vorschlagspositionen`,
      );
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
    onSettled: () => setScanningPath(null),
  });

  /** Summierte Eckdaten aus allen hochgeladenen Grundrissen/Fotos. */
  const analysisTotals = useMemo(
    () => ({
      sqm: attachments.reduce((s, a) => s + num(a.sqm), 0),
      rooms: attachments.reduce((s, a) => s + num(a.rooms), 0),
      floors: attachments.reduce((s, a) => s + num(a.floors), 0),
    }),
    [attachments],
  );

  /** Einsätze immer aus der exakten Jahresmenge auf den Monatsdurchschnitt umgerechnet. */
  const visitsPerMonth = useMemo(() => {
    const times = Math.max(1, num(frequency) || 1);
    return calculateVisitsPerMonth(times, frequencyUnit);
  }, [frequency, frequencyUnit]);

  const annualVisits = useMemo(() => {
    const times = Math.max(1, num(frequency) || 1);
    return visitsPerYear(times, frequencyUnit);
  }, [frequency, frequencyUnit]);

  const extrasTotal = useMemo(
    () => round2(EXTRAS.filter((e) => extras.includes(e.key)).reduce((s, e) => s + e.price, 0)),
    [extras],
  );

  /** Treppenhaus-Turnus: eigener Wert, sonst der Turnus der Grundleistung. */
  const stairVisitsPerMonth = useMemo(
    () => (num(stairFrequency) > 0 ? num(stairFrequency) : visitsPerMonth),
    [stairFrequency, visitsPerMonth],
  );

  const stairsTotal = useMemo(
    () =>
      round2(
        stairs
          ? num(floors) * stairVisitsPerMonth * round2(num(stairRate)) +
              (hasLift ? stairVisitsPerMonth * round2(num(liftRate)) : 0)
          : 0,
      ),
    [stairs, floors, stairRate, hasLift, liftRate, stairVisitsPerMonth],
  );

  const pct = Math.min(100, Math.max(0, num(discountPercent)));

  /**
   * Exakt derselbe deterministische Positionssatz speist Vorschau und Transfer.
   * Dadurch kann die Grundkalkulation nicht von ihrem späteren LV abweichen.
   */
  const stagedPositionsBeforeDiscount = useMemo(
    () =>
      buildConsolidatedPositions({
        typeValue: selected.value,
        typeLabel: selected.label,
        mode,
        // Glasreinigung rechnet mit der separat erfassten Glasfläche.
        areaSqm: selected.value === "glas" ? num(glassArea) : num(area),

        pricePerSqm: num(pricePerSqm),
        hours: num(hours),
        hourlyRate: num(hourlyRate),
        visitsPerMonth,
        stairs,
        floors: num(floors),
        stairRate: num(stairRate),
        stairVisitsPerMonth,
        hasLift,
        liftRate: num(liftRate),
        extras: EXTRAS.filter((e) => extras.includes(e.key)).map((e) => ({
          label: e.label,
          price: e.price,
        })),
        travel: num(travel),
        discountPercent: 0,
        discountReason: "",
      }),
    [
      selected.value,
      selected.label,
      mode,
      area,
      glassArea,

      pricePerSqm,
      hours,
      hourlyRate,
      visitsPerMonth,
      stairs,
      floors,
      stairRate,
      stairVisitsPerMonth,
      hasLift,
      liftRate,
      extras,
      travel,
    ],
  );
  const subtotal = useMemo(
    () => positionsTotal(stagedPositionsBeforeDiscount),
    [stagedPositionsBeforeDiscount],
  );
  const discountFixed = Math.max(0, round2(num(discountAmountInput)));
  const stagedDiscountPosition = useMemo(
    () =>
      buildDiscountPosition(stagedPositionsBeforeDiscount, {
        percent: pct,
        amount: discountFixed,
        reason: discountReason,
      }),
    [stagedPositionsBeforeDiscount, pct, discountFixed, discountReason],
  );
  const discountTotal = stagedDiscountPosition ? Math.abs(stagedDiscountPosition.unit_price) : 0;
  const stagedPositions = useMemo(
    () =>
      stagedDiscountPosition
        ? [...stagedPositionsBeforeDiscount, stagedDiscountPosition]
        : stagedPositionsBeforeDiscount,
    [stagedPositionsBeforeDiscount, stagedDiscountPosition],
  );
  const base = round2(subtotal - extrasTotal - stairsTotal - round2(num(travel)));
  const suggested = useMemo(() => positionsTotal(stagedPositions), [stagedPositions]);

  /**
   * Single Source of Truth: Das Leistungsverzeichnis bestimmt die Summe.
   * Gesamt netto = Summe aus Menge × Einzelpreis jeder Position – es gibt
   * keinen aufgezwungenen Endpreis und keine stille Ausgleichsposition mehr.
   */
  const lvPositions = useMemo(
    () =>
      lvItems
        .map((item) => ({
          key: item.id,
          description: item.description.trim(),
          quantity: round2(num(item.quantity)),
          unit: item.unit.trim() || "Pauschal",
          // Einzelpreise dürfen negativ sein (ausgewiesene Rabattposition).
          unit_price: round2(parseGermanNumber(item.unit_price)),
          section: (item.section || "").trim() || KALK_SECTION,
          sourceLvItemId: item.sourceLvItemId ?? null,
        }))

        .filter(
          (item) =>
            item.description.length > 0 && Math.abs(item.quantity * item.unit_price) >= 0.01,
        ),
    [lvItems],
  );
  const lvTotal = useMemo(() => positionsTotal(lvPositions), [lvPositions]);

  /** Positionen der KI-Analyse – reine Vorschau, unabhängig vom LV. */
  const kiPositions = useMemo(
    () =>
      kiItems
        .map((item) => ({
          key: item.id,
          description: item.description.trim(),
          quantity: round2(num(item.quantity)),
          unit: item.unit.trim() || "Pauschal",
          unit_price: round2(parseGermanNumber(item.unit_price)),
          section: KI_SECTION,
          sourceLvItemId: null as string | null,
        }))
        .filter(
          (item) =>
            item.description.length > 0 && Math.abs(item.quantity * item.unit_price) >= 0.01,
        ),
    [kiItems],
  );
  const kiTotal = useMemo(() => positionsTotal(kiPositions), [kiPositions]);
  const currentOriginal = kiOriginalItem && kiItems.find((item) => item.id === kiOriginalItem.id);
  const kiItemChanged =
    !!kiOriginalItem &&
    (!currentOriginal ||
      currentOriginal.description !== kiOriginalItem.description ||
      currentOriginal.quantity !== kiOriginalItem.quantity ||
      currentOriginal.unit !== kiOriginalItem.unit ||
      currentOriginal.unit_price !== kiOriginalItem.unit_price);
  const kiBasisChanged =
    kiBasis !== null &&
    (type !== kiBasis.type ||
      aiPrompt.trim() !== kiPrompt ||
      mode !== kiBasis.mode ||
      num(area) !== kiBasis.area ||
      (mode === "hours" && num(hours) !== kiBasis.hours) ||
      num(frequency) !== kiBasis.frequency ||
      frequencyUnit !== kiBasis.frequencyUnit ||
      (kiPricingBasis === "area" && num(pricePerSqm) !== kiBasis.pricePerSqm) ||
      (mode === "hours" && num(hourlyRate) !== kiBasis.hourlyRate) ||
      (kiPricingBasis === "floor" && num(floors) !== kiBasis.floors));
  const vatRate = vatRateForTaxMode(taxMode);
  const taxNote = taxNoteForTaxMode(taxMode);
  const vatAmount = round2((lvTotal * vatRate) / 100);
  const grossTotal = round2(lvTotal + vatAmount);

  // Jede preis- oder angebotsrelevante Änderung hebt die finale Bestätigung
  // wieder auf – insbesondere direkte Änderungen am Leistungsverzeichnis.
  useEffect(() => {
    setConfirmed(false);
  }, [note, discountReason, selected.value, taxMode, lvItems]);

  // Live-Kennzahlen für die integrierte Projekt-Analyse
  const monthlyHours = useMemo(() => {
    if (mode === "hours") return num(hours) * visitsPerMonth;
    const rate = num(hourlyRate);
    if (rate <= 0) return 0;
    return (num(area) * num(pricePerSqm) * visitsPerMonth) / rate;
  }, [mode, hours, area, pricePerSqm, hourlyRate, visitsPerMonth]);

  /**
   * Interne Kostenkalkulation vor Angebotsabgabe.
   * Wenn ein Raumbuch vorhanden ist, werden dessen Leistungswerte für den
   * Stundenbedarf bevorzugt; sonst greift die bestehende Kalkulationslogik.
   */
  const costingMonthlyHours =
    raumbuch && raumbuch.hoursPerVisit > 0
      ? round2(raumbuch.hoursPerVisit * visitsPerMonth)
      : round2(monthlyHours);
  const laborBurdenPerHour = round2(
    num(laborWage) * (Math.min(200, num(laborBurdenPercent)) / 100),
  );
  const selfCostPerHour = round2(
    num(laborWage) + laborBurdenPerHour + num(materialCost) + num(overheadCost),
  );
  const targetSellingRate = round2(selfCostPerHour * (1 + Math.min(100, num(profitMarkup)) / 100));
  const monthlySelfCost = round2(selfCostPerHour * costingMonthlyHours);
  const targetMonthlyRevenue = round2(targetSellingRate * costingMonthlyHours);
  const effectiveSellingRate =
    costingMonthlyHours > 0 ? round2(suggested / costingMonthlyHours) : 0;
  const contribution = round2(suggested - monthlySelfCost);
  const contributionMargin = suggested > 0 ? round2((contribution / suggested) * 100) : 0;
  const economyLevel =
    effectiveSellingRate >= targetSellingRate && targetSellingRate > 0
      ? "good"
      : effectiveSellingRate >= selfCostPerHour && selfCostPerHour > 0
        ? "tight"
        : "loss";

  /** Plausibilitätsprüfung der Eingaben (Fläche vs. Räume/Etagen/Sanitär). */
  const warnings = useMemo(
    () =>
      checkPlausibility({
        areaSqm: mode === "area" ? num(area) : analysisTotals.sqm,
        rooms: analysisTotals.rooms,
        floors: Math.max(analysisTotals.floors, stairs ? num(floors) : 0),
      }),
    [mode, area, analysisTotals, stairs, floors],
  );

  /**
   * Preisniveau-Hinweise (blockieren nicht): warnt bei unrealistisch hohem
   * Monatspreis je m² oder zu niedrigem rechnerischem Stundenerlös.
   */
  const priceHints = useMemo(
    () =>
      checkPlausibility({
        areaSqm: mode === "area" ? num(area) : analysisTotals.sqm,
        rooms: 0,
        floors: 0,
        monthlyNet: suggested,
        hoursPerMonth: monthlyHours,
      }),
    [mode, area, analysisTotals, suggested, monthlyHours],
  );

  /** Herkunftsbereich einer LV-Zeile (Fallback: „Kalkulation"). */
  const sectionOf = (i: AiItem) => (i.section || "").trim() || KALK_SECTION;

  type PendingApply = {
    section: string;
    label: string;
    items: AiItem[];
    /** Zeilen im LV, die aus einer anderen Quelle stammen. */
    foreignCount: number;
    foreignTotal: number;
  };
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

  const saveCalculation = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");

      const payload = {
        user_id: userId,
        project_id: projectId,
        title: calcTitle.trim() || proposalTitle.trim() || selected.label,
        cleaning_type: type,
        mode,
        area_sqm: num(area),
        glass_sqm: num(glassArea),
        price_per_sqm: num(pricePerSqm),
        hours: num(hours),
        hourly_rate: num(hourlyRate),
        frequency: num(frequency),
        frequency_unit: frequencyUnit,
        travel: num(travel),
        extras,
        stairs,
        floors: num(floors),
        stair_rate: num(stairRate),
        stair_visits_per_month: num(stairFrequency),
        has_lift: hasLift,
        lift_rate: num(liftRate),
        discount_percent: pct,
        discount_amount: discountFixed,
        discount_reason: discountReason,
        tax_mode: taxMode,
        note,
        proposal_title: proposalTitle,
        proposal_text: proposalText,
        net_total: lvTotal,
      };

      let id = calcId;
      if (id) {
        const { error } = await supabase.from("calculations").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("calculations")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        id = data.id;
      }

      await supabase.from("calculation_items").delete().eq("calculation_id", id);
      if (lvPositions.length > 0) {
        const { error } = await supabase.from("calculation_items").insert(
          lvPositions.map((p, n) => ({
            calculation_id: id!,
            user_id: userId,
            position: n + 1,
            description: p.description,
            quantity: p.quantity,
            unit: p.unit,
            unit_price: p.unit_price,
            section: p.section,
            source_lv_item_id: p.sourceLvItemId,
          })),
        );
        if (error) throw error;
      }

      /**
       * Gemeinsame Datenquelle: Positionen zurück ins Projekt-LV – ohne Duplikate.
       * Übernommene Zeilen werden an ihrer Herkunftsstelle aktualisiert (Bereich
       * bleibt erhalten), nur wirklich neue Positionen landen im Bereich
       * „Kalkulation". Gelöscht wird ausschließlich, was diese Kalkulation
       * zuvor selbst im Bereich „Kalkulation" angelegt hat.
       */
      const linkedIds: Record<string, string> = {};
      if (projectId) {
        const { data: existingRows, error: exErr } = await supabase
          .from("project_lv_items")
          .select("id, section")
          .eq("project_id", projectId);
        if (exErr) throw exErr;
        const existing = new Map((existingRows ?? []).map((r) => [r.id, r.section]));

        const keep = new Set(
          lvPositions
            .map((p) => p.sourceLvItemId)
            .filter((v): v is string => !!v && existing.has(v)),
        );

        const stale = (existingRows ?? [])
          .filter((r) => r.section === KALK_SECTION && !keep.has(r.id))
          .map((r) => r.id);
        if (stale.length > 0) {
          const { error } = await supabase.from("project_lv_items").delete().in("id", stale);
          if (error) throw error;
        }

        const inserts: { pos: (typeof lvPositions)[number]; index: number }[] = [];
        for (let n = 0; n < lvPositions.length; n++) {
          const p = lvPositions[n]!;
          if (p.sourceLvItemId && existing.has(p.sourceLvItemId)) {
            const { error } = await supabase
              .from("project_lv_items")
              .update({
                position: n + 1,
                // Bereich bleibt unverändert – keine Verschiebung fremder Abschnitte.
                title: p.description.slice(0, 120),
                description: p.description,
                quantity: p.quantity,
                unit: p.unit,
                unit_price: p.unit_price,
              })
              .eq("id", p.sourceLvItemId);
            if (error) throw error;
          } else {
            inserts.push({ pos: p, index: n });
          }
        }

        if (inserts.length > 0) {
          const { data: created, error } = await supabase
            .from("project_lv_items")
            .insert(
              inserts.map(({ pos, index }) => ({
                project_id: projectId,
                user_id: userId,
                position: index + 1,
                section: KALK_SECTION,
                title: pos.description.slice(0, 120),
                description: pos.description,
                quantity: pos.quantity,
                unit: pos.unit,
                unit_price: pos.unit_price,
              })),
            )
            .select("id");
          if (error) throw error;
          (created ?? []).forEach((row, i) => {
            const src = inserts[i];
            if (src) linkedIds[src.pos.key] = row.id;
          });
        }
      }

      // Verknüpfung auch in der gespeicherten Kalkulation festhalten,
      // damit ein erneutes Laden weiterhin duplikatfrei zurückschreibt.
      for (const [key, lvId] of Object.entries(linkedIds)) {
        const idx = lvPositions.findIndex((p) => p.key === key);
        if (idx < 0) continue;
        await supabase
          .from("calculation_items")
          .update({ source_lv_item_id: lvId })
          .eq("calculation_id", id)
          .eq("position", idx + 1);
      }

      return { id: id!, linkedIds };
    },
    onSuccess: ({ id, linkedIds }) => {
      setCalcId(id);
      setLvItems((prev) =>
        prev.map((i) => (linkedIds[i.id] ? { ...i, sourceLvItemId: linkedIds[i.id]! } : i)),
      );
      void queryClient.invalidateQueries({ queryKey: ["calculations"] });
      if (projectId) void queryClient.invalidateQueries({ queryKey: ["project_lv", projectId] });
      toast.success("Kalkulation gespeichert");
    },

    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });

  const loadCalculation = useMutation({
    mutationFn: async (id: string) => {
      const { data: head, error } = await supabase
        .from("calculations")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      const { data: items } = await supabase
        .from("calculation_items")
        .select("*")
        .eq("calculation_id", id)
        .order("position");
      return { head, items: items ?? [] };
    },
    onSuccess: ({ head, items }) => {
      const dec = (v: unknown) => String(Number(v) || 0).replace(".", ",");
      setCalcId(head.id);
      setCalcTitle(head.title);
      setProjectId(head.project_id);
      setType(head.cleaning_type);
      setMode(head.mode === "hours" ? "hours" : "area");
      setArea(dec(head.area_sqm));
      setGlassArea(dec(head.glass_sqm));
      setPricePerSqm(dec(head.price_per_sqm));
      setHours(dec(head.hours));
      setHourlyRate(dec(head.hourly_rate));
      setFrequency(dec(head.frequency));
      setFrequencyUnit(head.frequency_unit === "week" ? "week" : "month");
      setTravel(dec(head.travel));
      setExtras(head.extras ?? []);
      setStairs(head.stairs);
      setFloors(dec(head.floors));
      setStairRate(dec(head.stair_rate));
      setStairFrequency(dec(head.stair_visits_per_month));
      setHasLift(head.has_lift);
      setLiftRate(dec(head.lift_rate));
      setDiscountPercent(dec(head.discount_percent));
      setDiscountAmountInput(dec(head.discount_amount));
      setDiscountReason(head.discount_reason);
      setTaxMode(head.tax_mode);
      setNote(head.note);
      setProposalTitle(head.proposal_title);
      setProposalText(head.proposal_text);
      setLvItems(
        items.map((i, n) => ({
          id: `db-${i.id}-${n}`,
          description: i.description,
          quantity: dec(i.quantity),
          unit: i.unit,
          unit_price: dec(i.unit_price),
          section: i.section || KALK_SECTION,
          sourceLvItemId: i.source_lv_item_id,
        })),
      );
      toast.success("Kalkulation geladen");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Positionen aus dem Leistungsverzeichnis des Projekts übernehmen. */
  const importProjectLv = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Kein Projekt verknüpft");
      const { data, error } = await supabase
        .from("project_lv_items")
        .select("id, position, section, title, description, quantity, unit, unit_price")
        .eq("project_id", projectId)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
    onSuccess: (rows) => {
      if (rows.length === 0) {
        toast.error("Im Projekt sind noch keine LV-Positionen erfasst.");
        return;
      }
      const dec = (v: unknown) => String(Number(v) || 0).replace(".", ",");
      setLvItems(
        rows.map((r, n) => ({
          id: `lv-${r.id}-${n}`,
          description: r.description?.trim() || r.title || "Position",
          quantity: dec(r.quantity),
          unit: r.unit || "Pauschal",
          unit_price: dec(r.unit_price),
          // Herkunft merken: Bereich bleibt erhalten, Rückschreiben aktualisiert
          // genau diese Zeile statt eine Kopie anzulegen.
          section: r.section || KALK_SECTION,
          sourceLvItemId: r.id,
        })),
      );
      toast.success(`${rows.length} Positionen aus dem Projekt-LV übernommen`);
    },

    onError: (e: Error) => toast.error(e.message),
  });

  // Beim Aufruf „In Kalkulation übernehmen" die Projektpositionen mitnehmen.
  const [lvImported, setLvImported] = useState(false);
  useEffect(() => {
    if (!search.projekt || lvImported) return;
    setLvImported(true);
    importProjectLv.mutate();
  }, [search.projekt, lvImported]);

  /** Leistungsverzeichnis als abgabefertiges PDF exportieren. */
  const exportLv = useMutation({
    mutationFn: async () => {
      const positions = lvPositions.map((i, n) => ({
        oz: `${n + 1}.10`,
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        unitPrice: i.unit_price,
      }));
      if (positions.length === 0) {
        throw new Error("Bitte zuerst LV-Positionen erfassen oder die Kalkulation übernehmen.");
      }

      const { data: settings } = await supabase
        .from("company_settings")
        .select(
          "company_name, owner_name, address_line, postal_code, city, email, phone, vat_id, tax_number, iban, bic, bank_name",
        )
        .maybeSingle();

      const { buildLvPdf } = await import("@/lib/lv-pdf");
      const bytes = await buildLvPdf({
        title: proposalTitle.trim() || `Leistungsverzeichnis ${selected.label}`,
        reference: proposalTitle.trim(),
        proposalText: proposalText.trim(),
        objectDescription: floorplanSummary.trim(),
        company: {
          name: settings?.company_name || "Unternehmen",
          ownerName: settings?.owner_name ?? "",
          addressLine: settings?.address_line ?? "",
          postalCode: settings?.postal_code ?? "",
          city: settings?.city ?? "",
          email: settings?.email ?? "",
          phone: settings?.phone ?? "",
          vatId: settings?.vat_id ?? "",
          taxNumber: settings?.tax_number ?? "",
          iban: settings?.iban ?? "",
          bic: settings?.bic ?? "",
          bankName: settings?.bank_name ?? "",
        },
        meta: [
          { label: "Leistungsart", value: selected.label },
          {
            label: "Fläche",
            value: `${formatNumber(mode === "area" ? num(area) : analysisTotals.sqm)} m²`,
          },
          { label: "Einsätze/Monat", value: formatNumber(visitsPerMonth) },
          { label: "Stundenbedarf", value: `${formatNumber(monthlyHours)} Std./Monat` },
        ],
        positions,
        vatRate,
        ...(taxNote ? { taxNote } : {}),
      });
      await saveFile(
        new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" }),
        "Leistungsverzeichnis.pdf",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toQuote = useMutation({
    mutationFn: async () => {
      // Nur geprüfte, rechnerisch gültige Daten dürfen ins Angebot.
      if (warnings.length > 0) {
        throw new Error("Bitte zuerst die Plausibilitätshinweise klären.");
      }
      const positions = lvPositions;
      if (positions.length === 0) {
        throw new Error(
          "Es liegen keine gültigen Positionen vor. Bitte zuerst die Kalkulation übernehmen.",
        );
      }

      const quoteId = await createDocument("quote");

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");

      /**
       * Die Leistungsbeschreibung wird aus den tatsächlich abgerechneten
       * Positionen abgeleitet – nicht aus dem Formularzustand. So kann der
       * Text nie eine andere Abrechnungsmethode (m² statt Std.) nennen als
       * die, nach der wirklich fakturiert wird.
       */
      const isHourUnit = (u: string) => /^(std|stunde)/i.test(u.trim());
      const parts: string[] = [selected.label];
      for (const p of positions) {
        if (p.unit_price < 0) {
          parts.push(`${p.description}: ${formatMoney(p.unit_price)}`);
          continue;
        }
        const line = isHourUnit(p.unit)
          ? `${p.description}: ${formatNumber(p.quantity)} Std. × ${formatMoney(p.unit_price)}/Std. = ${formatMoney(round2(p.quantity * p.unit_price))}`
          : `${p.description}: ${formatNumber(p.quantity)} ${p.unit} × ${formatMoney(p.unit_price)} = ${formatMoney(round2(p.quantity * p.unit_price))}`;
        parts.push(line);
      }
      parts.push(
        `Turnus: ${formatNumber(num(frequency))} ${recurrenceUnitLabel(frequencyUnit)} · ${formatNumber(annualVisits)} Einsätze/Jahr ÷ 12 = ${formatNumber(visitsPerMonth)} pro Monat`,
      );
      if (discountReason.trim() && pct > 0) {
        parts.push(`Rabatt ${formatNumber(pct)} % – ${discountReason.trim()}`);
      }

      if (note.trim()) parts.push(note.trim());

      const { error: itemError } = await supabase.from("document_items").insert(
        positions.map((i, n) => ({
          document_id: quoteId,
          user_id: userId,
          position: n + 1,
          description: i.description,
          quantity: i.quantity,
          unit: i.unit,
          unit_price: i.unit_price,
        })),
      );
      if (itemError) throw itemError;

      const description = [
        proposalTitle.trim() ? `Ausschreibung: ${proposalTitle.trim()}` : "",
        floorplanSummary.trim(),
        parts.join("\n"),
      ]
        .filter(Boolean)
        .join("\n");

      // Gleiche Summenlogik wie im Belegeditor (Rabatt steckt bereits als Position).
      const {
        netTotal: net,
        vatAmount: vat,
        grossTotal,
      } = computeDocumentTotals(positions, 0, vatRate);
      const { error: docError } = await supabase
        .from("documents")
        .update({
          service_description: description,
          ...(proposalText.trim() ? { intro_text: proposalText.trim() } : {}),
          // Rabatt steckt bereits als eigene Position im LV – kein zweiter Abzug.
          discount_percent: 0,
          discount_amount: 0,
          discount_reason: discountReason,
          // Steuerart der Kalkulation wird verbindlich übernommen.
          tax_mode: taxMode,
          vat_rate: vatRate,
          reverse_charge: taxMode === "eu_reverse_charge",
          net_total: net,
          vat_amount: vat,
          total: grossTotal,
          planned_hours_month: monthlyHours,
          planned_visits_month: visitsPerMonth,
        } as never)
        .eq("id", quoteId);
      if (docError) throw docError;

      return quoteId;
    },
    onSuccess: (quoteId) => {
      toast.success("Angebot aus Kalkulation erstellt");
      navigate({
        to: "/dokumente/$id",
        params: { id: quoteId },
        search: { bearbeiten: true },
      });
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });

  return {
    aiPrompt,
    aiReviewNotes,
    aiReviewQuestions,
    aiSuggest,
    analyseSnapshot,
    analysisTotals,
    annualVisits,
    applyCalculation,
    applyKiAnalysis,
    area,
    attachments,
    base,
    calcId,
    calcOutOfSync,
    calcTitle,
    confirmed,
    contribution,
    contributionMargin,
    costingMonthlyHours,
    discountAmountInput,
    discountFixed,
    discountPercent,
    discountReason,
    discountTotal,
    economyLevel,
    effectiveSellingRate,
    exportLv,
    extras,
    extrasTotal,
    floorplanSummary,
    floors,
    frequency,
    frequencyUnit,
    glassArea,
    grossTotal,
    hasLift,
    hourlyRate,
    hours,
    importProjectLv,
    kiBasis,
    kiBasisChanged,
    kiBillingPeriod,
    kiItemChanged,
    kiItems,
    kiOutOfSync,
    kiPositions,
    kiPricingBasis,
    kiTotal,
    laborBurdenPerHour,
    laborBurdenPercent,
    laborWage,
    liftRate,
    loadCalculation,
    lvCalcTotal,
    lvItems,
    lvKiTotal,
    lvPositions,
    lvTotal,
    materialCost,
    mode,
    monthlyHours,
    monthlySelfCost,
    navigate,
    note,
    overheadCost,
    patchKiItem,
    patchLvItem,
    pct,
    pendingApply,
    priceHints,
    pricePerSqm,
    profitMarkup,
    projectId,
    proposalText,
    proposalTitle,
    raumbuch,
    raumbuchApplied,
    resetCalculation,
    saveCalculation,
    savedCalcs,
    scanFile,
    scanningPath,
    search,
    selected,
    selfCostPerHour,
    setAiPrompt,
    setArea,
    setAttachments,
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
    setKiItems,
    setLiftRate,
    setLvItems,
    setMode,
    setNote,
    setPendingApply,
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
    stairVisitsPerMonth,
    stairs,
    stairsTotal,
    subtotal,
    suggested,
    targetMonthlyRevenue,
    targetSellingRate,
    taxMode,
    taxNote,
    tenderDocs,
    toQuote,
    travel,
    type,
    updateAttachment,
    vatAmount,
    vatRate,
    visiblePerformanceRates,
    visitsPerMonth,
    warnings,
    writeSource,
  };
}

export type KalkulationStateContext = NonNullable<ReturnType<typeof useKalkulationState>>;
