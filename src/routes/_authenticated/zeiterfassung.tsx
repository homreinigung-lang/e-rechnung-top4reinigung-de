import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/employee";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GermanDateInput, GermanTimeInput } from "@/components/GermanDateTimeInput";
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
import { Check, Download, FileText, Pencil, Plus, Trash2, Users } from "lucide-react";
import { formatMoney, formatDate } from "@/lib/format";
import { AbwesenheitZeitraum } from "@/components/AbwesenheitZeitraum";
import { Urlaubsantraege } from "@/components/Urlaubsantraege";
import { ZeitkontoCard } from "@/components/ZeitkontoCard";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function de(n: number) {
  return n.toFixed(2).replace(".", ",");
}

export const Route = createFileRoute("/_authenticated/zeiterfassung")({
  head: () => ({
    meta: [
      { title: "Mitarbeiter-Zeiterfassung – HomR" },
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
  email: string;
  phone: string;
  personnel_number: string;
  auth_user_id: string | null;
  contract_type?: string | null;
  contract_start?: string | null;
  weekly_hours?: number | null;
};

type EntryForm = {
  id?: string;
  employee_id: string;
  employee_name: string;
  customer_id: string;
  project_id: string;
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
  project_id: "",
  work_date: new Date().toISOString().slice(0, 10),
  start_time: "08:00",
  end_time: "16:00",
  break_minutes: "30",
  hours: "",
  hourly_rate: "",
  location: "",
  note: "",
});

const CONTRACT_TYPES = ["Vollzeit", "Teilzeit", "Minijob", "Aushilfe", "Werkstudent", "Praktikum"];

const emptyEmployee = {
  id: undefined as string | undefined,
  name: "",
  role: "",
  email: "",
  phone: "",
  personnel_number: "",
  hourly_rate: "",
  contract_type: "",
  contract_start: "",
  weekly_hours: "",
};

function num(v: string) {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function computeHours(start: string, end: string, breakMinutes: string) {
  if (!start || !end) return 0;
  const [sh = NaN, sm = NaN] = start.split(":").map(Number);
  const [eh = NaN, em = NaN] = end.split(":").map(Number);
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
  const navigate = useNavigate();
  const { data: myEmployee } = useMyEmployee();
  const [entryOpen, setEntryOpen] = useState(false);
  const [empOpen, setEmpOpen] = useState(false);
  const [form, setForm] = useState<EntryForm>(emptyEntry());
  const [emp, setEmp] = useState(emptyEmployee);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  // Mitarbeiterkonten haben keinen Zugriff auf die Verwaltungsansicht.
  useEffect(() => {
    if (myEmployee) navigate({ to: "/meine-zeiten", replace: true });
  }, [myEmployee, navigate]);

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
      const { data, error } = await supabase
        .from("customers")
        .select("id,name,company")
        .order("name");
      if (error) throw error;
      return data as { id: string; name: string; company: string }[];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id,name").order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
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
    () =>
      entries
        .filter((e) => monthKey(e.work_date as string) === month)
        .sort((a, b) => String(a.work_date).localeCompare(String(b.work_date))),
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
        email: values.email.trim().toLowerCase(),
        phone: values.phone.trim(),
        personnel_number: values.personnel_number.trim(),
        hourly_rate: num(values.hourly_rate),
        contract_type: values.contract_type,
        contract_start: values.contract_start || null,
        weekly_hours: num(values.weekly_hours),
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
        project_id: values.project_id || null,
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

  const exportCsv = () => {
    if (monthEntries.length === 0) {
      toast.error("Keine Einträge in diesem Monat.");
      return;
    }
    const head = [
      "Mitarbeiter",
      "Datum",
      "Von",
      "Bis",
      "Pause (Min.)",
      "Stunden",
      "Stundensatz",
      "Betrag",
      "Einsatzort",
      "Notiz",
      "Abgerechnet",
    ];
    const rows = monthEntries.map((e) => [
      (e.employee_name as string) || "Ohne Zuordnung",
      formatDate(e.work_date as string),
      e.start_time ? String(e.start_time).slice(0, 5) : "",
      e.end_time ? String(e.end_time).slice(0, 5) : "",
      String(e.break_minutes ?? 0),
      de(Number(e.hours || 0)),
      de(Number(e.hourly_rate || 0)),
      de(Number(e.hours || 0) * Number(e.hourly_rate || 0)),
      (e.location as string) || "",
      (e.note as string) || "",
      e.billed ? "Ja" : "Nein",
    ]);
    const summary = totals.perEmployee.map(([name, v]) => [
      name,
      "SUMME",
      "",
      "",
      "",
      de(v.hours),
      "",
      de(v.amount),
      "",
      "",
      "",
    ]);
    const csv = [head, ...rows, [], ...summary]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    downloadBlob(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
      `Stundenzettel_${month}.csv`,
    );
    toast.success("CSV-Export erstellt");
  };

  const exportPdf = async () => {
    if (monthEntries.length === 0) {
      toast.error("Keine Einträge in diesem Monat.");
      return;
    }
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const [y0, m0] = month.split("-");
    let y = 18;
    doc.setFontSize(15);
    doc.text(`Stundenzettel ${m0}/${y0}`, 15, y);
    y += 7;
    doc.setFontSize(9);
    doc.text("Hom Reinigung Service · Stundenübersicht je Mitarbeiter", 15, y);
    y += 10;

    doc.setFontSize(10);
    doc.text("Mitarbeiter", 15, y);
    doc.text("Stunden", 120, y, { align: "right" });
    doc.text("Vergütung", 195, y, { align: "right" });
    y += 2;
    doc.line(15, y, 195, y);
    y += 6;
    doc.setFontSize(9);
    for (const [name, v] of totals.perEmployee) {
      doc.text(String(name).slice(0, 45), 15, y);
      doc.text(`${de(v.hours)} Std.`, 120, y, { align: "right" });
      doc.text(formatMoney(v.amount), 195, y, { align: "right" });
      y += 6;
      if (y > 275) {
        doc.addPage();
        y = 20;
      }
    }
    y += 1;
    doc.line(15, y, 195, y);
    y += 6;
    doc.setFontSize(10);
    doc.text("Gesamt", 15, y);
    doc.text(`${de(totals.hours)} Std.`, 120, y, { align: "right" });
    doc.text(formatMoney(totals.amount), 195, y, { align: "right" });

    y += 12;
    doc.setFontSize(11);
    doc.text("Einzelnachweis", 15, y);
    y += 6;
    doc.setFontSize(8);
    for (const e of monthEntries) {
      if (y > 282) {
        doc.addPage();
        y = 20;
      }
      const time =
        e.start_time && e.end_time
          ? `${String(e.start_time).slice(0, 5)}–${String(e.end_time).slice(0, 5)}`
          : "-";
      doc.text(
        `${formatDate(e.work_date as string)}  ${((e.employee_name as string) || "Ohne Zuordnung").slice(0, 28)}  ${time}  Pause ${e.break_minutes} Min.`,
        15,
        y,
      );
      doc.text(`${de(Number(e.hours || 0))} Std.`, 150, y, { align: "right" });
      doc.text(formatMoney(Number(e.hours || 0) * Number(e.hourly_rate || 0)), 195, y, {
        align: "right",
      });
      y += 5;
    }
    // Die PDF bleibt vollständig im Browser: kein Plattform- oder externer Link.
    const filename = `Stundenzettel_${month}.pdf`;
    const blob = doc.output("blob") as Blob;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Die URL muss für die Toast-Aktion verfügbar bleiben.
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
    toast.success("Stundenzettel-PDF wird heruntergeladen", {
      action: {
        label: "Öffnen",
        onClick: () => {
          window.location.assign(url);
        },
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="surface space-y-2 p-4">
        <h2 className="font-semibold">So melden sich Mitarbeiter an</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Hier unter „Mitarbeiter“ den Mitarbeiter mit seiner E-Mail-Adresse anlegen.</li>
          <li>
            Mitarbeiter öffnet die Anmeldeseite, wählt „Registrieren“ und legt mit genau dieser
            E-Mail ein Passwort an (Bestätigungs-Link in der E-Mail anklicken).
          </li>
          <li>
            Nach dem Login erscheint der Bereich „Meine Zeiten“ – dort erfasst er nur seine eigenen
            Arbeitszeiten.
          </li>
        </ol>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" asChild>
            <a href="/auth" target="_blank" rel="noopener">
              Anmeldeseite öffnen
            </a>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(`${window.location.origin}/auth`);
              toast.success("Registrierungs-Link kopiert");
            }}
          >
            Registrierungs-Link kopieren
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Mitarbeiter-Zeiterfassung</h1>
          <p className="mt-1 text-muted-foreground">
            Arbeitszeiten, Pausen und Stunden je Mitarbeiter, Kunde und Einsatzort verwalten.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="size-4" /> Stundenzettel-CSV
          </Button>
          <Button variant="outline" onClick={exportPdf}>
            <FileText className="size-4" /> Stundenzettel-PDF
          </Button>

          <AbwesenheitZeitraum employees={employees.map((e) => ({ id: e.id, name: e.name }))} />

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
              <Urlaubsantraege />

      <ZeitkontoCard
        employees={employees.map((e) => ({
          id: e.id,
          name: e.name,
          weekly_hours: (e as unknown as { weekly_hours?: number }).weekly_hours ?? 0,
        }))}
        entries={entries as never}
        month={month}
      />

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
                <div className="space-y-2">
                  <Label htmlFor="emp-persno">Personalnummer</Label>
                  <Input
                    id="emp-persno"
                    dir="ltr"
                    value={emp.personnel_number}
                    onChange={(e) => setEmp({ ...emp, personnel_number: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emp-phone">Telefonnummer</Label>
                  <Input
                    id="emp-phone"
                    type="tel"
                    dir="ltr"
                    value={emp.phone}
                    onChange={(e) => setEmp({ ...emp, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="emp-email">E-Mail (Login für Mitarbeiter)</Label>
                  <Input
                    id="emp-email"
                    type="email"
                    dir="ltr"
                    value={emp.email}
                    onChange={(e) => setEmp({ ...emp, email: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Mit dieser E-Mail kann sich der Mitarbeiter selbst registrieren und danach unter
                    „Meine Zeiten“ nur die eigenen Arbeitszeiten erfassen.
                  </p>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <div className="border-t pt-3 text-sm font-medium">Vertragsdaten</div>
                </div>
                <div className="space-y-2">
                  <Label>Vertragsart</Label>
                  <Select
                    value={emp.contract_type}
                    onValueChange={(v) => setEmp({ ...emp, contract_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Vertragsart wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTRACT_TYPES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emp-start">Vertragsbeginn</Label>
                  <GermanDateInput
                    id="emp-start"
                    value={emp.contract_start}
                    onChange={(iso) => setEmp({ ...emp, contract_start: iso })}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="emp-weekly">Wöchentliche Soll-Arbeitsstunden</Label>
                  <Input
                    id="emp-weekly"
                    inputMode="decimal"
                    value={emp.weekly_hours}
                    onChange={(e) => setEmp({ ...emp, weekly_hours: e.target.value })}
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
                        {[
                          e.personnel_number ? `Nr. ${e.personnel_number}` : null,
                          e.role,
                          `${formatMoney(Number(e.hourly_rate))}/Std.`,
                          e.phone || null,
                          e.email || null,
                          e.auth_user_id ? "Login aktiv" : "Kein Login",
                        ]
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
                          email: e.email ?? "",
                          phone: e.phone ?? "",
                          personnel_number: e.personnel_number ?? "",
                          hourly_rate: String(e.hourly_rate ?? ""),
                          contract_type: e.contract_type ?? "",
                          contract_start: e.contract_start ?? "",
                          weekly_hours: e.weekly_hours ? String(e.weekly_hours) : "",
                        })
                      }
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => removeEmployee.mutate(e.id)}>
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
                  <Label>Projekt / Baustelle</Label>
                  <Select
                    value={form.project_id}
                    onValueChange={(v) => setForm({ ...form, project_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name || "Ohne Namen"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="work_date">Datum</Label>
                  <GermanDateInput
                    id="work_date"
                    value={form.work_date}
                    onChange={(iso) => setForm({ ...form, work_date: iso })}
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
                  <GermanTimeInput
                    id="start_time"
                    value={form.start_time}
                    onChange={(t) => setForm({ ...form, start_time: t })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_time">Bis</Label>
                  <GermanTimeInput
                    id="end_time"
                    value={form.end_time}
                    onChange={(t) => setForm({ ...form, end_time: t })}
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
          <div className="mt-2 text-2xl font-bold">{formatMoney(totals.amount)}</div>
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
                  {v.hours.toFixed(2)} Std. · {formatMoney(v.amount)}
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
                  <ArbeitsnachweisFotos
                    entryId={e.id as string}
                    paths={((e as { photo_paths?: string[] }).photo_paths ?? []) as string[]}
                    invalidateKey="time_entries"
                  />
                </div>
                <div className="text-right text-sm">
                  {formatMoney(Number(e.hours) * Number(e.hourly_rate || 0))}
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
                  onClick={() => {
                    setForm({
                      id: e.id as string,
                      employee_id: (e.employee_id as string) ?? "",
                      employee_name: (e.employee_name as string) ?? "",
                      customer_id: (e.customer_id as string) ?? "",
                      project_id: (e.project_id as string) ?? "",
                      work_date: e.work_date as string,
                      start_time: e.start_time ? String(e.start_time).slice(0, 5) : "",
                      end_time: e.end_time ? String(e.end_time).slice(0, 5) : "",
                      break_minutes: String(e.break_minutes ?? 0),
                      hours: String(e.hours ?? ""),
                      hourly_rate: String(e.hourly_rate ?? ""),
                      location: (e.location as string) ?? "",
                      note: (e.note as string) ?? "",
                    });
                    setEntryOpen(true);
                  }}
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
