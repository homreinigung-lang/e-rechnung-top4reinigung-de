import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, Info, Sparkles } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePlans, euro } from "@/lib/admin";
import { planLabel, statusLabel, type Subscription } from "@/lib/subscriptions";
import { usePlatformPayment, PLATFORM_PAYMENT_FALLBACK, formatIban } from "@/lib/platform-payment";
import {
  extraEmployeeCents,
  extraEmployees,
  monthlyPriceCents,
  EXTRA_EMPLOYEE_CENTS,
  PRO_INCLUDED_EMPLOYEES,
} from "@/lib/plan-orders";
import { RenewalPaymentDialog, type RenewalPaymentInfo } from "@/components/RenewalPaymentDialog";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/mein-paket")({
  head: () => ({
    meta: [
      { title: "Mein Paket – GebCalc" },
      {
        name: "description",
        content:
          "Aktuelles GebCalc-Paket ansehen, verlängern oder auf ein größeres Paket wechseln.",
      },
      { property: "og:title", content: "Mein Paket – GebCalc" },
      {
        property: "og:description",
        content: "Aktuelles GebCalc-Paket ansehen, verlängern oder upgraden.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MeinPaket,
});

/** Eigenes Abonnement der angemeldeten Firma (RLS: nur eigenes). */
function useMySubscription() {
  return useQuery({
    queryKey: ["my_subscription"],
    queryFn: async (): Promise<Subscription | null> => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return null;
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", uid)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Subscription | null;
    },
  });
}

/** Anzahl aktiver Mitarbeitender der eigenen Firma (für Pro-Aufpreis). */
function useMyEmployeeCount() {
  return useQuery({
    queryKey: ["my_employee_count"],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("active", true);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

const CONTACT = "info@top4reinigung.de";

function requestMail(subject: string, body: string) {
  return `mailto:${CONTACT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function MeinPaket() {
  const { data: pay = PLATFORM_PAYMENT_FALLBACK } = usePlatformPayment();
  const { data: sub, isLoading } = useMySubscription();
  const { data: plans } = usePlans();
  const activePlans = (plans ?? []).filter((p) => p.active);
  const currentCode = sub?.plan ?? "";
  const daysLeft = sub?.renews_on
    ? Math.ceil((new Date(`${sub.renews_on}T00:00:00`).getTime() - Date.now()) / 86_400_000)
    : null;
  const [payment, setPayment] = useState<RenewalPaymentInfo | null>(null);
  const { data: employeeCount = 0 } = useMyEmployeeCount();
  const currentPlan = (plans ?? []).find((p) => p.code === currentCode);
  const extraCount = extraEmployees(currentCode, employeeCount);
  const surchargeCents = extraEmployeeCents(currentCode, employeeCount);

  function openRenewal(title: string, description: string) {
    if (!sub) return;
    const plan = (plans ?? []).find((p) => p.code === sub.plan);
    setPayment({
      title,
      description,
      reference: `VERL-${new Date().getFullYear()}-${sub.id.slice(0, 8).toUpperCase()}`,
      companyName: sub.company_name,
      planName: plan?.name ?? planLabel[sub.plan] ?? sub.plan,
      intervalLabel: "monatlich",
      netCents: plan ? monthlyPriceCents(plan, employeeCount) : 0,
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Mein Paket</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ihre aktuelle Paket-Auswahl, Laufzeit und mögliche Upgrades.
        </p>
      </div>

      <section className="surface p-6">
        <h2 className="text-lg font-semibold">Aktuelles Abonnement</h2>
        {isLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">Wird geladen …</p>
        ) : sub ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Paket</p>
              <p className="text-base font-semibold">{planLabel[sub.plan] ?? sub.plan}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant="secondary">{statusLabel[sub.status] ?? sub.status}</Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Beginn</p>
              <p className="text-base font-semibold">{formatDate(sub.started_on)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Verlängerung</p>
              <p className="text-base font-semibold">
                {sub.renews_on ? formatDate(sub.renews_on) : "—"}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Für Ihr Konto ist derzeit kein Paket hinterlegt. Wählen Sie unten ein Paket aus – wir
            richten es für Sie ein.
          </p>
        )}
        {sub && currentPlan ? (
          <div className="mt-6 rounded-md border border-border p-4 text-sm">
            <p className="font-medium">Monatlicher Preis</p>
            <p className="mt-1 text-muted-foreground">
              Grundpreis {euro(currentPlan.price_monthly_cents)}
              {currentCode === "pro" ? (
                <>
                  {" · "}
                  {employeeCount} aktive Mitarbeitende (inklusive {PRO_INCLUDED_EMPLOYEES})
                  {extraCount > 0
                    ? ` · ${extraCount} × ${euro(EXTRA_EMPLOYEE_CENTS)} Aufpreis = ${euro(surchargeCents)}`
                    : ""}
                </>
              ) : null}
            </p>
            <p className="mt-2 text-base font-semibold">
              {euro(monthlyPriceCents(currentPlan, employeeCount))} / Monat
            </p>
          </div>
        ) : null}
        {sub ? (
          <Button
            variant="secondary"
            className="mt-6"
            onClick={() =>
              openRenewal(
                "Verlängerung – Zahlungsdaten",
                "Bitte überweisen Sie den Betrag per SEPA-Überweisung. Nach Zahlungseingang verlängern wir Ihr Paket manuell.",
              )
            }
          >
            Verlängerung anfragen
          </Button>
        ) : null}
      </section>

      {sub ? (
        <section className="surface p-6">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {sub.status === "trial"
                    ? daysLeft === null
                      ? "Kostenlose Testphase aktiv"
                      : daysLeft >= 0
                        ? `Kostenlose Testphase – noch ${daysLeft} Tage`
                        : "Testphase abgelaufen"
                    : "Verlängerung per Rechnung"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {sub.status === "trial"
                    ? `Sie testen alle Funktionen Ihres Pakets kostenlos bis zum ${sub.renews_on ? formatDate(sub.renews_on) : "—"}. Es erfolgt keine automatische Abbuchung: Zur Weiternutzung senden wir Ihnen eine Rechnung, die Sie bequem per SEPA-Überweisung begleichen. Nach Zahlungseingang schalten wir Ihr Konto manuell frei.`
                    : "Ihre Verlängerung wird per Rechnung abgerechnet. Bitte überweisen Sie den Betrag per SEPA-Überweisung – nach Zahlungseingang verlängern wir Ihr Abonnement manuell."}
                </p>
              </div>

              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">Empfänger: </span>
                  {pay.recipient}
                </p>
                <p>
                  <span className="text-muted-foreground">Bank: </span>
                  {pay.bank}
                </p>
                <p>
                  <span className="text-muted-foreground">IBAN: </span>
                  {formatIban(pay.iban)}
                </p>
                <p>
                  <span className="text-muted-foreground">BIC: </span>
                  {pay.bic}
                </p>
                <p className="sm:col-span-2 text-muted-foreground">{pay.terms}</p>
              </div>

              <Button
                onClick={() =>
                  openRenewal(
                    "Zahlungsaufforderung zur Verlängerung",
                    "Alle Zahlungsdaten auf einen Blick – inklusive Proforma-Rechnung als PDF.",
                  )
                }
              >
                Rechnung zur Verlängerung anfordern
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-lg font-semibold">Verfügbare Pakete</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {activePlans.map((plan) => {
            const isCurrent = plan.code === currentCode;
            return (
              <div
                key={plan.id}
                className={`surface flex flex-col p-6 ${isCurrent ? "ring-2 ring-primary" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold">{plan.name}</h3>
                  {isCurrent ? <Badge>Ihr Paket</Badge> : null}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
                <p className="mt-4 text-2xl font-bold">
                  {euro(plan.price_monthly_cents)}
                  <span className="text-sm font-normal text-muted-foreground"> / Monat</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  oder {euro(plan.price_yearly_cents)} / Jahr
                  {plan.code === "pro" ? " · ab dem 21. Mitarbeitenden +2,50 € / Monat" : ""}
                </p>
                <ul className="mt-4 flex-1 space-y-2 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  className="mt-6"
                  disabled={isCurrent}
                  variant={isCurrent ? "secondary" : "default"}
                >
                  <a
                    href={requestMail(
                      `Upgrade auf Paket ${plan.name}`,
                      `Guten Tag,\n\nwir möchten auf das Paket "${plan.name}" wechseln.\n\nFirma: ${sub?.company_name ?? ""}\n\nVielen Dank`,
                    )}
                  >
                    <Sparkles className="size-4" />
                    {isCurrent ? "Aktuell gebucht" : "Upgrade anfragen"}
                  </a>
                </Button>
              </div>
            );
          })}
          {activePlans.length === 0 ? (
            <p className="text-sm text-muted-foreground">Derzeit sind keine Pakete hinterlegt.</p>
          ) : null}
        </div>
      </section>

      <RenewalPaymentDialog
        info={payment}
        onOpenChange={(open) => {
          if (!open) setPayment(null);
        }}
      />
    </div>
  );
}
