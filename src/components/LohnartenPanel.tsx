import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BadgeEuro, CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";
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
  time_from: string;
  time_to: string;
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
  time_from: "",
  time_to: "",
  active: true,
};

function toForm(row: WageType): FormState {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind,
    surcharge_percent: String(row.surcharge_percent ?? 0),
    time_from: row.time_from ? String(row.time_from).slice(0, 5) : "",
    time_to: row.time_to ? String(row.time_to).slice(0, 5) : "",
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
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");

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

  const { data: holidays = [] } = useQuery({
    queryKey: ["company-holidays"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_holidays")
        .select("*")
        .order("holiday_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const saveHoliday = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      if (!holidayDate || !holidayName.trim()) throw new Error("Datum und Bezeichnung eintragen.");
      const { error } = await supabase.from("company_holidays").upsert(
        {
          user_id: userId,
          holiday_date: holidayDate,
          name: holidayName.trim(),
          active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,holiday_date" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      setHolidayDate("");
      setHolidayName("");
      queryClient.invalidateQueries({ queryKey: ["company-holidays"] });
      toast.success("Feiertag gespeichert");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeHoliday = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("company_holidays").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-holidays"] }),
    onError: (error: Error) => toast.error(error.message),
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
        time_from: values.kind === "night" && values.time_from ? values.time_from : null,
        time_to: values.kind === "night" && values.time_to ? values.time_to : null,
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

      <div className="surface space-y-4 p-4">
        <div className="flex items-start gap-3">
          <CalendarDays className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="flex-1">
            <div className="font-medium">Feiertage für automatische Zuschläge</div>
            <p className="text-sm text-muted-foreground">
              Nur hier eingetragene Feiertage werden automatisch als Feiertagsarbeit erkannt.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[170px_1fr_auto]">
          <Input type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} />
          <Input
            value={holidayName}
            onChange={(e) => setHolidayName(e.target.value)}
            placeholder="z. B. Tag der Deutschen Einheit"
          />
          <Button onClick={() => saveHoliday.mutate()} disabled={saveHoliday.isPending}>
            <Plus className="size-4" /> Feiertag
          </Button>
        </div>
        {holidays.length > 0 && (
          <div className="divide-y rounded-md border">
            {holidays.map((holiday) => (
              <div key={holiday.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{holiday.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(`${holiday.holiday_date}T12:00:00`).toLocaleDateString("de-DE")}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Feiertag löschen"
                  onClick={() => removeHoliday.mutate(holiday.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

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
            {form.kind === "night" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="wage-time-from">Nachtzeit von</Label>
                  <Input
                    id="wage-time-from"
                    type="time"
                    value={form.time_from}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, time_from: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wage-time-to">Nachtzeit bis</Label>
                  <Input
                    id="wage-time-to"
                    type="time"
                    value={form.time_to}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, time_to: event.target.value }))
                    }
                  />
                </div>
              </>
            )}
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
