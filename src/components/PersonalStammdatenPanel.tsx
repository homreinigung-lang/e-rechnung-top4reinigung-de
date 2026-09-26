import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";

type Employee = Tables<"employees">;

type EmployeeForm = {
  id?: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  personnel_number: string;
  birth_date: string;
  address_line: string;
  postal_code: string;
  city: string;
  contract_type: string;
  contract_start: string;
  contract_end: string;
  weekly_hours: string;
  hourly_rate: string;
  vacation_days_per_year: string;
  active: boolean;
  has_driving_license: boolean;
  driving_license_classes: string;
  qualification: string;
  has_experience_certificate: boolean;
  experience_details: string;
  personnel_notes: string;
};

const empty: EmployeeForm = {
  name: "",
  role: "Reinigungskraft",
  email: "",
  phone: "",
  personnel_number: "",
  birth_date: "",
  address_line: "",
  postal_code: "",
  city: "",
  contract_type: "",
  contract_start: "",
  contract_end: "",
  weekly_hours: "0",
  hourly_rate: "0",
  vacation_days_per_year: "0",
  active: true,
  has_driving_license: false,
  driving_license_classes: "",
  qualification: "",
  has_experience_certificate: false,
  experience_details: "",
  personnel_notes: "",
};

const ROLES = ["Reinigungskraft", "Vorarbeiter", "Objektleiter", "Springer", "Verwaltung"];
const CONTRACTS = ["Minijob", "Teilzeit", "Vollzeit", "Werkstudent", "Ausbildung", "Befristet", "Sonstiges"];

function n(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function toForm(e: Employee): EmployeeForm {
  return {
    id: e.id,
    name: e.name ?? "",
    role: e.role ?? "Reinigungskraft",
    email: e.email ?? "",
    phone: e.phone ?? "",
    personnel_number: e.personnel_number ?? "",
    birth_date: e.birth_date ?? "",
    address_line: e.address_line ?? "",
    postal_code: e.postal_code ?? "",
    city: e.city ?? "",
    contract_type: e.contract_type ?? "",
    contract_start: e.contract_start ?? "",
    contract_end: e.contract_end ?? "",
    weekly_hours: String(e.weekly_hours ?? 0),
    hourly_rate: String(e.hourly_rate ?? 0),
    vacation_days_per_year: String(e.vacation_days_per_year ?? 0),
    active: Boolean(e.active),
    has_driving_license: Boolean(e.has_driving_license),
    driving_license_classes: e.driving_license_classes ?? "",
    qualification: e.qualification ?? "",
    has_experience_certificate: Boolean(e.has_experience_certificate),
    experience_details: e.experience_details ?? "",
    personnel_notes: e.personnel_notes ?? "",
  };
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value || "—"}</div>
    </div>
  );
}

export function PersonalStammdatenPanel() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EmployeeForm>(empty);

  const { data: employees = [] } = useQuery({
    queryKey: ["employees", "stammdaten"],
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
        role: values.role,
        email: values.email.trim(),
        phone: values.phone.trim(),
        personnel_number: values.personnel_number.trim(),
        birth_date: values.birth_date || null,
        address_line: values.address_line.trim(),
        postal_code: values.postal_code.trim(),
        city: values.city.trim(),
        contract_type: values.contract_type,
        contract_start: values.contract_start || null,
        contract_end: values.contract_end || null,
        weekly_hours: n(values.weekly_hours),
        hourly_rate: n(values.hourly_rate),
        vacation_days_per_year: n(values.vacation_days_per_year),
        active: values.active,
        has_driving_license: values.has_driving_license,
        driving_license_classes: values.has_driving_license
          ? values.driving_license_classes.trim()
          : "",
        qualification: values.qualification.trim(),
        has_experience_certificate: values.has_experience_certificate,
        experience_details: values.experience_details.trim(),
        personnel_notes: values.personnel_notes.trim(),
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
      toast.success("Personaldaten gespeichert");
      setOpen(false);
      setForm(empty);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const field = (
    key: keyof EmployeeForm,
    label: string,
    type: string = "text",
    className: string = "",
  ) => (
    <div className={`space-y-2 ${className}`}>
      <Label htmlFor={String(key)}>{label}</Label>
      <Input
        id={String(key)}
        type={type}
        value={typeof form[key] === "string" ? String(form[key]) : ""}
        onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
      />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Personalstamm</h2>
          <p className="text-sm text-muted-foreground">
            Mitarbeiterakte mit persönlichen Daten, Vertrag, Führerschein und Qualifikationen.
          </p>
        </div>
        <Button
          onClick={() => {
            setForm(empty);
            setOpen(true);
          }}
        >
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
                <div>
                  <h3 className="text-lg font-semibold">{employee.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {[employee.personnel_number, employee.role].filter(Boolean).join(" · ") || "Mitarbeiter"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-1 text-xs ${employee.active ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}>
                    {employee.active ? "Aktiv" : "Inaktiv"}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setForm(toForm(employee));
                      setOpen(true);
                    }}
                    aria-label="Mitarbeiter bearbeiten"
                  >
                    <Pencil className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Info label="Geburtsdatum" value={employee.birth_date ? formatDate(employee.birth_date) : ""} />
                <Info label="Kontakt" value={[employee.email, employee.phone].filter(Boolean).join(" · ")} />
                <Info
                  label="Adresse"
                  value={[
                    employee.address_line,
                    [employee.postal_code, employee.city].filter(Boolean).join(" "),
                  ].filter(Boolean).join(", ")}
                />
                <Info label="Vertragsart" value={employee.contract_type ?? ""} />
                <Info
                  label="Vertragsdauer"
                  value={[
                    employee.contract_start ? formatDate(employee.contract_start) : "",
                    employee.contract_end ? formatDate(employee.contract_end) : "unbefristet",
                  ].filter(Boolean).join(" – ")}
                />
                <Info label="Arbeitszeit" value={`${Number(employee.weekly_hours ?? 0).toLocaleString("de-DE")} Std./Woche`} />
                <Info
                  label="Führerschein"
                  value={employee.has_driving_license ? `Ja${employee.driving_license_classes ? ` · Klasse ${employee.driving_license_classes}` : ""}` : "Nein"}
                />
                <Info label="Qualifikation / Ausbildung" value={employee.qualification ?? ""} />
                <Info
                  label="Erfahrungsnachweis"
                  value={employee.has_experience_certificate ? "Vorhanden" : "Nicht hinterlegt"}
                />
                <Info label="Erfahrung / Zertifikate" value={employee.experience_details ?? ""} />
              </div>

              {employee.personnel_notes ? (
                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  <div className="mb-1 text-xs text-muted-foreground">Personalnotiz</div>
                  {employee.personnel_notes}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) setForm(empty);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Mitarbeiter bearbeiten" : "Neuer Mitarbeiter"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            {field("name", "Name", "text", "sm:col-span-2")}
            {field("personnel_number", "Personalnummer")}
            <div className="space-y-2">
              <Label>Funktion</Label>
              <Select value={form.role} onValueChange={(value) => setForm((f) => ({ ...f, role: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {field("birth_date", "Geburtsdatum", "date")}
            {field("email", "E-Mail", "email")}
            {field("phone", "Telefon")}
            {field("address_line", "Straße und Hausnummer", "text", "sm:col-span-2")}
            {field("postal_code", "PLZ")}
            {field("city", "Ort")}

            <div className="sm:col-span-2 border-t pt-4">
              <h3 className="font-semibold">Vertrag</h3>
            </div>
            <div className="space-y-2">
              <Label>Vertragsart</Label>
              <Select
                value={form.contract_type || "__empty__"}
                onValueChange={(value) =>
                  setForm((f) => ({ ...f, contract_type: value === "__empty__" ? "" : value }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__empty__">Nicht angegeben</SelectItem>
                  {CONTRACTS.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {field("weekly_hours", "Wochenstunden")}
            {field("contract_start", "Vertragsbeginn", "date")}
            {field("contract_end", "Vertragsende (leer = unbefristet)", "date")}
            {field("hourly_rate", "Stundenlohn (€)")}
            {field("vacation_days_per_year", "Urlaubstage / Jahr")}

            <div className="sm:col-span-2 border-t pt-4">
              <h3 className="font-semibold">Führerschein & Qualifikation</h3>
            </div>
            <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
              <Checkbox
                checked={form.has_driving_license}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, has_driving_license: Boolean(checked) }))
                }
              />
              Führerschein vorhanden
            </label>
            {field("driving_license_classes", "Führerscheinklasse(n), z. B. B, BE")}
            {field("qualification", "Qualifikation / Ausbildung", "text", "sm:col-span-2")}
            <label className="flex items-center gap-2 rounded-md border p-3 text-sm sm:col-span-2">
              <Checkbox
                checked={form.has_experience_certificate}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, has_experience_certificate: Boolean(checked) }))
                }
              />
              Arbeitszeugnis / Erfahrungsnachweis vorhanden
            </label>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="experience_details">Berufserfahrung / Zertifikate / Ausbildung</Label>
              <Textarea
                id="experience_details"
                rows={3}
                value={form.experience_details}
                onChange={(event) =>
                  setForm((f) => ({ ...f, experience_details: event.target.value }))
                }
                placeholder="z. B. Ausbildung Gebäudereiniger, 5 Jahre Unterhaltsreinigung, Maschinenkurs …"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="personnel_notes">Personalnotizen</Label>
              <Textarea
                id="personnel_notes"
                rows={3}
                value={form.personnel_notes}
                onChange={(event) =>
                  setForm((f) => ({ ...f, personnel_notes: event.target.value }))
                }
              />
            </div>
            <label className="flex items-center gap-2 rounded-md border p-3 text-sm sm:col-span-2">
              <Checkbox
                checked={form.active}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, active: Boolean(checked) }))}
              />
              Mitarbeiter aktiv
            </label>
          </div>

          <DialogFooter>
            <Button
              disabled={!form.name.trim() || save.isPending}
              onClick={() => save.mutate(form)}
            >
              Personaldaten speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
