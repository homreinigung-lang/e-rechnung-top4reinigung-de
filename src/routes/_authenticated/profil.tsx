import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useFileUrl } from "@/hooks/useFileUrl";
import { FileUploadButton } from "@/components/FileUploadButton";


export const Route = createFileRoute("/_authenticated/profil")({
  head: () => ({
    meta: [
      { title: "Firmendaten – CleanInvoice" },
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
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});

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
    </div>
  );
}
