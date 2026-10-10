import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { createDocument } from "@/lib/create-document";
import { formatMoney, formatNumber } from "@/lib/format";
import { recurrenceUnitLabel } from "@/lib/constants";

import { computeDocumentTotals } from "@/lib/document-totals";
import { round2 } from "@/lib/kalkulation-engine";

import { num } from "./shared";

import type { useKalkulationSuggestions } from "./useKalkulationSuggestions";
import type { useKalkulationForm } from "./useKalkulationForm";
import type { useCalculationTotals } from "./useCalculationTotals";

export function useCalculationQuote(input: {
  annualVisits: ReturnType<typeof useKalkulationSuggestions>["annualVisits"];
  discountReason: ReturnType<typeof useKalkulationForm>["discountReason"];
  floorplanSummary: ReturnType<typeof useKalkulationForm>["floorplanSummary"];
  frequency: ReturnType<typeof useKalkulationForm>["frequency"];
  frequencyUnit: ReturnType<typeof useKalkulationForm>["frequencyUnit"];
  lvPositions: ReturnType<typeof useCalculationTotals>["lvPositions"];
  monthlyHours: ReturnType<typeof useCalculationTotals>["monthlyHours"];
  navigate: ReturnType<typeof useKalkulationForm>["navigate"];
  note: ReturnType<typeof useKalkulationForm>["note"];
  pct: ReturnType<typeof useKalkulationSuggestions>["pct"];
  proposalText: ReturnType<typeof useKalkulationForm>["proposalText"];
  proposalTitle: ReturnType<typeof useKalkulationForm>["proposalTitle"];
  selected: ReturnType<typeof useKalkulationForm>["selected"];
  taxMode: ReturnType<typeof useKalkulationForm>["taxMode"];
  vatRate: ReturnType<typeof useCalculationTotals>["vatRate"];
  visitsPerMonth: ReturnType<typeof useKalkulationSuggestions>["visitsPerMonth"];
  warnings: ReturnType<typeof useCalculationTotals>["warnings"];
}) {
  const {
    annualVisits,
    discountReason,
    floorplanSummary,
    frequency,
    frequencyUnit,
    lvPositions,
    monthlyHours,
    navigate,
    note,
    pct,
    proposalText,
    proposalTitle,
    selected,
    taxMode,
    vatRate,
    visitsPerMonth,
    warnings,
  } = input;
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
  return { toQuote };
}
