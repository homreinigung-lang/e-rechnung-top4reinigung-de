import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { analyzeProject } from "@/lib/project-scan.functions";

import { visitsPerMonth as calculateVisitsPerMonth, visitsPerYear } from "@/lib/constants";
import { fileUrl } from "@/lib/storage";

import { detectStairs, normalizeItems, round2 } from "@/lib/kalkulation-engine";

import { CLEANING_TYPES, EXTRAS, num, type Attachment, type AiItem, KI_SECTION } from "./shared";

import type { useKalkulationForm } from "./useKalkulationForm";

export function useKalkulationSuggestions(input: {
  aiPrompt: ReturnType<typeof useKalkulationForm>["aiPrompt"];
  analyze: ReturnType<typeof useKalkulationForm>["analyze"];
  attachments: ReturnType<typeof useKalkulationForm>["attachments"];
  discountPercent: ReturnType<typeof useKalkulationForm>["discountPercent"];
  extras: ReturnType<typeof useKalkulationForm>["extras"];
  floors: ReturnType<typeof useKalkulationForm>["floors"];
  frequency: ReturnType<typeof useKalkulationForm>["frequency"];
  frequencyUnit: ReturnType<typeof useKalkulationForm>["frequencyUnit"];
  hasLift: ReturnType<typeof useKalkulationForm>["hasLift"];
  hourlyRate: ReturnType<typeof useKalkulationForm>["hourlyRate"];
  liftRate: ReturnType<typeof useKalkulationForm>["liftRate"];
  raumbuch: ReturnType<typeof useKalkulationForm>["raumbuch"];
  setAiReviewNotes: ReturnType<typeof useKalkulationForm>["setAiReviewNotes"];
  setAiReviewQuestions: ReturnType<typeof useKalkulationForm>["setAiReviewQuestions"];
  setArea: ReturnType<typeof useKalkulationForm>["setArea"];
  setFloors: ReturnType<typeof useKalkulationForm>["setFloors"];
  setFrequency: ReturnType<typeof useKalkulationForm>["setFrequency"];
  setFrequencyUnit: ReturnType<typeof useKalkulationForm>["setFrequencyUnit"];
  setGlassArea: ReturnType<typeof useKalkulationForm>["setGlassArea"];
  setHourlyRate: ReturnType<typeof useKalkulationForm>["setHourlyRate"];
  setHours: ReturnType<typeof useKalkulationForm>["setHours"];
  setKiBasis: ReturnType<typeof useKalkulationForm>["setKiBasis"];
  setKiBillingPeriod: ReturnType<typeof useKalkulationForm>["setKiBillingPeriod"];
  setKiItems: ReturnType<typeof useKalkulationForm>["setKiItems"];
  setKiOriginalItem: ReturnType<typeof useKalkulationForm>["setKiOriginalItem"];
  setKiPricingBasis: ReturnType<typeof useKalkulationForm>["setKiPricingBasis"];
  setKiPrompt: ReturnType<typeof useKalkulationForm>["setKiPrompt"];
  setLvItems: ReturnType<typeof useKalkulationForm>["setLvItems"];
  setMode: ReturnType<typeof useKalkulationForm>["setMode"];
  setNote: ReturnType<typeof useKalkulationForm>["setNote"];
  setPricePerSqm: ReturnType<typeof useKalkulationForm>["setPricePerSqm"];
  setStairs: ReturnType<typeof useKalkulationForm>["setStairs"];
  setTravel: ReturnType<typeof useKalkulationForm>["setTravel"];
  setType: ReturnType<typeof useKalkulationForm>["setType"];
  stairFrequency: ReturnType<typeof useKalkulationForm>["stairFrequency"];
  stairRate: ReturnType<typeof useKalkulationForm>["stairRate"];
  stairs: ReturnType<typeof useKalkulationForm>["stairs"];
  updateAttachment: ReturnType<typeof useKalkulationForm>["updateAttachment"];
}) {
  const {
    aiPrompt,
    analyze,
    attachments,
    discountPercent,
    extras,
    floors,
    frequency,
    frequencyUnit,
    hasLift,
    hourlyRate,
    liftRate,
    raumbuch,
    setAiReviewNotes,
    setAiReviewQuestions,
    setArea,
    setFloors,
    setFrequency,
    setFrequencyUnit,
    setGlassArea,
    setHourlyRate,
    setHours,
    setKiBasis,
    setKiBillingPeriod,
    setKiItems,
    setKiOriginalItem,
    setKiPricingBasis,
    setKiPrompt,
    setLvItems,
    setMode,
    setNote,
    setPricePerSqm,
    setStairs,
    setTravel,
    setType,
    stairFrequency,
    stairRate,
    stairs,
    updateAttachment,
  } = input;
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
  return {
    aiSuggest,
    analysisTotals,
    annualVisits,
    extrasTotal,
    patchKiItem,
    patchLvItem,
    pct,
    scanFile,
    scanningPath,
    stairVisitsPerMonth,
    stairsTotal,
    visitsPerMonth,
  };
}
