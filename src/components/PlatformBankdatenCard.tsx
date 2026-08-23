import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Landmark } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  usePlatformPayment,
  PLATFORM_PAYMENT_FALLBACK,
  PLATFORM_SETTINGS_ID,
  formatIban,
  isValidIban,
  normalizeIban,
  type PlatformPayment,
} from "@/lib/platform-payment";

/**
 * Pflegt die Bankdaten des Plattform-Betreibers (Tabelle platform_settings).
 * Diese Daten erscheinen in allen Zahlungsaufforderungen, im Zahlungs-Modal,
 * im GiroCode-QR und in der Proforma-Rechnung.
 *
 * Schreibzugriff ist per RLS auf Administratoren beschränkt; das Formular wird
 * daher nur für Admins eingeblendet.
 */
export function PlatformBankdatenCard() {
  const queryClient = useQueryClient();
  const { data, isLoading } = usePlatformPayment();
  const [form, setForm] = useState<PlatformPayment>(PLATFORM_PAYMENT_FALLBACK);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const ibanOk = form.iban.trim() === "" || isValidIban(form.iban);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        id: PLATFORM_SETTINGS_ID,
        recipient: form.recipient.trim(),
        iban: normalizeIban(form.iban),
        bic: form.bic.replace(/\s+/g, "").toUpperCase(),
        bank: form.bank.trim(),
        terms: form.terms.trim(),
        vat_id: form.vat_id.trim(),
        email: form.email.trim(),
      };
      const { error } = await supabase
        .from("platform_settings")
        .upsert(payload, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform_settings"] });
      toast.success("Bankdaten gespeichert");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function field(key: keyof PlatformPayment, label: string, placeholder = "") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`pb-${key}`}>{label}</Label>
        <Input
          id={`pb-${key}`}
          value={form[key]}
          placeholder={placeholder}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        />
      </div>
    );
  }

  return (
    <div className="surface space-y-4 p-6">
      <div className="flex items-start gap-3">
        <Landmark className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="space-y-1">
          <h2 className="font-display text-lg font-semibold">Bankdaten der Plattform</h2>
          <p className="text-sm text-muted-foreground">
            Diese Bankdaten erscheinen in allen Zahlungsaufforderungen, im Zahlungs-Modal,
            im GiroCode-QR und in der Proforma-Rechnung (z. B. Paket-Verlängerung).
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Wird geladen …</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("recipient", "Empfänger / Kontoinhaber", "GebCalc – Rechnungssystem")}
            {field("bank", "Bankname", "Sparkasse Saarbrücken")}
            <div className="space-y-1.5">
              <Label htmlFor="pb-iban">IBAN</Label>
              <Input
                id="pb-iban"
                value={form.iban}
                placeholder="DE12 3456 7890 1234 5678 90"
                onChange={(e) => setForm((f) => ({ ...f, iban: e.target.value }))}
                aria-invalid={!ibanOk}
              />
              {form.iban.trim() !== "" && (
                <p className={ibanOk ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
                  {ibanOk ? `Gültig: ${formatIban(form.iban)}` : "IBAN-Prüfsumme ungültig"}
                </p>
              )}
            </div>
            {field("bic", "BIC", "SAKSDE55XXX")}
            {field("vat_id", "USt-IdNr.", "DE123456789")}
            {field("email", "Kontakt-E-Mail", "info@example.de")}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pb-terms">Zahlungsbedingungen</Label>
            <Textarea
              id="pb-terms"
              rows={2}
              value={form.terms}
              onChange={(e) => setForm((f) => ({ ...f, terms: e.target.value }))}
            />
          </div>

          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !ibanOk || form.iban.trim() === ""}
          >
            {save.isPending ? "Wird gespeichert …" : "Bankdaten speichern"}
          </Button>
          {form.iban.trim() === "" && (
            <p className="text-xs text-muted-foreground">
              Ohne hinterlegte IBAN wird im Zahlungs-Modal keine gültige Bankverbindung angezeigt.
            </p>
          )}
        </>
      )}
    </div>
  );
}
