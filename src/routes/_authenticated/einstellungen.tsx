import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/einstellungen")({
  head: () => ({
    meta: [
      { title: "Einstellungen – Firmendaten & Bankverbindung" },
      {
        name: "description",
        content: "Firmenname, Anschrift, USt-IdNr. und Bankdaten für Rechnungen hinterlegen.",
      },
      { property: "og:title", content: "Einstellungen – Firmendaten" },
      { property: "og:description", content: "Stammdaten der Reinigungsfirma pflegen." },
    ],
  }),
  component: Einstellungen,
});

const FIELDS = [
  { key: "company_name", label: "Firmenname" },
  { key: "owner_name", label: "Inhaber" },
  { key: "email", label: "E-Mail" },
  { key: "phone", label: "Telefon" },
  { key: "address_line", label: "Straße und Hausnummer" },
  { key: "postal_code", label: "PLZ" },
  { key: "city", label: "Ort" },
  { key: "country", label: "Land" },
  { key: "vat_id", label: "USt-IdNr." },
  { key: "tax_number", label: "Steuernummer" },
  { key: "bank_name", label: "Bank" },
  { key: "iban", label: "IBAN" },
  { key: "bic", label: "BIC" },
  { key: "payment_terms_days", label: "Zahlungsziel (Tage)" },
] as const;

function Einstellungen() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  const [footer, setFooter] = useState("");

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
    for (const f of FIELDS) next[f.key] = String((data as Record<string, unknown>)[f.key] ?? "");
    setForm(next);
    setFooter(String(data.footer_note ?? ""));
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const payload = {
        ...form,
        payment_terms_days: Number(form["payment_terms_days"] || 14),
        footer_note: footer,
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
        <h1 className="text-3xl font-bold">Einstellungen</h1>
        <p className="mt-1 text-muted-foreground">
          Diese Angaben erscheinen auf jeder Rechnung und jedem Angebot.
        </p>
      </div>

      <div className="surface space-y-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
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
        <div className="space-y-2">
          <Label htmlFor="footer">Fußzeile</Label>
          <Textarea id="footer" value={footer} onChange={(e) => setFooter(e.target.value)} />
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Speichern
        </Button>
      </div>
    </div>
  );
}
