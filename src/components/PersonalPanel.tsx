import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { BriefcaseBusiness, Pencil, Plus, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/format";
import { LoadError } from "@/components/LoadError";

const ROLES = ["Reinigungskraft", "Vorarbeiter", "Objektleiter", "Springer", "Verwaltung"] as const;
const CONTRACT_TYPES = ["Vollzeit", "Teilzeit", "Minijob", "Befristet", "Aushilfe", "Werkstudent", "Sonstiges"] as const;

type Employee = import("@/integrations/supabase/types").Tables<"employees">;

type EmployeeForm = {
  id?: string;
  name: string;
  personnel_number: string;
  email: string;
  phone: string;
  birth_date: string;
  address_line: string;
  postal_code: string;
  city: string;
  role: string;
  contract_type: string;
  contract_start: string;
  contract_end: string;
  weekly_hours: string;
  hourly_rate: string;
  vacation_days_per_year: string;
  has_driving_license: boolean;
  driving_license_classes: string;
  qualification: string;
  has_experience_certificate: boolean;
  experience_details: string;
  personnel_notes: string;
  active: boolean;
};

const empty: EmployeeForm = {
  name: "", personnel_number: "", email: "", phone: "", birth_date: "",
  address_line: "", postal_code: "", city: "", role: "Reinigungskraft",
  contract_type: "", contract_start: "", contract_end: "", weekly_hours: "0",
  hourly_rate: "0", vacation_days_per_year: "0", has_driving_license: false,
  driving_license_classes: "", qualification: "", has_experience_certificate: false,
  experience_details: "", personnel_notes: "", active: true,
};

function numeric(value: string) {
  const parsed = Number(value.replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function toForm(employee: Employee): EmployeeForm {
  return {
    id: employee.id,
    name: employee.name ?? "",
    personnel_number: employee.personnel_number ?? "",
    email: employee.email ?? "",
    phone: employee.phone ?? "",
    birth_date: employee.birth_date ?? "",
    address_line: employee.address_line ?? "",
    postal_code: employee.postal_code ?? "",
    city: employee.city ?? "",
    role: employee.role || "Reinigungskraft",
    contract_type: employee.contract_type ?? "",
    contract_start: employee.contract_start ?? "",
    contract_end: employee.contract_end ?? "",
    weekly_hours: String(employee.weekly_hours ?? 0),
    hourly_rate: String(employee.hourly_rate ?? 0),
    vacation_days_per_year: String(employee.vacation_days_per_year ?? 0),
    has_driving_license: Boolean(employee.has_driving_license),
    driving_license_classes: employee.driving_license_classes ?? "",
    qualification: employee.qualification ?? "",
    has_experience_certificate: Boolean(employee.has_experience_certificate),
    experience_details: employee.experience_details ?? "",
    personnel_notes: employee.personnel_notes ?? "",
    active: employee.active !== false,
  };
}

function Field(props: {
  label: string; value: string; onChange: (value: string) => void;
  type?: string; placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{props.label}</Label>
      <Input
        type={props.type ?? "text"}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}

export function Personal() {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<EmployeeForm>(empty);

  const { data: employees = [], error } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async (values: EmployeeForm) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const payload = {
        name: values.name.trim(),
        personnel_number: values.personnel_number.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
        birth_date: values.birth_date || null,
        address_line: values.address_line.trim(),
        postal_code: values.postal_code.trim(),
        city: values.city.trim(),
        role: values.role,
        contract_type: values.contract_type,
        contract_start: values.contract_start || null,
        contract_end: values.contract_end || null,
        weekly_hours: numeric(values.weekly_hours),
        hourly_rate: numeric(values.hourly_rate),
        vacation_days_per_year: numeric(values.vacation_days_per_year),
        has_driving_license: values.has_driving_license,
        driving_license_classes: values.has_driving_license ? values.driving_license_classes.trim() : "",
        qualification: values.qualification.trim(),
        has_experience_certificate: values.has_experience_certificate,
        experience_details: values.experience_details.trim(),
        personnel_notes: values.personnel_notes.trim(),
        active: values.active,
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
      toast.success(form.id ? "Mitarbeiterakte aktualisiert" : "Mitarbeiter angelegt");
      setOpen(false);
      setForm(empty);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
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

  const edit = (employee: Employee) => {
    setForm(toForm(employee));
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <LoadError error={error} title="Personalstammdaten konnten nicht geladen werden" />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Personalstamm</h2>
          <p className="text-sm text-muted-foreground">
            Mitarbeiterakten und Stammdaten. Planung und Zeiten bleiben getrennt in Dienstplan,
            Kalender und Zeiterfassung.
          </p>
        </div>
        <Button onClick={() => { setForm(empty); setOpen(true); }}>
          <Plus className="size-4" /> Neuer Mitarbeiter
        </Button>
      </div>

      {employees.length === 0 ? (
        <div className="surface px-5 py-12 text-center text-sm text-muted-foreground">
          Noch keine Mitarbeiter angelegt.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {employees.map((employee) => (
            <article key={employee.id} className="surface space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-lg font-semibold">{employee.name}</h3>
                    <span className="rounded bg-muted px-2 py-0.5 text-xs">
                      {employee.active ? "Aktiv" : "Inaktiv"}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {[employee.personnel_number, employee.role].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => edit(employee)} aria-label="Mitarbeiter bearbeiten">
                    <Pencil className="size-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Mitarbeiter löschen">
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Mitarbeiter wirklich löschen?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Die Personalakte von „{employee.name}“ wird gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                        <AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={() => remove.mutate(employee.id)}>
                          Löschen
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              <div className="grid gap-x-5 gap-y-2 text-sm sm:grid-cols-2">
                <div><span className="text-muted-foreground">Geburtsdatum:</span> {employee.birth_date ? formatDate(employee.birth_date) : "—"}</div>
                <div><span className="text-muted-foreground">Telefon:</span> {employee.phone || "—"}</div>
                <div><span className="text-muted-foreground">E-Mail:</span> {employee.email || "—"}</div>
                <div><span className="text-muted-foreground">Adresse:</span> {[employee.address_line, employee.postal_code, employee.city].filter(Boolean).join(", ") || "—"}</div>
                <div>
                  <span className="text-muted-foreground">Vertrag:</span>{" "}
                  {[employee.contract_type, employee.contract_start ? "ab " + formatDate(employee.contract_start) : "", employee.contract_end ? "bis " + formatDate(employee.contract_end) : "unbefristet"].filter(Boolean).join(" · ") || "—"}
                </div>
                <div><span className="text-muted-foreground">Wochenstunden:</span> {Number(employee.weekly_hours ?? 0).toLocaleString("de-DE")} h</div>
                <div>
                  <span className="text-muted-foreground">Führerschein:</span>{" "}
                  {employee.has_driving_license
                    ? employee.driving_license_classes
                      ? "Ja · Klasse " + employee.driving_license_classes
                      : "Ja"
                    : "Nein"}
                </div>
                <div><span className="text-muted-foreground">Qualifikation / Ausbildung:</span> {employee.qualification || "—"}</div>
                <div className="sm:col-span-2">
                  <span className="text-muted-foreground">Arbeitszeugnis / Erfahrung:</span>{" "}
                  {employee.has_experience_certificate ? "Nachweis vorhanden" : "Kein Nachweis"}
                  {employee.experience_details ? " · " + employee.experience_details : ""}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) setForm(empty); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Mitarbeiterakte bearbeiten" : "Neuer Mitarbeiter"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <section className="space-y-3">
              <h3 className="font-semibold">Persönliche Daten</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" value={form.name} onChange={(name) => setForm((f) => ({ ...f, name }))} />
                <Field label="Personalnummer" value={form.personnel_number} onChange={(personnel_number) => setForm((f) => ({ ...f, personnel_number }))} />
                <Field label="Geburtsdatum" type="date" value={form.birth_date} onChange={(birth_date) => setForm((f) => ({ ...f, birth_date }))} />
                <Field label="Telefon" value={form.phone} onChange={(phone) => setForm((f) => ({ ...f, phone }))} />
                <Field label="E-Mail" type="email" value={form.email} onChange={(email) => setForm((f) => ({ ...f, email }))} />
                <Field label="Straße und Hausnummer" value={form.address_line} onChange={(address_line) => setForm((f) => ({ ...f, address_line }))} />
                <Field label="PLZ" value={form.postal_code} onChange={(postal_code) => setForm((f) => ({ ...f, postal_code }))} />
                <Field label="Ort" value={form.city} onChange={(city) => setForm((f) => ({ ...f, city }))} />
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="flex items-center gap-2 font-semibold"><BriefcaseBusiness className="size-4" /> Beschäftigung & Vertrag</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Funktion</Label>
                  <Select value={form.role} onValueChange={(role) => setForm((f) => ({ ...f, role }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ROLES.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Vertragsart</Label>
                  <Select value={form.contract_type || "__none__"} onValueChange={(value) => setForm((f) => ({ ...f, contract_type: value === "__none__" ? "" : value }))}>
                    <SelectTrigger><SelectValue placeholder="Vertragsart wählen" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nicht angegeben</SelectItem>
                      {CONTRACT_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Field label="Vertragsbeginn" type="date" value={form.contract_start} onChange={(contract_start) => setForm((f) => ({ ...f, contract_start }))} />
                <Field label="Vertragsende (leer = unbefristet)" type="date" value={form.contract_end} onChange={(contract_end) => setForm((f) => ({ ...f, contract_end }))} />
                <Field label="Wochenstunden" value={form.weekly_hours} onChange={(weekly_hours) => setForm((f) => ({ ...f, weekly_hours }))} />
                <Field label="Stundenlohn (€)" value={form.hourly_rate} onChange={(hourly_rate) => setForm((f) => ({ ...f, hourly_rate }))} />
                <Field label="Urlaubstage / Jahr" value={form.vacation_days_per_year} onChange={(vacation_days_per_year) => setForm((f) => ({ ...f, vacation_days_per_year }))} />
                <label className="flex items-center gap-2 pt-7 text-sm font-medium">
                  <Checkbox checked={form.active} onCheckedChange={(checked) => setForm((f) => ({ ...f, active: Boolean(checked) }))} />
                  Mitarbeiter aktiv
                </label>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="font-semibold">Führerschein & Qualifikationen</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox checked={form.has_driving_license} onCheckedChange={(checked) => setForm((f) => ({ ...f, has_driving_license: Boolean(checked) }))} />
                  Führerschein vorhanden
                </label>
                <Field label="Führerscheinklasse(n)" value={form.driving_license_classes} onChange={(driving_license_classes) => setForm((f) => ({ ...f, driving_license_classes }))} placeholder="z. B. B, BE, C1" />
                <div className="space-y-2 sm:col-span-2">
                  <Label>Ausbildung / Qualifikation / Schulungen</Label>
                  <Textarea value={form.qualification} onChange={(e) => setForm((f) => ({ ...f, qualification: e.target.value }))} placeholder="z. B. Gebäudereiniger-Ausbildung, Maschinen- oder Hygieneschulung" />
                </div>
                <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
                  <Checkbox checked={form.has_experience_certificate} onCheckedChange={(checked) => setForm((f) => ({ ...f, has_experience_certificate: Boolean(checked) }))} />
                  Arbeitszeugnis / Erfahrungsnachweis vorhanden
                </label>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Berufserfahrung / Nachweise</Label>
                  <Textarea value={form.experience_details} onChange={(e) => setForm((f) => ({ ...f, experience_details: e.target.value }))} placeholder="z. B. 5 Jahre Unterhaltsreinigung, Arbeitszeugnis Firma XY" />
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <Label>Interne Personalnotizen</Label>
              <Textarea rows={4} value={form.personnel_notes} onChange={(e) => setForm((f) => ({ ...f, personnel_notes: e.target.value }))} placeholder="Nur interne Hinweise zur Personalakte" />
            </section>
          </div>

          <DialogFooter>
            <Button onClick={() => save.mutate(form)} disabled={!form.name.trim() || save.isPending}>
              {save.isPending ? "Wird gespeichert …" : "Personalakte speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
