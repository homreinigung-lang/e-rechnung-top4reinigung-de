import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

import { formatNumber } from "@/lib/format";

import { saveFile } from "@/lib/download";

import { num, KALK_SECTION } from "./shared";

import type { useKalkulationSuggestions } from "./useKalkulationSuggestions";
import type { useKalkulationForm } from "./useKalkulationForm";
import type { useCalculationTotals } from "./useCalculationTotals";

export function useCalculationImportExport(input: {
  analysisTotals: ReturnType<typeof useKalkulationSuggestions>["analysisTotals"];
  area: ReturnType<typeof useKalkulationForm>["area"];
  floorplanSummary: ReturnType<typeof useKalkulationForm>["floorplanSummary"];
  lvPositions: ReturnType<typeof useCalculationTotals>["lvPositions"];
  mode: ReturnType<typeof useKalkulationForm>["mode"];
  monthlyHours: ReturnType<typeof useCalculationTotals>["monthlyHours"];
  projectId: ReturnType<typeof useKalkulationForm>["projectId"];
  proposalText: ReturnType<typeof useKalkulationForm>["proposalText"];
  proposalTitle: ReturnType<typeof useKalkulationForm>["proposalTitle"];
  search: ReturnType<typeof useKalkulationForm>["search"];
  selected: ReturnType<typeof useKalkulationForm>["selected"];
  setArea: ReturnType<typeof useKalkulationForm>["setArea"];
  setCalcId: ReturnType<typeof useKalkulationForm>["setCalcId"];
  setCalcTitle: ReturnType<typeof useKalkulationForm>["setCalcTitle"];
  setDiscountAmountInput: ReturnType<typeof useKalkulationForm>["setDiscountAmountInput"];
  setDiscountPercent: ReturnType<typeof useKalkulationForm>["setDiscountPercent"];
  setDiscountReason: ReturnType<typeof useKalkulationForm>["setDiscountReason"];
  setExtras: ReturnType<typeof useKalkulationForm>["setExtras"];
  setFloors: ReturnType<typeof useKalkulationForm>["setFloors"];
  setFrequency: ReturnType<typeof useKalkulationForm>["setFrequency"];
  setFrequencyUnit: ReturnType<typeof useKalkulationForm>["setFrequencyUnit"];
  setGlassArea: ReturnType<typeof useKalkulationForm>["setGlassArea"];
  setHasLift: ReturnType<typeof useKalkulationForm>["setHasLift"];
  setHourlyRate: ReturnType<typeof useKalkulationForm>["setHourlyRate"];
  setHours: ReturnType<typeof useKalkulationForm>["setHours"];
  setLiftRate: ReturnType<typeof useKalkulationForm>["setLiftRate"];
  setLvItems: ReturnType<typeof useKalkulationForm>["setLvItems"];
  setMode: ReturnType<typeof useKalkulationForm>["setMode"];
  setNote: ReturnType<typeof useKalkulationForm>["setNote"];
  setPricePerSqm: ReturnType<typeof useKalkulationForm>["setPricePerSqm"];
  setProjectId: ReturnType<typeof useKalkulationForm>["setProjectId"];
  setProposalText: ReturnType<typeof useKalkulationForm>["setProposalText"];
  setProposalTitle: ReturnType<typeof useKalkulationForm>["setProposalTitle"];
  setStairFrequency: ReturnType<typeof useKalkulationForm>["setStairFrequency"];
  setStairRate: ReturnType<typeof useKalkulationForm>["setStairRate"];
  setStairs: ReturnType<typeof useKalkulationForm>["setStairs"];
  setTaxMode: ReturnType<typeof useKalkulationForm>["setTaxMode"];
  setTravel: ReturnType<typeof useKalkulationForm>["setTravel"];
  setType: ReturnType<typeof useKalkulationForm>["setType"];
  taxNote: ReturnType<typeof useCalculationTotals>["taxNote"];
  vatRate: ReturnType<typeof useCalculationTotals>["vatRate"];
  visitsPerMonth: ReturnType<typeof useKalkulationSuggestions>["visitsPerMonth"];
}) {
  const {
    analysisTotals,
    area,
    floorplanSummary,
    lvPositions,
    mode,
    monthlyHours,
    projectId,
    proposalText,
    proposalTitle,
    search,
    selected,
    setArea,
    setCalcId,
    setCalcTitle,
    setDiscountAmountInput,
    setDiscountPercent,
    setDiscountReason,
    setExtras,
    setFloors,
    setFrequency,
    setFrequencyUnit,
    setGlassArea,
    setHasLift,
    setHourlyRate,
    setHours,
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
    setTravel,
    setType,
    taxNote,
    vatRate,
    visitsPerMonth,
  } = input;
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
  return { exportLv, importProjectLv, loadCalculation };
}
