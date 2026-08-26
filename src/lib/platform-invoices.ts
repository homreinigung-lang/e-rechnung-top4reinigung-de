import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchPlatformSettingsAdmin } from "@/lib/platform-payment";
import { buildPlatformInvoicePdfBytes } from "@/lib/platform-invoice-pdf";
import { reserveDocumentNumber } from "@/lib/doc-number";
import { saveFile } from "@/lib/download";
import { VAT_RATE } from "@/lib/plan-orders";
import type { Plan } from "@/lib/admin";
import type { Subscription } from "@/lib/subscriptions";

export type PlatformInvoiceInput = {
  subscription: Subscription & { address_line?: string; postal_code?: string };
  plan: Plan | undefined;
  billingInterval: "monthly" | "yearly";
  periodStart: string;
  periodEnd: string;
};

/** Nettopreis des Pakets für die gewählte Laufzeit (in Cent). */
export function planNetCents(plan: Plan | undefined, interval: "monthly" | "yearly"): number {
  if (!plan) return 0;
  return interval === "yearly" ? plan.price_yearly_cents : plan.price_monthly_cents;
}

export const intervalLabel: Record<string, string> = {
  monthly: "monatlich",
  yearly: "jährlich",
};

/**
 * Erstellt eine offizielle Rechnung an einen Abo-Kunden:
 * 1. fortlaufende Rechnungsnummer reservieren,
 * 2. Beleg in `documents` anlegen (damit die Einnahme in EÜR, Finanz-Dashboard
 *    und Steuerberater-Auswertung erscheint),
 * 3. Eintrag in `platform_invoices` speichern,
 * 4. PDF erzeugen und zum Download anbieten.
 */
export function useCreatePlatformInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PlatformInvoiceInput) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Nicht angemeldet");

      const payment = await fetchPlatformSettingsAdmin();
      const netCents = planNetCents(input.plan, input.billingInterval);
      if (netCents <= 0) throw new Error("Für dieses Paket ist kein Preis hinterlegt.");
      const vatCents = Math.round(netCents * VAT_RATE);
      const grossCents = netCents + vatCents;

      const number = await reserveDocumentNumber("invoice");
      const issueDate = new Date().toISOString().slice(0, 10);
      const planName = input.plan?.name || input.subscription.plan;
      const label = intervalLabel[input.billingInterval] ?? input.billingInterval;
      const sub = input.subscription;

      // 1) Beleg als Betriebseinnahme erfassen
      const { data: doc, error: docError } = await supabase
        .from("documents")
        .insert({
          user_id: uid,
          type: "invoice",
          number,
          status: "sent",
          issue_date: issueDate,
          customer_name: sub.company_name,
          customer_company: sub.company_name,
          customer_email: sub.contact_email ?? "",
          customer_address_line: sub.address_line ?? "",
          customer_postal_code: sub.postal_code ?? "",
          customer_city: sub.city ?? "",
          tax_mode: "standard",
          vat_rate: VAT_RATE * 100,
          service_period: `${input.periodStart} – ${input.periodEnd}`,
          service_description: `${planName} (${label})`,
          net_total: netCents / 100,
          vat_amount: vatCents / 100,
          total: grossCents / 100,
          locked_at: new Date().toISOString(),
          sent_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (docError) throw docError;

      const { error: itemError } = await supabase.from("document_items").insert({
        document_id: doc.id,
        user_id: uid,
        position: 1,
        description: `${planName} (${label}) – Leistungszeitraum ${input.periodStart} bis ${input.periodEnd}`,
        quantity: 1,
        unit: "Pauschal",
        unit_price: netCents / 100,
      });
      if (itemError) throw itemError;

      // 2) Plattform-Rechnung speichern
      const { error: invError } = await supabase.from("platform_invoices").insert({
        number,
        issue_date: issueDate,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        subscription_id: sub.id,
        customer_user_id: sub.user_id,
        customer_company: sub.company_name,
        customer_address_line: sub.address_line ?? "",
        customer_postal_code: sub.postal_code ?? "",
        customer_city: sub.city ?? "",
        plan_code: input.plan?.code ?? sub.plan,
        plan_name: planName,
        billing_interval: input.billingInterval,
        net_cents: netCents,
        vat_cents: vatCents,
        gross_cents: grossCents,
        document_id: doc.id,
        created_by: uid,
      });
      if (invError) throw invError;

      // 3) PDF erzeugen und herunterladen
      const bytes = await buildPlatformInvoicePdfBytes({
        number,
        issueDate,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        customerCompany: sub.company_name,
        customerAddressLine: sub.address_line ?? "",
        customerPostalCode: sub.postal_code ?? "",
        customerCity: sub.city ?? "",
        planName,
        intervalLabel: label,
        netCents,
        vatCents,
        grossCents,
        payment,
      });
      await saveFile(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), `${number}.pdf`);

      return { number };
    },
    onSuccess: ({ number }) => {
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      void queryClient.invalidateQueries({ queryKey: ["platform_invoices"] });
      toast.success(`Rechnung ${number} erstellt`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
