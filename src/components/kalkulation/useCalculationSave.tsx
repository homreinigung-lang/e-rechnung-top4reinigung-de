import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

import { num, KALK_SECTION } from "./shared";

import type { useKalkulationForm } from "./useKalkulationForm";
import type { useCalculationTotals } from "./useCalculationTotals";
import type { useKalkulationSuggestions } from "./useKalkulationSuggestions";

export function useCalculationSave(input: {
  area: ReturnType<typeof useKalkulationForm>["area"];
  calcId: ReturnType<typeof useKalkulationForm>["calcId"];
  calcTitle: ReturnType<typeof useKalkulationForm>["calcTitle"];
  discountFixed: ReturnType<typeof useCalculationTotals>["discountFixed"];
  discountReason: ReturnType<typeof useKalkulationForm>["discountReason"];
  extras: ReturnType<typeof useKalkulationForm>["extras"];
  floors: ReturnType<typeof useKalkulationForm>["floors"];
  frequency: ReturnType<typeof useKalkulationForm>["frequency"];
  frequencyUnit: ReturnType<typeof useKalkulationForm>["frequencyUnit"];
  glassArea: ReturnType<typeof useKalkulationForm>["glassArea"];
  hasLift: ReturnType<typeof useKalkulationForm>["hasLift"];
  hourlyRate: ReturnType<typeof useKalkulationForm>["hourlyRate"];
  hours: ReturnType<typeof useKalkulationForm>["hours"];
  liftRate: ReturnType<typeof useKalkulationForm>["liftRate"];
  lvPositions: ReturnType<typeof useCalculationTotals>["lvPositions"];
  lvTotal: ReturnType<typeof useCalculationTotals>["lvTotal"];
  mode: ReturnType<typeof useKalkulationForm>["mode"];
  note: ReturnType<typeof useKalkulationForm>["note"];
  pct: ReturnType<typeof useKalkulationSuggestions>["pct"];
  pricePerSqm: ReturnType<typeof useKalkulationForm>["pricePerSqm"];
  projectId: ReturnType<typeof useKalkulationForm>["projectId"];
  proposalText: ReturnType<typeof useKalkulationForm>["proposalText"];
  proposalTitle: ReturnType<typeof useKalkulationForm>["proposalTitle"];
  queryClient: ReturnType<typeof useKalkulationForm>["queryClient"];
  selected: ReturnType<typeof useKalkulationForm>["selected"];
  setCalcId: ReturnType<typeof useKalkulationForm>["setCalcId"];
  setLvItems: ReturnType<typeof useKalkulationForm>["setLvItems"];
  stairFrequency: ReturnType<typeof useKalkulationForm>["stairFrequency"];
  stairRate: ReturnType<typeof useKalkulationForm>["stairRate"];
  stairs: ReturnType<typeof useKalkulationForm>["stairs"];
  taxMode: ReturnType<typeof useKalkulationForm>["taxMode"];
  travel: ReturnType<typeof useKalkulationForm>["travel"];
  type: ReturnType<typeof useKalkulationForm>["type"];
}) {
  const {
    area,
    calcId,
    calcTitle,
    discountFixed,
    discountReason,
    extras,
    floors,
    frequency,
    frequencyUnit,
    glassArea,
    hasLift,
    hourlyRate,
    hours,
    liftRate,
    lvPositions,
    lvTotal,
    mode,
    note,
    pct,
    pricePerSqm,
    projectId,
    proposalText,
    proposalTitle,
    queryClient,
    selected,
    setCalcId,
    setLvItems,
    stairFrequency,
    stairRate,
    stairs,
    taxMode,
    travel,
    type,
  } = input;
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
  return { saveCalculation };
}
