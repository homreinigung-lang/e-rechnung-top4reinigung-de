import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Landmark } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/bankverbindung")({
  head: () => ({
    meta: [
      { title: "Bankverbindung – HomR" },
      {
        name: "description",
        content:
          "Bankdaten für Rechnungen hinterlegen: Kontoinhaber, IBAN und BIC für GiroCode und Zahlungen.",
      },
      { property: "og:title", content: "Bankverbindung – HomR" },
      {
        property: "og:description",
        content: "Bankdaten für Rechnungen und GiroCode verwalten.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BankverbindungPage,
});

type BankForm = {
  bank_name: string;
  iban: string;
  bic: string;
  owner_name: string;
};

function BankverbindungPage() {
  const queryClient = useQueryClient();

  const [form, setForm] = useState<BankForm>({
    bank_name: "",
    iban: "",
    bic: "",
    owner_name: "",
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ["company_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      setForm({
        bank_name: settings.bank_name ?? "",
        iban: settings.iban ?? "",
        bic: settings.bic ?? "",
        owner_name: settings.owner_name ?? "",
      });
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      if (!settings?.id) throw new Error("Keine Firmendaten gefunden.");
      const { error } = await supabase
        .from("company_settings")
        .update({
          bank_name: form.bank_name,
          iban: form.iban.replace(/\s+/g, "").toUpperCase(),
          bic: form.bic.replace(/\s+/g, "").toUpperCase(),
          owner_name: form.owner_name,
        })
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bankverbindung gespeichert");
      void queryClient.invalidateQueries({ queryKey: ["company_settings"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Landmark className="size-6 text-primary" />
        <div>
          <h1 className="font-display text-2xl font-semibold">Bankverbindung</h1>
          <p className="text-sm text-muted-foreground">
            Diese Daten erscheinen auf Rechnungen und im GiroCode (QR-Code).
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bankdaten</CardTitle>
          <CardDescription>Kontoinhaber, IBAN und BIC für Zahlungen Ihrer Kunden.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="owner_name">Kontoinhaber</Label>
            <Input
              id="owner_name"
              value={form.owner_name}
              onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
              placeholder="Hom Reinigung Service"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bank_name">Bank</Label>
            <Input
              id="bank_name"
              value={form.bank_name}
              onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
              placeholder="Sparkasse Saarbrücken"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bic">BIC</Label>
            <Input
              id="bic"
              value={form.bic}
              onChange={(e) => setForm({ ...form, bic: e.target.value })}
              placeholder="SAKSDE55XXX"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="iban">IBAN</Label>
            <Input
              id="iban"
              value={form.iban}
              onChange={(e) => setForm({ ...form, iban: e.target.value })}
              placeholder="DE00 0000 0000 0000 0000 00"
            />
          </div>
          <div className="sm:col-span-2">
            <Button onClick={() => save.mutate()} disabled={isLoading || save.isPending}>
              {save.isPending ? "Speichern…" : "Speichern"}
            </Button>
          </div>
          <p className="sm:col-span-2 text-sm text-muted-foreground">
            Zahlungseingänge werden manuell verwaltet: Rechnungen können in der Belegübersicht
            direkt als bezahlt markiert werden.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
