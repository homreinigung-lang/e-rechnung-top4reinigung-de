import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Check, Pencil, Plus, Trash2, Users } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/zeiterfassung")({
  head: () => ({
    meta: [
      { title: "Mitarbeiter-Zeiterfassung – Hom R Office" },
      {
        name: "description",
        content:
          "Arbeitszeiten und Stunden der Mitarbeiter erfassen, auswerten und als Grundlage für Rechnungen verwalten.",
      },
      { property: "og:title", content: "Mitarbeiter-Zeiterfassung" },
      {
        property: "og:description",
        content: "Arbeitsstunden pro Mitarbeiter, Kunde und Einsatzort übersichtlich erfassen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Zeiterfassung,
});

type Employee = {
  id: string;
  name: string;
  role: string;
  hourly_rate: number;
  active: boolean;
};

type EntryForm = {
  id?: string;
  employee_id: string;
  employee_name: string;
  customer_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  break_minutes: string;
  hours: string;
  hourly_rate: string;
  location: string;
  note: string;
};

const emptyEntry = (): EntryForm => ({
  employee_id: "",
  employee_name: "",
  customer_id: "",
  work_date: new Date().toISOString().slice(0, 10),
  start_time: "08:00",
  end_time: "16:00",
  break_minutes: "30",
  hours: "",
  hourly_rate: "",
  location: "",
  note: "",
});

const emptyEmployee = { id: undefined as string | undefined, name: "", role: "", hourly_rate: "" };

function num(v: string) {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function computeHours(start: string, end: string, breakMinutes: string) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((x) => Number.isNaN(x))) return 0;
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60;
  minutes -= num(breakMinutes);
  return Math.max(0, Math.round((minutes / 60) * 100) / 100);
}

function monthKey(d: string) {
  return d.slice(0, 7);
}

function Zeiterfassung() {
  const queryClient = useQueryClient();
  const [entryOpen, setEntryOpen] = useState(false);
  const [empOpen, setEmpOpen] = useState(false);
  const [form, setForm] = useState<EntryForm>(emptyEntry());
  const [emp, setEmp] = useState(emptyEmployee);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*").order("name");
      if (error) throw error;
      return data as Employee[];
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id,name,company").order("name");
      if (error) throw error;
      return data as { id: string; name: string; company: string }[];
    },
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["time_entries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("*")
        .order("work_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const monthEntries = useMemo(
    () => entries.filter((e) => monthKey(e.work_date as string) === month),
    [entries, month],
  );

  const totals = useMemo(() => {
    const hours = monthEntries.reduce((s, e) => s + Number(e.hours || 0), 0);
    const amount = monthEntries.reduce(
      (s, e) => s + Number(e.hours || 0) * Number(e.hourly_rate || 0),
      0,
    );
    const perEmployee = new Map<string, { hours: number; amount: number }>();
    for (const e of monthEntries) {
      const key = (e.employee_name as string) || "Ohne Zuordnung";
      const prev = perEmployee.get(key) ?? { hours: 0, amount: 0 };
      perEmployee.set(key, {
        hours: prev.hours + Number(e.hours || 0),
        amount: prev.amount + Number(e.hours || 0) * Number(e.hourly_rate || 0),
      });
    }
    return { hours, amount, perEmployee: [...perEmployee.entries()] };
  }, [monthEntries]);

  const saveEmployee = useMutation({
    mutationFn: async (values: typeof emptyEmployee) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const payload = {
        name: values.name.trim(),
        role: values.role,
        hourly_rate: num(values.hourly_rate),
      };
      if (values.id) {
        const { error } = await supabase.from("employees").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("employees").insert({ ...payload, user_id: userId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Mitarbeiter gespeichert");
      setEmpOpen(false);
      setEmp(emptyEmployee);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeEmployee = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mitarbeiter gelöscht");
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveEntry = useMutation({
    mutationFn: async (values: EntryForm) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const hours = values.hours
        ? num(values.hours)
        : computeHours(values.start_time, values.end_time, values.break_minutes);
      if (hours <= 0) throw new Error("Bitte gültige Zeiten oder Stunden eingeben.");
      const payload = {
        employee_id: values.employee_id || null,
        employee_name:
          employees.find((e) => e.id === values.employee_id)?.name || values.employee_name,
        customer_id: values.customer_id || null,
        work_date: values.work_date,
        start_time: values.start_time || null,
        end_time: values.end_time || null,
        break_minutes: Math.round(num(values.break_minutes)),
        hours,
        hourly_rate: num(values.hourly_rate),
        location: values.location,
        note: values.note,
      };
      if (values.id) {
        const { error } = await supabase.from("time_entries").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("time_entries")
          .insert({ ...payload, user_id: userId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Zeiteintrag gespeichert");
      setEntryOpen(false);
      setForm(emptyEntry());
      queryClient.invalidateQueries({ queryKey: ["time_entries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("time_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Zeiteintrag gelöscht");
      queryClient.invalidateQueries({ queryKey: ["time_entries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleBilled = useMutation({
    mutationFn: async ({ id, billed }: { id: string; billed: boolean }) => {
      const { error } = await supabase.from("time_entries").update({ billed }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["time_entries"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const previewHours = form.hours
    ? num(form.hours)
    : computeHours(form.start_time, form.end_time, form.break_minutes);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Mitarbeiter-Zeiterfassung</h1>
          <p className="mt-1 text-muted-foreground">
            Arbeitszeiten, Pausen und Stunden je Mitarbeiter, Kunde und Einsatzort verwalten.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog
            open={empOpen}
            onOpenChange={(o) => {
              setEmpOpen(o);
              if (!o) setEmp(emptyEmployee);
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline">
                <Users className="size-4" /> Mitarbeiter
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Mitarbeiter verwalten</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="emp-name">Name</Label>
                  <Input
                    id="emp-name"
                    value={emp.name}
                    onChange={(e) => setEmp({ ...emp, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emp-role">Funktion</Label>
                  <Input
                    id="emp-role"
                    value={emp.role}
                    onChange={(e) => setEmp({ ...emp, role: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emp-rate">Stundensatz (EUR)</Label>
                  <Input
                    id="emp-rate"
                    inputMode="decimal"
                    value={emp.hourly_rate}
                    onChange={(e) => setEmp({ ...emp, hourly_rate: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => saveEmployee.mutate(emp)}
                  disabled={!emp.name.trim() || saveEmployee.isPending}
                >
                  Speichern
                </Button>
              </DialogFooter>

              <ul className="divide-y border-t">
                {employees.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{e.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[e.role, `${formatCurrency(Number(e.hourly_rate))}/Std.`]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setEmp({
                          id: e.id,
                          name: e.name,
                          role: e.role,
                          hourly_rate: String(e.hourly_rate ?? ""),
                        })
                      }
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeEmployee.mutate(e.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
                {employees.length === 0 && (
                  <li className="py-3 text-sm text-muted-foreground">
                    Noch keine Mitarbeiter angelegt.
                  </li>
                )}
              </ul>
            </DialogContent>
          </Dialog>

          <Dialog
            open={entryOpen}
            onOpenChange={(o) => {
              setEntryOpen(o);
              if (!o) setForm(emptyEntry());
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" /> Zeit erfassen
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {form.id ? "Zeiteintrag bearbeiten" : "Neuer Zeiteintrag"}
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Mitarbeiter</Label>
                  <Select
                    value={form.employee_id}
                    onValueChange={(v) => {
                      const e = employees.find((x) => x.id === v);
                      setForm({
                        ...form,
                        employee_id: v,
                        employee_name: e?.name ?? "",
                        hourly_rate: form.hourly_rate || String(e?.hourly_rate ?? ""),
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Mitarbeiter wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Kunde / Objekt</Label>
                  <Select
                    value={form.customer_id}
                    onValueChange={(v) => setForm({ ...form, customer_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.company || c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="work_date">Datum</Label>
                  <Input
                    id="work_date"
                    type="date"
                    value={form.work_date}
                    onChange={(e) => setForm({ ...form, work_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Einsatzort</Label>
                  <Input
                    id="location"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="start_time">Von</Label>
                  <Input
                    id="start_time"
                    type="time"
                    value={form.start_time}
                    onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_time">Bis</Label>
                  <Input
                    id="end_time"
                    type="time"
                    value={form.end_time}
                    onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="break_minutes">Pause (Minuten)</Label>
                  <Input
                    id="break_minutes"
                    inputMode="numeric"
                    value={form.break_minutes}
                    onChange={(e) => setForm({ ...form, break_minutes: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hours">Stunden (optional, überschreibt Berechnung)</Label>
                  <Input
                    id="hours"
                    inputMode="decimal"
                    placeholder={String(previewHours)}
                    value={form.hours}
                    onChange={(e) => setForm({ ...form, hours: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hourly_rate">Stundensatz (EUR)</Label>
                  <Input
                    id="hourly_rate"
                    inputMode="decimal"
                    value={form.hourly_rate}
                    onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="note">Notiz</Label>
                  <Textarea
                    id="note"
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Berechnete Arbeitszeit: <strong>{previewHours} Std.</strong>
              </p>
              <DialogFooter>
                <Button onClick={() => saveEntry.mutate(form)} disabled={saveEntry.isPending}>
                  Speichern
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface p-5">
          <div className="text-sm text-muted-foreground">Monat</div>
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="mt-2"
          />
        </div>
        <div className="surface p-5">
          <div className="text-sm text-muted-foreground">Stunden gesamt</div>
          <div className="mt-2 text-2xl font-bold">{totals.hours.toFixed(2)} Std.</div>
        </div>
        <div className="surface p-5">
          <div className="text-sm text-muted-foreground">Lohnwert (Stunden × Satz)</div>
          <div className="mt-2 text-2xl font-bold">{formatCurrency(totals.amount)}</div>
        </div>
      </div>

      {totals.perEmployee.length > 0 && (
        <div className="surface p-5">
          <h2 className="text-lg font-semibold">Summen je Mitarbeiter</h2>
          <ul className="mt-3 divide-y">
            {totals.perEmployee.map(([name, v]) => (
              <li key={name} className="flex items-center justify-between py-2 text-sm">
                <span>{name}</span>
                <span className="text-muted-foreground">
                  {v.hours.toFixed(2)} Std. · {formatCurrency(v.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="surface overflow-hidden">
        {monthEntries.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            Für diesen Monat sind noch keine Arbeitszeiten erfasst.
          </p>
        ) : (
          <ul className="divide-y">
            {monthEntries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {(e.employee_name as string) || "Ohne Zuordnung"} ·{" "}
                    {formatDate(e.work_date as string)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {[
                      e.start_time && e.end_time
                        ? `${String(e.start_time).slice(0, 5)}–${String(e.end_time).slice(0, 5)}`
                        : null,
                      `Pause ${e.break_minutes} Min.`,
                      `${Number(e.hours).toFixed(2)} Std.`,
                      e.location || null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  {e.note && <div className="text-xs text-muted-foreground">{e.note}</div>}
                </div>
                <div className="text-right text-sm">
                  {formatCurrency(Number(e.hours) * Number(e.hourly_rate || 0))}
                </div>
                <Button
                  variant={e.billed ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => toggleBilled.mutate({ id: e.id as string, billed: !e.billed })}
                >
                  <Check className="size-4" />
                  {e.billed ? "Abgerechnet" : "Offen"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setForm({
                      id: e.id as string,
                      employee_id: (e.employee_id as string) ?? "",
                      employee_name: (e.employee_name as string) ?? "",
                      customer_id: (e.customer_id as string) ?? "",
                      work_date: e.work_date as string,
                      start_time: e.start_time ? String(e.start_time).slice(0, 5) : "",
                      end_time: e.end_time ? String(e.end_time).slice(0, 5) : "",
                      break_minutes: String(e.break_minutes ?? 0),
                      hours: String(e.hours ?? ""),
                      hourly_rate: String(e.hourly_rate ?? ""),
                      location: (e.location as string) ?? "",
                      note: (e.note as string) ?? "",
                    }) || setEntryOpen(true)
                  }
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeEntry.mutate(e.id as string)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
