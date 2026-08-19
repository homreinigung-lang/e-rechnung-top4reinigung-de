import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_PERFORMANCE_RATES, type PerformanceRate } from "@/lib/leistungswerte";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Pflege der raumtypbezogenen Leistungswerte (m² pro Stunde).
 * Ohne eigene Einträge gelten die Standardwerte aus DEFAULT_PERFORMANCE_RATES.
 */
export function Leistungswerte() {
  const queryClient = useQueryClient();

  const { data: rates = [], isLoading } = useQuery({
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

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["performance_rates"] });
  };

  async function currentUserId() {
    const { data } = await supabase.auth.getUser();
    const id = data.user?.id;
    if (!id) throw new Error("Nicht angemeldet");
    return id;
  }

  const seed = useMutation({
    mutationFn: async () => {
      const userId = await currentUserId();
      const rows = DEFAULT_PERFORMANCE_RATES.map((r) => ({ ...r, user_id: userId }));
      const { error } = await supabase.from("performance_rates").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Standard-Leistungswerte eingefügt");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const add = useMutation({
    mutationFn: async () => {
      const userId = await currentUserId();
      const { error } = await supabase.from("performance_rates").insert({
        user_id: userId,
        label: "Neuer Leistungswert",
        usage_type: "",
        floor_covering: "",
        sqm_per_hour: 200,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<PerformanceRate> }) => {
      const { error } = await supabase.from("performance_rates").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("performance_rates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="surface space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Leistungswerte (m² pro Stunde)</h2>
          <p className="text-sm text-muted-foreground">
            Richtwerte je Nutzungstyp und Bodenbelag. Sie werden in der Kalkulation genutzt, um den
            Stundenbedarf aus den erfassten Räumen zu berechnen.
          </p>
        </div>
        <div className="flex gap-2">
          {rates.length === 0 && (
            <Button variant="outline" onClick={() => seed.mutate()} disabled={seed.isPending}>
              <RotateCcw className="mr-2 size-4" /> Standardwerte einfügen
            </Button>
          )}
          <Button onClick={() => add.mutate()} disabled={add.isPending}>
            <Plus className="mr-2 size-4" /> Wert hinzufügen
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Wird geladen…</p>
      ) : rates.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Noch keine eigenen Werte hinterlegt – es gelten die branchenüblichen Standardwerte (z. B.
          Büro/Teppich 250 m²/h, WC/Fliesen 60 m²/h). Über „Standardwerte einfügen“ können Sie diese
          übernehmen und anpassen.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="hidden gap-2 px-1 text-xs text-muted-foreground sm:grid sm:grid-cols-[1.4fr_1fr_1fr_120px_40px]">
            <span>Bezeichnung</span>
            <span>Nutzungstyp</span>
            <span>Bodenbelag</span>
            <span>m² / Stunde</span>
            <span />
          </div>
          {rates.map((r) => (
            <div
              key={r.id}
              className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1.4fr_1fr_1fr_120px_40px] sm:items-center sm:border-0 sm:p-1"
            >
              <div className="space-y-1">
                <Label className="sm:hidden">Bezeichnung</Label>
                <Input
                  defaultValue={r.label}
                  onBlur={(e) =>
                    e.target.value !== r.label &&
                    patch.mutate({ id: r.id, values: { label: e.target.value } })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="sm:hidden">Nutzungstyp</Label>
                <Input
                  defaultValue={r.usage_type}
                  placeholder="z. B. Büro"
                  onBlur={(e) =>
                    e.target.value !== r.usage_type &&
                    patch.mutate({ id: r.id, values: { usage_type: e.target.value } })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="sm:hidden">Bodenbelag</Label>
                <Input
                  defaultValue={r.floor_covering}
                  placeholder="z. B. Teppich"
                  onBlur={(e) =>
                    e.target.value !== r.floor_covering &&
                    patch.mutate({ id: r.id, values: { floor_covering: e.target.value } })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="sm:hidden">m² / Stunde</Label>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  defaultValue={r.sqm_per_hour}
                  onBlur={(e) => {
                    const value = Number(e.target.value) || 0;
                    if (value !== Number(r.sqm_per_hour)) {
                      patch.mutate({ id: r.id, values: { sqm_per_hour: value } });
                    }
                  }}
                />
              </div>
              <ConfirmDeleteButton
                ariaLabel="Leistungswert löschen"
                iconClassName="size-4"
                title="Leistungswert wirklich löschen?"
                description={`Der Leistungswert „${r.label || "ohne Bezeichnung"}" wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`}
                onConfirm={() => remove.mutate(r.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
