import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

import { toast } from "sonner";
import { useFileUrl } from "@/hooks/useFileUrl";
import { FileUploadButton } from "@/components/FileUploadButton";
import { useMyEmployee, type MyEmployee } from "@/lib/employee";
import { LoginMethodsCard } from "@/components/LoginMethodsCard";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/profil")({
  head: () => ({
    meta: [
      { title: "Firmendaten – GebCalc" },
      {
        name: "description",
        content: "Firmenname, Inhaber, Anschrift, Steuernummern, Bankverbindung und Logo pflegen.",
      },
      { property: "og:title", content: "Mein Profil & Firmendaten" },
      { property: "og:description", content: "Stammdaten der Reinigungsfirma verwalten." },
    ],
  }),
  component: Profil,
});

const GROUPS = [
  {
    title: "Firma & Inhaber",
    fields: [
      { key: "company_name", label: "Firmenname" },
      { key: "owner_name", label: "Inhaber" },
      { key: "email", label: "E-Mail" },
      { key: "phone", label: "Telefon" },
    ],
  },
  {
    title: "Anschrift",
    fields: [
      { key: "address_line", label: "Straße und Hausnummer" },
      { key: "postal_code", label: "PLZ" },
      { key: "city", label: "Ort" },
      { key: "country", label: "Land" },
    ],
  },
  {
    title: "Steuerliche Angaben",
    fields: [
      { key: "vat_id", label: "USt-IdNr." },
      { key: "tax_number", label: "Steuernummer" },
      { key: "payment_terms_days", label: "Zahlungsziel (Tage)" },
    ],
  },
  {
    title: "Bankverbindung",
    fields: [
      { key: "bank_name", label: "Bank" },
      { key: "iban", label: "IBAN" },
      { key: "bic", label: "BIC" },
    ],
  },
] as const;

const ALL_KEYS = [...GROUPS.flatMap((g) => g.fields.map((f) => f.key)), "logo_url"];

function Profil() {
  const { data: myEmployee, isPending } = useMyEmployee();
  if (isPending) return <p className="text-muted-foreground">Wird geladen …</p>;
  if (myEmployee) return <EmployeeProfil employee={myEmployee} />;
  return <CompanyProfil />;
}

function EmployeeProfil({ employee }: { employee: MyEmployee }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(employee.name ?? "");
  const [phone, setPhone] = useState(employee.phone ?? "");

  useEffect(() => {
    setName(employee.name ?? "");
    setPhone(employee.phone ?? "");
  }, [employee.id, employee.name, employee.phone]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("employees")
        .update({ name: name.trim(), phone: phone.trim() })
        .eq("id", employee.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profil gespeichert");
      queryClient.invalidateQueries({ queryKey: ["my_employee"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["employees", "stammdaten"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const info = (label: string, value: string) => (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="min-h-6 text-sm font-medium">{value || "—"}</div>
    </div>
  );

  const address = [
    employee.address_line,
    [employee.postal_code, employee.city].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");

  const contractDuration = [
    employee.contract_start ? formatDate(employee.contract_start) : "",
    employee.contract_end ? formatDate(employee.contract_end) : "unbefristet",
  ].filter(Boolean).join(" – ");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mein Profil</h1>
        <p className="mt-1 text-muted-foreground">
          Ihre Personaldaten aus der Mitarbeiterakte. Bitte prüfen Sie, ob die Angaben korrekt sind.
        </p>
      </div>

      <div className="surface space-y-5 p-6">
        <div>
          <h2 className="font-display text-lg font-semibold">Persönliche Daten</h2>
          <p className="text-sm text-muted-foreground">
            Name und Telefonnummer können Sie selbst aktualisieren. Die übrigen Stammdaten werden von der Verwaltung gepflegt.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="emp_name">Name</Label>
            <Input id="emp_name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emp_phone">Telefon</Label>
            <Input id="emp_phone" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emp_mail">E-Mail</Label>
            <Input id="emp_mail" value={employee.email ?? ""} readOnly disabled dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emp_persno">Personalnummer</Label>
            <Input id="emp_persno" value={employee.personnel_number ?? ""} readOnly disabled dir="ltr" />
          </div>
        </div>

        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Speichern
        </Button>
      </div>

      <div className="surface space-y-5 p-6">
        <h2 className="font-display text-lg font-semibold">Mitarbeiterakte</h2>

        <div className="grid gap-5 sm:grid-cols-2">
          {info("Geburtsdatum", employee.birth_date ? formatDate(employee.birth_date) : "")}
          {info("Funktion", employee.role ?? "")}
          {info("Adresse", address)}
          {info("Arbeitsort", employee.work_location ?? "")}
          {info("Vertragsart", employee.contract_type ?? "")}
          {info("Vertragsdauer", contractDuration)}
          {info(
            "Arbeitszeit",
            `${Number(employee.weekly_hours ?? 0).toLocaleString("de-DE")} Std./Woche`,
          )}
          {info(
            "Urlaub",
            `${Number(employee.vacation_days_per_year ?? 0).toLocaleString("de-DE")} Tage/Jahr` +
              (Number(employee.vacation_carryover_days ?? 0) > 0
                ? ` · Übertrag ${Number(employee.vacation_carryover_days).toLocaleString("de-DE")} Tage`
                : ""),
          )}
          {info(
            "Führerschein",
            employee.has_driving_license
              ? `Ja${employee.driving_license_classes ? ` · Klasse ${employee.driving_license_classes}` : ""}`
              : "Nein",
          )}
          {info("Qualifikation / Ausbildung", employee.qualification ?? "")}
          {info(
            "Erfahrungsnachweis",
            employee.has_experience_certificate ? "Vorhanden" : "Nicht hinterlegt",
          )}
          {info("Erfahrung / Zertifikate", employee.experience_details ?? "")}
        </div>

        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          Diese Angaben stammen direkt aus Ihrer Personalakte und sind mit Ihrem Mitarbeiterkonto verknüpft.
          Wenn etwas nicht stimmt, wenden Sie sich bitte an die Verwaltung.
        </div>
      </div>

      <LoginMethodsCard />
    </div>
  );
}

function CompanyProfil() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  const [smallBusiness, setSmallBusiness] = useState(false);

  const { data } = useQuery({
    queryKey: ["company_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!data) return;
    const next: Record<string, string> = {};
    for (const key of ALL_KEYS) next[key] = String((data as Record<string, unknown>)[key] ?? "");
    setForm(next);
    setSmallBusiness(Boolean((data as Record<string, unknown>)["small_business"]));
  }, [data]);

  const logoSrc = useFileUrl(form["logo_url"]);

  const save = useMutation({
    mutationFn: async (override?: Record<string, string>) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const payload = {
        ...form,
        ...(override ?? {}),
        payment_terms_days: Number(form["payment_terms_days"] || 14),
        small_business: smallBusiness,
        user_id: userId,
      };
      const { error } = await supabase
        .from("company_settings")
        .upsert(payload as never, { onConflict: "user_id" });
      if (error) throw error;
    },

    onSuccess: () => {
      toast.success("Firmendaten gespeichert");
      queryClient.invalidateQueries({ queryKey: ["company_settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mein Profil & Firmendaten</h1>
        <p className="mt-1 text-muted-foreground">
          Diese Angaben erscheinen im Kopf und im Fußbereich jeder Rechnung und jedes Angebots.
        </p>
      </div>

      {GROUPS.map((group) => (
        <div key={group.title} className="surface space-y-4 p-6">
          <h2 className="font-display text-lg font-semibold">{group.title}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {group.fields.map((f) => (
              <div key={f.key} className="space-y-2">
                <Label htmlFor={f.key}>{f.label}</Label>
                <Input
                  id={f.key}
                  value={form[f.key] ?? ""}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              </div>
            ))}
          </div>
          {group.title === "Steuerliche Angaben" && (
            <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
              <Checkbox
                id="small_business"
                checked={smallBusiness}
                onCheckedChange={(v) => setSmallBusiness(v === true)}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="small_business">Kleinunternehmer nach § 19 UStG</Label>
                <p className="text-sm text-muted-foreground">
                  Wenn aktiv, wird auf Rechnungen und Angeboten keine Umsatzsteuer berechnet oder
                  ausgewiesen. Der Pflichthinweis „Gemäß § 19 UStG wird keine Umsatzsteuer
                  berechnet." erscheint automatisch am Ende des Belegs.
                </p>
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="surface space-y-4 p-6">
        <div>
          <h2 className="font-display text-lg font-semibold">Firmenlogo</h2>
          <p className="text-sm text-muted-foreground">
            Das Logo erscheint in der Kopfzeile des Programms sowie oben auf Rechnungen, Angeboten
            und im PDF.
          </p>
        </div>
        {logoSrc && (
          <img
            src={logoSrc}
            alt="Firmenlogo"
            className="h-16 w-auto rounded-md border bg-card p-2"
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <FileUploadButton
            folder="logo"
            accept="image/*"
            label="Logo hochladen"
            onUploaded={(path) => {
              setForm((f) => ({ ...f, logo_url: path }));
              save.mutate({ logo_url: path });
            }}
          />
          {form["logo_url"] && (
            <Button
              variant="ghost"
              onClick={() => {
                setForm((f) => ({ ...f, logo_url: "" }));
                save.mutate({ logo_url: "" });
              }}
            >
              Logo entfernen
            </Button>
          )}
        </div>
      </div>

      <Button onClick={() => save.mutate(undefined)} disabled={save.isPending}>
        Speichern
      </Button>

      <LoginMethodsCard />
    </div>
  );
}
