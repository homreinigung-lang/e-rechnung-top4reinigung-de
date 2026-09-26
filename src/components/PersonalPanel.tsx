import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { formatDate } from "@/lib/format";

const ROLES = ["Reinigungskraft", "Vorarbeiter", "Objektleiter", "Springer", "Verwaltung"];
const CONTRACT_TYPES = [
  "Vollzeit",
  "Teilzeit",
  "Minijob",
  "Werkstudent",
  "Ausbildung",
  "Befristet",
  "Unbefristet",
  "Sonstiges",
];

type Employee = import("@/integrations/supabase/types").Tables<"employees">;

type PersonnelForm = {
  id?: string;
  name: string;
  birth_date: string;
  email: string;
  phone: string;
  personnel_number: string;
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
  vacation_carryover_days: string;
  has_driving_license: boolean;
  driving_license_classes: string;
  qualification: string;
  has_experience_certificate: boolean;
  experience_details: string;
  personnel_notes: string;
  active: boolean;
};

const empty: PersonnelForm = {
  name: "",
  birth_date: "",
  email: "",
  phone: "",
  personnel_number: "",
  address_line: "",
  postal_code: "",
  city: "",
  role: "Reinigungskraft",
  contract_type: "",
  contract_start: "",
  contract_end: "",
  weekly_hours: "0",
  hourly_rate: "0",
  vacation_days_per_year: "0",
  vacation_carryover_days: "0",
  has_driving_license: false,
  driving_license_classes: "",
  qualification: "",
  has_experience_certificate: false,
  experience_details: "",
  personnel_notes: "",
  active: true,
};

function num(value: string) {
  const n = Number(String(value).replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

function fromEmployee(employee: Employee): PersonnelForm {
  return {
    id: employee.id,
    name: employee.name ?? "",
    birth_date: employee.birth_date ?? "",
    email: employee.email ?? "",
    phone: employee.phone ?? "",
    personnel_number: employee.personnel_number ?? "",
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
    vacation_carryover_days: String(employee.vacation_carryover_days ?? 0),
    has_driving_license: Boolean(employee.has_driving_license),
    driving_license_classes: employee.driving_license_classes ?? "",
    qualification: employee.qualification ?? "",
    has_experience_certificate: Boolean(employee.has_experience_certificate),
    experience_details: employee.experience_details ?? "",
    personnel_notes: employee.personnel_notes ?? "",
    active: Boolean(employee.active),
  };
}

function valueOrDash(value: string | null | undefined) {
  const v = String(value ?? "").trim();
  return v || "—";
}

export function Personal() {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<PersonnelForm>(empty);

  const { data: employees = [] } = useQuery({
    queryKey: ["employees", "personnel-master"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async (values: PersonnelForm) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");

      const payload = {
        name: values.name.trim(),
        birth_date: values.birth_date || null,
        email: values.email.trim(),
        phone: values.phone.trim(),
        personnel_number: values.personnel_number.trim(),
        address_line: values.address_line.trim(),
        postal_code: values.postal_code.trim(),
        city: values.city.trim(),
        role: values.role,
        contract_type: values.contract_type,
        contract_start: values.contract_start || null,
        contract_end: values.contract_end || null,
        weekly_hours: num(values.weekly_hours),
        hourly_rate: num(values.hourly_rate),
        vacation_days_per_year: num(values.vacation_days_per_year),
        vacation_carryover_days: num(values.vacation_carryover_days),
        has_driving_license: values.has_driving_license,
        driving_license_classes: values.has_driving_license
          ? values.driving_license_classes.trim()
          : "",
        qualification: values.qualification.trim(),
        has_experience_certificate: values.has_experience_certificate,
        experience_details: values.has_experience_certificate
          ? values.experience_details.trim()
          : "",
        personnel_notes: values.personnel_notes.trim(),
        active: values.active,
      };

      if (!payload.name) throw new Error("Bitte den Namen des Mitarbeiters eintragen.");
      if (
        values.contract_start &&
        values.contract_end &&
        values.contract_end < values.contract_start
      ) {
        throw new Error("Das Vertragsende darf nicht vor dem Vertragsbeginn liegen.");
      }

      if (values.id) {
        const { error } = await supabase.from("employees").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("employees").insert({ ...payload, user_id: userId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Mitarbeiterdaten aktualisiert" : "Mitarbeiter angelegt");
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

  const textField = (
    key: keyof PersonnelForm,
    label: string,
    options?: { type?: string; placeholder?: string },
  ) => (
    <div className="space-y-2">
      <Label htmlFor={String(key)}>{label}</Label>
      <Input
        id={String(key)}
        type={options?.type ?? "text"}
        placeholder={options?.placeholder}
        value={typeof form[key] === "string" ? String(form[key]) : ""}
        onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Personalstamm</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Stammdaten, Vertrag, Qualifikation und Nachweise der Mitarbeiter. Einsatzplanung und
            Kalender bleiben getrennt im Dienstplan bzw. Kalender.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setForm(empty);
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={() => setForm(empty)}>
              <Plus className="size-4" /> Neuer Mitarbeiter
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{form.id ? "Mitarbeiter bearbeiten" : "Neuer Mitarbeiter"}</DialogTitle>
            </DialogHeader>

            <div className="space-y-5">
              <section className="space-y-3">
                <h3 className="font-semibold">Persönliche Daten</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {textField("name", "Name")}
                  {textField("birth_date", "Geburtsdatum", { type: "date" })}
                  {textField("email", "E-Mail", { type: "email" })}
                  {textField("phone", "Telefon")}
                  {textField("personnel_number", "Personalnummer")}
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={form.active ? "active" : "inactive"}
                      onValueChange={(value) =>
                        setForm((current) => ({ ...current, active: value === "active" }))
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Aktiv</SelectItem>
                        <SelectItem value="inactive">Inaktiv</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    {textField("address_line", "Straße und Hausnummer")}
                  </div>
                  {textField("postal_code", "PLZ")}
                  {textField("city", "Ort")}
                </div>
              </section>

              <section className="space-y-3 border-t pt-4">
                <h3 className="font-semibold">Arbeitsvertrag</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Funktion / Position</Label>
                    <Select
                      value={form.role}
                      onValueChange={(value) => setForm((current) => ({ ...current, role: value }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLES.map((role) => (
                          <SelectItem key={role} value={role}>{role}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Vertragsart</Label>
                    <Select
                      value={form.contract_type || "__none__"}
                      onValueChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          contract_type: value === "__none__" ? "" : value,
                        }))
                      }
                    >
                      <SelectTrigger><SelectValue placeholder="Vertragsart wählen" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Nicht angegeben</SelectItem>
                        {CONTRACT_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {textField("contract_start", "Vertragsbeginn", { type: "date" })}
                  {textField("contract_end", "Vertragsende / Befristung", { type: "date" })}
                  {textField("weekly_hours", "Wochenstunden")}
                  {textField("hourly_rate", "Stundenlohn (€)")}
                  {textField("vacation_days_per_year", "Urlaubstage / Jahr")}
                  {textField("vacation_carryover_days", "Resturlaub")}
                </div>
              </section>

              <section className="space-y-3 border-t pt-4">
                <h3 className="font-semibold">Führerschein & Qualifikation</h3>
                <div className="space-y-4">
                  <label className="flex items-center gap-3 rounded-md border p-3">
                    <Checkbox
                      checked={form.has_driving_license}
                      onCheckedChange={(checked) =>
                        setForm((current) => ({
                          ...current,
                          has_driving_license: Boolean(checked),
                          ...(!checked ? { driving_license_classes: "" } : {}),
                        }))
                      }
                    />
                    <span>Führerschein vorhanden</span>
                  </label>
                  {form.has_driving_license &&
                    textField("driving_license_classes", "Führerscheinklassen", {
                      placeholder: "z. B. B, BE, C1",
                    })}
                  <div className="space-y-2">
                    <Label>Ausbildung / Qualifikation</Label>
                    <Textarea
                      rows={3}
                      value={form.qualification}
                      onChange={(e) =>
                        setForm((current) => ({ ...current, qualification: e.target.value }))
                      }
                      placeholder="z. B. Ausbildung Gebäudereiniger, Fachkenntnisse, Zertifikate"
                    />
                  </div>
                  <label className="flex items-center gap-3 rounded-md border p-3">
                    <Checkbox
                      checked={form.has_experience_certificate}
                      onCheckedChange={(checked) =>
                        setForm((current) => ({
                          ...current,
                          has_experience_certificate: Boolean(checked),
                          ...(!checked ? { experience_details: "" } : {}),
                        }))
                      }
                    />
                    <span>Erfahrungs-/Arbeitszeugnis vorhanden</span>
                  </label>
                  {form.has_experience_certificate && (
                    <div className="space-y-2">
                      <Label>Erfahrung / Zeugnisdetails</Label>
                      <Textarea
                        rows={3}
                        value={form.experience_details}
                        onChange={(e) =>
                          setForm((current) => ({ ...current, experience_details: e.target.value }))
                        }
                        placeholder="z. B. 5 Jahre Unterhaltsreinigung, Arbeitszeugnis vorhanden"
                      />
                    </div>
                  )}
                </div>
              </section>

              <section className="space-y-2 border-t pt-4">
                <Label>Interne Personalnotizen</Label>
                <Textarea
                  rows={4}
                  value={form.personnel_notes}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, personnel_notes: e.target.value }))
                  }
                />
              </section>
            </div>

            <DialogFooter>
              <Button
                onClick={() => save.mutate(form)}
                disabled={!form.name.trim() || save.isPending}
              >
                Speichern
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {employees.length === 0 ? (
        <div className="surface px-5 py-12 text-center text-sm text-muted-foreground">
          Noch keine Mitarbeiter angelegt.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {employees.map((employee) => (
            <article key={employee.id} className="surface space-y-4 p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-muted p-2">
                  <UserRound className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-semibold">{employee.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {[employee.role, employee.personnel_number ? "PNr. " + employee.personnel_number : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span
                  className={
                    employee.active
                      ? "rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-800"
                      : "rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
                  }
                >
                  {employee.active ? "Aktiv" : "Inaktiv"}
                </span>
              </div>

              <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Geburtsdatum</dt><dd>{employee.birth_date ? formatDate(employee.birth_date) : "—"}</dd></div>
                <div><dt className="text-muted-foreground">Kontakt</dt><dd>{valueOrDash(employee.phone || employee.email)}</dd></div>
                <div><dt className="text-muted-foreground">Vertrag</dt><dd>{valueOrDash(employee.contract_type)}</dd></div>
                <div><dt className="text-muted-foreground">Vertragsdauer</dt><dd>{employee.contract_start ? formatDate(employee.contract_start) + (employee.contract_end ? " – " + formatDate(employee.contract_end) : " – unbefristet") : "—"}</dd></div>
                <div><dt className="text-muted-foreground">Wochenstunden</dt><dd>{Number(employee.weekly_hours ?? 0).toLocaleString("de-DE")} Std.</dd></div>
                <div><dt className="text-muted-foreground">Führerschein</dt><dd>{employee.has_driving_license ? "Ja" + (employee.driving_license_classes ? " · " + employee.driving_license_classes : "") : "Nein"}</dd></div>
                <div className="sm:col-span-2"><dt className="text-muted-foreground">Ausbildung / Qualifikation</dt><dd>{valueOrDash(employee.qualification)}</dd></div>
                <div className="sm:col-span-2"><dt className="text-muted-foreground">Erfahrung / Zeugnis</dt><dd>{employee.has_experience_certificate ? valueOrDash(employee.experience_details || "Vorhanden") : "Nicht hinterlegt"}</dd></div>
              </dl>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setForm(fromEmployee(employee));
                    setOpen(true);
                  }}
                >
                  <Pencil className="size-4" /> Bearbeiten
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Trash2 className="size-4 text-destructive" /> Löschen
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Mitarbeiter wirklich löschen?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Der Mitarbeiter „{employee.name}“ wird gelöscht. Bestehende Zeit-/Einsatzdaten
                        sollten vorher geprüft werden.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction
                        className={buttonVariants({ variant: "destructive" })}
                        onClick={() => remove.mutate(employee.id)}
                      >
                        Löschen
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
