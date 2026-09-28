import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BadgeEuro, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type WageType = Tables<"wage_types">;

type FormState = {
  id?: string;
  code: string;
  name: string;
  kind: string;
  surcharge_percent: string;
  active: boolean;
};

const KIND_LABELS: Record<string, string> = {
  normal: "Normalstunden",
  overtime: "Überstunden",
  night: "Nachtarbeit",
  sunday: "Sonntagsarbeit",
  holiday: "Feiertagsarbeit",
  vacation: "Urlaub",
  sick: "Krankheit",
  other: "Sonstige",
};

const emptyForm: FormState = {
  code: "",
  name: "",
  kind: "other",
  surcharge_percent: "0",
  active: true,
};

function toForm(row: WageType): FormState {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind,
    surcharge_percent: String(row.surcharge_percent ?? 0),
    active: row.active,
  };
}

function num(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function LohnartenPanel() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const { data: wageTypes = [], isLoading } = useQuery({
    queryKey: ["wage-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wage_types")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async (values: FormState) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");

      const payload = {
        code: values.code.trim().toUpperCase().replace(/\s+/g, "_"),
        name: values.name.trim(),
        kind: values.kind,
        surcharge_percent: num(values.surcharge_percent),
        active: values.active,
        updated_at: new Date().toISOString(),
      };

      if (!payload.code || !payload.name) {
        throw new Error("Bitte Kürzel und Bezeichnung eintragen.");
      }

      if (values.id) {
        const { error } = await supabase.from("wage_types").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("wage_types").insert({ ...payload, user_id: userId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Lohnart gespeichert");
      setOpen(false);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["wage-types"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Lohnarten</h2>
          <p className="text-sm text-muted-foreground">
            Grundlage für die monatliche Lohnvorbereitung. Zuschläge werden hier nur als
            Firmenregel hinterlegt; die steuerliche Abrechnung bleibt bei DATEV/Steuerberater.
          </p>
        </div>
        <Button
          onClick={() => {
            setForm(emptyForm);
            setOpen(true);
          }}
        >
          <Plus className="size-4" /> Lohnart hinzufügen
        </Button>
      </div>

      {isLoading ? (
        <div className="surface px-5 py-10 text-center text-sm text-muted-foreground">
          Wird geladen…
        </div>
      ) : wageTypes.length === 0 ? (
        <div className="surface px-5 py-10 text-center text-sm text-muted-foreground">
          Noch keine Lohnarten angelegt.
        </div>
      ) : (
        <div className="surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Lohnart</th>
                <th className="px-4 py-3 font-medium">Typ</th>
                <th className="px-4 py-3 text-right font-medium">Zuschlag</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {wageTypes.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.name}</div>
                    <div className="text-xs text-muted-foreground">{row.code}</div>
                  </td>
                  <td className="px-4 py-3">{KIND_LABELS[row.kind] ?? row.kind}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    {Number(row.surcharge_percent).toLocaleString("de-DE", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}{" "}
                    %
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${row.active ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}
                    >
                      {row.active ? "Aktiv" : "Inaktiv"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setForm(toForm(row));
                        setOpen(true);
                      }}
                    >
                      <Pencil className="mr-2 size-4" /> Bearbeiten
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="surface p-4 text-sm text-muted-foreground">
        <div className="flex gap-3">
          <BadgeEuro className="mt-0.5 size-5 shrink-0" />
          <p>
            Die Standard-Lohnarten sind angelegt. Die Zuschlagsprozente bleiben zunächst bei 0 %,
            bis du deine vertraglichen bzw. tariflichen Regeln festlegst. So werden keine
            rechtlichen Werte geraten.
          </p>
        </div>
      </div>

      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) setForm(emptyForm);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Lohnart bearbeiten" : "Neue Lohnart"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="wage-code">Kürzel</Label>
              <Input
                id="wage-code"
                value={form.code}
                onChange={(event) =>
                  setForm((current) => ({ ...current, code: event.target.value }))
                }
                placeholder="z. B. SONNTAG"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wage-name">Bezeichnung</Label>
              <Input
                id="wage-name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="z. B. Sonntagsarbeit"
              />
            </div>
            <div className="space-y-2">
              <Label>Typ</Label>
              <Select
                value={form.kind}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, kind: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(KIND_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wage-surcharge">Zuschlag in %</Label>
              <Input
                id="wage-surcharge"
                inputMode="decimal"
                value={form.surcharge_percent}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    surcharge_percent: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.active}
              onCheckedChange={(checked) =>
                setForm((current) => ({ ...current, active: checked === true }))
              }
            />
            Aktiv
          </label>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
