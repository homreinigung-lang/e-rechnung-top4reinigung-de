import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { supabase } from "@/integrations/supabase/client";
import type { PerformanceRate } from "@/lib/leistungswerte";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SERVICES = [
  { key: "Unterhaltsreinigung", label: "Unterhaltsreinigung" },
  { key: "Grundreinigung", label: "Grundreinigung" },
  { key: "Glasreinigung", label: "Glasreinigung" },
  { key: "Treppenhaus", label: "Treppenhausreinigung" },
] as const;

/** Vier zentrale Leistungswerte bearbeiten; Raum- und Bodenwerte bleiben in der DB erhalten. */
export function Leistungswerte({ embedded = false }: { embedded?: boolean } = {}) {
  const queryClient = useQueryClient();
  const [newLabel, setNewLabel] = useState("");
  const { data: rates = [], isLoading, isError } = useQuery({
    queryKey: ["performance_rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("performance_rates")
        .select("id,label,usage_type,floor_covering,sqm_per_hour,minutes_per_floor,active")
        .order("label");
      if (error) throw error;
      return (data ?? []) as PerformanceRate[];
    },
  });
  const patch = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<PerformanceRate> }) => {
      const { error } = await supabase.from("performance_rates").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["performance_rates"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const add = useMutation({
    mutationFn: async (label: string) => {
      const { data } = await supabase.auth.getUser();
      if (!data.user?.id) throw new Error("Bitte anmelden.");
      const { error } = await supabase.from("performance_rates").insert({
        user_id: data.user.id, label, usage_type: label, floor_covering: "", sqm_per_hour: 100,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewLabel("");
      void queryClient.invalidateQueries({ queryKey: ["performance_rates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("performance_rates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["performance_rates"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const customRates = rates.filter(r => !SERVICES.some(s => s.key.toLowerCase() === r.label.trim().toLowerCase()));

  return (
    <div className={embedded ? "space-y-4 border-t pt-5" : "surface space-y-4 p-6"}>
      <div>
        <h2 className="font-display text-lg font-semibold">Leistungswerte</h2>
        <p className="text-sm text-muted-foreground">Vier Reinigungsarten – gespeicherte Werte werden für neue Kalkulationen verwendet.</p>
      </div>
      {isLoading ? <p>Wird geladen…</p> : isError ? (
        <p className="text-sm text-destructive">Leistungswerte konnten nicht geladen werden.</p>
      ) : (
        <div className="space-y-3">
          {SERVICES.map(service => {
            const rate = rates.find(r => r.label.trim().toLowerCase() === service.key.toLowerCase());
            return (
              <div key={service.key} className="grid gap-3 rounded-md border p-3 sm:grid-cols-3 sm:items-end">
                <div className="font-medium">{service.label}</div>
                {rate ? (
                  <>
                    <div className="space-y-1">
                      <Label>Leistung (m²/Std.)</Label>
                      <Input key={rate.id + "-sqm"} type="number" min={0.01} step="any" defaultValue={rate.sqm_per_hour}
                        onBlur={e => {
                          const value = Number(e.target.value);
                          if (!Number.isFinite(value) || value <= 0) {
                            toast.error("Leistung muss größer als 0 sein.");
                            e.target.value = String(rate.sqm_per_hour);
                          } else if (value !== Number(rate.sqm_per_hour)) {
                            patch.mutate({ id: rate.id, values: { sqm_per_hour: value } });
                          }
                        }} />
                    </div>
                    {service.key === "Treppenhaus" && (
                      <div className="space-y-1">
                        <Label>Minuten pro Etage</Label>
                        <Input key={rate.id + "-floor"} type="number" min={0.1} step="any" placeholder="Optional"
                          defaultValue={rate.minutes_per_floor ?? ""}
                          onBlur={e => {
                            const raw = e.target.value.trim();
                            const value = raw ? Number(raw) : null;
                            if (value !== null && (!Number.isFinite(value) || value <= 0)) {
                              toast.error("Minuten pro Etage müssen größer als 0 sein.");
                              e.target.value = String(rate.minutes_per_floor ?? "");
                            } else if (value !== (rate.minutes_per_floor ?? null)) {
                              patch.mutate({ id: rate.id, values: { minutes_per_floor: value } });
                            }
                          }} />
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-destructive sm:col-span-2">Kein gespeicherter Wert für {service.label} vorhanden.</p>
                )}
              </div>
            );
          })}
          {customRates.map(rate => (
            <div key={rate.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-3 sm:items-center">
              <span className="font-medium">{rate.label}</span>
              <div className="space-y-1">
                <Label>Leistung (m²/Std.)</Label>
                <Input type="number" min={0.01} step="any" defaultValue={rate.sqm_per_hour}
                  onBlur={e => {
                    const value = Number(e.target.value);
                    if (!Number.isFinite(value) || value <= 0) {
                      toast.error("Leistung muss größer als 0 sein.");
                      e.target.value = String(rate.sqm_per_hour);
                    } else if (value !== Number(rate.sqm_per_hour)) {
                      patch.mutate({ id: rate.id, values: { sqm_per_hour: value } });
                    }
                  }} />
              </div>
              <ConfirmDeleteButton ariaLabel="Leistungswert löschen" title="Zusätzlichen Leistungswert löschen?"
                description={`Der Leistungswert „${rate.label}“ wird gelöscht.`}
                onConfirm={() => remove.mutate(rate.id)} />
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-2 border-t pt-3">
            <div className="flex-1 space-y-1">
              <Label>Weitere Reinigungsart</Label>
              <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Bei Bedarf hinzufügen" />
            </div>
            <Button type="button" variant="outline" disabled={!newLabel.trim() || add.isPending} onClick={() => {
              const label = newLabel.trim();
              if (rates.some(r => r.label.trim().toLowerCase() === label.toLowerCase())) {
                toast.error("Bereits vorhanden.");
                return;
              }
              add.mutate(label);
            }}>Wert hinzufügen</Button>
          </div>
        </div>
      )}
    </div>
  );
}
