import { calculateRooms } from "@/lib/room-calculation";
import { cleaningHoursPerVisit } from "@/lib/cleaning-hours";
import { useEffect, useMemo } from "react";

import { parseGermanNumber, taxNoteForTaxMode, vatRateForTaxMode } from "@/lib/format";

import {
  buildConsolidatedPositions,
  buildDiscountPosition,
  checkPlausibility,
  positionsTotal,
  round2,
} from "@/lib/kalkulation-engine";

import { EXTRAS, num, type AiItem, KALK_SECTION, KI_SECTION } from "./shared";

import type { useKalkulationForm } from "./useKalkulationForm";
import type { useKalkulationSuggestions } from "./useKalkulationSuggestions";

export function useCalculationTotals(input: {
  roomCalculation: ReturnType<typeof useKalkulationForm>["roomCalculation"];
  aiPrompt: ReturnType<typeof useKalkulationForm>["aiPrompt"];
  analysisTotals: ReturnType<typeof useKalkulationSuggestions>["analysisTotals"];
  area: ReturnType<typeof useKalkulationForm>["area"];
  discountAmountInput: ReturnType<typeof useKalkulationForm>["discountAmountInput"];
  discountReason: ReturnType<typeof useKalkulationForm>["discountReason"];
  extras: ReturnType<typeof useKalkulationForm>["extras"];
  extrasTotal: ReturnType<typeof useKalkulationSuggestions>["extrasTotal"];
  floors: ReturnType<typeof useKalkulationForm>["floors"];
  frequency: ReturnType<typeof useKalkulationForm>["frequency"];
  frequencyUnit: ReturnType<typeof useKalkulationForm>["frequencyUnit"];
  glassArea: ReturnType<typeof useKalkulationForm>["glassArea"];
  hasLift: ReturnType<typeof useKalkulationForm>["hasLift"];
  hourlyRate: ReturnType<typeof useKalkulationForm>["hourlyRate"];
  hours: ReturnType<typeof useKalkulationForm>["hours"];
  kiBasis: ReturnType<typeof useKalkulationForm>["kiBasis"];
  kiItems: ReturnType<typeof useKalkulationForm>["kiItems"];
  kiOriginalItem: ReturnType<typeof useKalkulationForm>["kiOriginalItem"];
  kiPricingBasis: ReturnType<typeof useKalkulationForm>["kiPricingBasis"];
  kiPrompt: ReturnType<typeof useKalkulationForm>["kiPrompt"];
  laborBurdenPercent: ReturnType<typeof useKalkulationForm>["laborBurdenPercent"];
  laborWage: ReturnType<typeof useKalkulationForm>["laborWage"];
  glassGrossWage?: ReturnType<typeof useKalkulationForm>["glassGrossWage"];
  liftRate: ReturnType<typeof useKalkulationForm>["liftRate"];
  lvItems: ReturnType<typeof useKalkulationForm>["lvItems"];
  materialCost: ReturnType<typeof useKalkulationForm>["materialCost"];
  mode: ReturnType<typeof useKalkulationForm>["mode"];
  note: ReturnType<typeof useKalkulationForm>["note"];
  overheadCost: ReturnType<typeof useKalkulationForm>["overheadCost"];
  pct: ReturnType<typeof useKalkulationSuggestions>["pct"];
  pricePerSqm: ReturnType<typeof useKalkulationForm>["pricePerSqm"];
  profitMarkup: ReturnType<typeof useKalkulationForm>["profitMarkup"];
  raumbuch: ReturnType<typeof useKalkulationForm>["raumbuch"];
  selected: ReturnType<typeof useKalkulationForm>["selected"];
  selectedPerformanceRate?: ReturnType<typeof useKalkulationForm>["selectedPerformanceRate"];
  setConfirmed: ReturnType<typeof useKalkulationForm>["setConfirmed"];
  stairRate: ReturnType<typeof useKalkulationForm>["stairRate"];
  stairVisitsPerMonth: ReturnType<typeof useKalkulationSuggestions>["stairVisitsPerMonth"];
  stairs: ReturnType<typeof useKalkulationForm>["stairs"];
  stairsTotal: ReturnType<typeof useKalkulationSuggestions>["stairsTotal"];
  taxMode: ReturnType<typeof useKalkulationForm>["taxMode"];
  travel: ReturnType<typeof useKalkulationForm>["travel"];
  type: ReturnType<typeof useKalkulationForm>["type"];
  visitsPerMonth: ReturnType<typeof useKalkulationSuggestions>["visitsPerMonth"];
}) {
  const {
    roomCalculation,
    aiPrompt,
    analysisTotals,
    area,
    discountAmountInput,
    discountReason,
    extras,
    extrasTotal,
    floors,
    frequency,
    frequencyUnit,
    glassArea,
    hasLift,
    hourlyRate,
    hours,
    kiBasis,
    kiItems,
    kiOriginalItem,
    kiPricingBasis,
    kiPrompt,
    laborBurdenPercent,
    laborWage,
    glassGrossWage,
    liftRate,
    lvItems,
    materialCost,
    mode,
    note,
    overheadCost,
    pct,
    pricePerSqm,
    profitMarkup,
    raumbuch,
    selected,
    selectedPerformanceRate,
    setConfirmed,
    stairRate,
    stairVisitsPerMonth,
    stairs,
    stairsTotal,
    taxMode,
    travel,
    type,
    visitsPerMonth,
  } = input;
  const roomSummary = useMemo(
    () => calculateRooms(roomCalculation, num(hourlyRate), frequencyUnit === "once"),
    [roomCalculation, hourlyRate, frequencyUnit],
  );
  const stagedPositionsBeforeDiscount = useMemo(() => {
    const additional = buildConsolidatedPositions({
      oneTime: frequencyUnit === "once",
      typeValue: selected.value,
      typeLabel: selected.label,
      performanceSqmPerHour: selectedPerformanceRate?.sqm_per_hour ?? 0,
      mode,
      // Glasreinigung rechnet mit der separat erfassten Glasfläche.
      areaSqm: roomCalculation.enabled ? 0 : selected.value === "glas" ? num(glassArea) : num(area),

      pricePerSqm: num(pricePerSqm),
      hours: roomCalculation.enabled ? 0 : num(hours),
      hourlyRate: num(hourlyRate),
      visitsPerMonth,
      stairs: roomCalculation.enabled ? false : stairs,
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
    });
    return roomCalculation.enabled ? [...roomSummary.positions, ...additional] : additional;
  }, [
    roomCalculation.enabled,
    roomSummary,
    selected.value,
    selected.label,
    selectedPerformanceRate?.sqm_per_hour,
    mode,
    area,
    glassArea,

    pricePerSqm,
    hours,
    hourlyRate,
    visitsPerMonth,
    frequencyUnit,
    stairs,
    floors,
    stairRate,
    stairVisitsPerMonth,
    hasLift,
    liftRate,
    extras,
    travel,
  ]);
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
  const travelTotal = positionsTotal(
    stagedPositionsBeforeDiscount.filter((item) => item.description === "Anfahrtspauschale je Einsatz"),
  );
  const base = round2(
    subtotal - extrasTotal - (roomCalculation.enabled ? 0 : stairsTotal) - travelTotal,
  );
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
      ((kiPricingBasis === "area" || (kiPricingBasis === "floor" && kiItems.length > 1)) &&
        num(pricePerSqm) !== kiBasis.pricePerSqm) ||
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
  }, [note, discountReason, selected.value, taxMode, lvItems, roomCalculation, hourlyRate]);

  // Live-Kennzahlen für die integrierte Projekt-Analyse
  const monthlyHours = useMemo(() => {
    if (roomCalculation.enabled) return roomSummary.monthlyHours;
    return cleaningHoursPerVisit({
      mode, typeValue: selected.value, area: num(area), glassArea: num(glassArea),
      hours: num(hours), sqmPerHour: Number(selectedPerformanceRate?.sqm_per_hour ?? 0),
    }) * visitsPerMonth;
  }, [
    roomCalculation.enabled,
    roomSummary.monthlyHours,
    mode,
    hours,
    area,
    glassArea,
    selected.value,
    selectedPerformanceRate?.sqm_per_hour,
    visitsPerMonth,
  ]);

  /**
   * Interne Kostenkalkulation vor Angebotsabgabe.
   * Wenn ein Raumbuch vorhanden ist, werden dessen Leistungswerte für den
   * Stundenbedarf bevorzugt; sonst greift die bestehende Kalkulationslogik.
   */
  const costingMonthlyHours = roomCalculation.enabled
    ? roomSummary.monthlyHours
    : raumbuch && raumbuch.hoursPerVisit > 0
      ? round2(raumbuch.hoursPerVisit * visitsPerMonth)
      : round2(monthlyHours);
  const effectiveLaborWage = type === "glas" ? num(glassGrossWage ?? "18") : num(laborWage);
  const laborBurdenPerHour = round2(
    effectiveLaborWage * (Math.min(200, num(laborBurdenPercent)) / 100),
  );
  const selfCostPerHour = round2(
    effectiveLaborWage + laborBurdenPerHour + num(materialCost) + num(overheadCost),
  );
  const targetSellingRate = round2(selfCostPerHour * (1 + Math.min(100, num(profitMarkup)) / 100));
  const monthlySelfCost = round2(selfCostPerHour * costingMonthlyHours);
  const targetMonthlyRevenue = round2(targetSellingRate * costingMonthlyHours);
  // LV is the source of truth once positions are present; otherwise preview the proposal.
  // Both revenue and costingMonthlyHours must describe the same billing period.
  const profitabilityRevenue = lvPositions.length > 0 ? lvTotal : suggested;
  const effectiveSellingRate =
    costingMonthlyHours > 0 ? round2(profitabilityRevenue / costingMonthlyHours) : 0;
  const contribution = round2(profitabilityRevenue - monthlySelfCost);
  const contributionMargin =
    profitabilityRevenue > 0 ? round2((contribution / profitabilityRevenue) * 100) : 0;
  const economyLevel =
    effectiveSellingRate >= targetSellingRate && targetSellingRate > 0
      ? "good"
      : effectiveSellingRate >= selfCostPerHour && selfCostPerHour > 0
        ? "tight"
        : "loss";

  /** Plausibilitätsprüfung der Eingaben (Fläche vs. Räume/Etagen/Sanitär). */
  const warnings = useMemo(
    () => [
      ...(roomCalculation.enabled ? roomSummary.errors : []),
      ...checkPlausibility({
        areaSqm: roomCalculation.enabled
          ? roomSummary.area
          : mode === "area"
            ? num(area)
            : analysisTotals.sqm,
        rooms: analysisTotals.rooms,
        floors: Math.max(analysisTotals.floors, stairs ? num(floors) : 0),
      }),
    ],
    [roomCalculation.enabled, roomSummary, mode, area, analysisTotals, stairs, floors],
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
        oneTime: frequencyUnit === "once",
        monthlyNet: suggested,
        hoursPerMonth: costingMonthlyHours,
      }),
    [mode, area, analysisTotals, suggested, costingMonthlyHours, frequencyUnit],
  );

  /** Herkunftsbereich einer LV-Zeile (Fallback: „Kalkulation"). */
  const sectionOf = (i: AiItem) => (i.section || "").trim() || KALK_SECTION;
  return {
    roomSummary,
    base,
    contribution,
    contributionMargin,
    costingMonthlyHours,
    discountFixed,
    discountTotal,
    economyLevel,
    effectiveSellingRate,
    grossTotal,
    kiBasisChanged,
    kiItemChanged,
    kiPositions,
    kiTotal,
    laborBurdenPerHour,
    lvPositions,
    lvTotal,
    monthlyHours,
    monthlySelfCost,
    priceHints,
    profitabilityRevenue,
    sectionOf,
    selfCostPerHour,
    stagedPositions,
    subtotal,
    suggested,
    targetMonthlyRevenue,
    targetSellingRate,
    travelTotal,
    taxNote,
    vatAmount,
    vatRate,
    warnings,
  };
}
