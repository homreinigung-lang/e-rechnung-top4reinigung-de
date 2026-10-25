import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
        </div>
      )}
    </div>
  );
}
