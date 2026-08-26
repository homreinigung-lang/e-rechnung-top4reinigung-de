import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2 } from "lucide-react";
import { euro, type Plan } from "@/lib/admin";
import {
  TRIAL_DAYS,
  calcTotals,
  planAllowsReverseCharge,
  useCreatePlanOrder,
  type OrderResult,
} from "@/lib/plan-orders";

type Props = {
  plan: Plan | null;
  onOpenChange: (open: boolean) => void;
};

const emptyForm = {
  companyName: "",
  contactName: "",
  email: "",
  phone: "",
  addressLine: "",
  postalCode: "",
  city: "",
  country: "DE",
  vatId: "",
  note: "",
};

import { usePlatformPayment, PLATFORM_PAYMENT_FALLBACK, formatIban } from "@/lib/platform-payment";

export function PlanOrderDialog({ plan, onOpenChange }: Props) {
  const { data: pay = PLATFORM_PAYMENT_FALLBACK } = usePlatformPayment();
  const [form, setForm] = useState(emptyForm);
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [result, setResult] = useState<OrderResult | null>(null);
  const createOrder = useCreatePlanOrder();

  const set = (key: keyof typeof emptyForm) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const totals = plan ? calcTotals(plan, interval, form.country, form.vatId) : null;

  function close(open: boolean) {
    if (!open) {
      setForm(emptyForm);
      setInterval("monthly");
      setResult(null);
    }
    onOpenChange(open);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!plan) return;
    if (!form.companyName.trim() || !form.email.trim() || !form.addressLine.trim()) {
      toast.error("Bitte Firma, E-Mail und Adresse ausfüllen.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      toast.error("Bitte eine gültige E-Mail-Adresse angeben.");
      return;
    }
    try {
      const res = await createOrder.mutateAsync({ plan, billingInterval: interval, ...form });
      setResult(res);
      toast.success("Bestellung eingegangen");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bestellung fehlgeschlagen");
    }
  }

  return (
    <Dialog open={Boolean(plan)} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {plan && !result ? (
          <>
            <DialogHeader>
              <DialogTitle>Paket „{plan.name}" bestellen</DialogTitle>
              <DialogDescription>
                {TRIAL_DAYS} Tage kostenlos testen – die Rechnung folgt erst nach der Testphase.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={submit} className="space-y-4">
              <div className="flex gap-2">
                {(["monthly", "yearly"] as const).map((i) => (
                  <Button
                    key={i}
                    type="button"
                    variant={interval === i ? "default" : "secondary"}
                    size="sm"
                    onClick={() => setInterval(i)}
                  >
                    {i === "monthly"
                      ? `${euro(plan.price_monthly_cents)} / Monat`
                      : `${euro(plan.price_yearly_cents)} / Jahr`}
                  </Button>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Firma *" value={form.companyName} onChange={set("companyName")} />
                <Field
                  label="Ansprechpartner"
                  value={form.contactName}
                  onChange={set("contactName")}
                />
                <Field label="E-Mail *" type="email" value={form.email} onChange={set("email")} />
                <Field label="Telefon" value={form.phone} onChange={set("phone")} />
                <div className="sm:col-span-2">
                  <Field
                    label="Straße und Hausnummer *"
                    value={form.addressLine}
                    onChange={set("addressLine")}
                  />
                </div>
                <Field label="PLZ" value={form.postalCode} onChange={set("postalCode")} />
                <Field label="Ort" value={form.city} onChange={set("city")} />
                <Field label="Land (z. B. DE, AT)" value={form.country} onChange={set("country")} />
                <Field
                  label="USt-IdNr. (EU-Kunden, optional)"
                  value={form.vatId}
                  onChange={set("vatId")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="order-note">Anmerkung</Label>
                <Textarea
                  id="order-note"
                  value={form.note}
                  rows={2}
                  onChange={(e) => set("note")(e.target.value)}
                />
              </div>

              {totals ? (
                <div className="rounded-lg border bg-secondary/40 p-4 text-sm">
                  <Row label="Netto" value={euro(totals.netCents)} />
                  <Row
                    label={totals.vatCents > 0 ? "zzgl. 19 % MwSt." : "Umsatzsteuer"}
                    value={totals.vatCents > 0 ? euro(totals.vatCents) : "0,00 €"}
                  />
                  <Row label="Gesamt" value={euro(totals.grossCents)} strong />
                  {totals.reverseCharge ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Steuerschuldnerschaft des Leistungsempfängers (Reverse-Charge, § 13b UStG).
                    </p>
                  ) : !planAllowsReverseCharge(plan) && form.vatId.trim().length > 3 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Das Reverse-Charge-Verfahren ist erst ab den Paketen Pro und Enterprise
                      verfügbar. Für das Basis-Paket wird die deutsche Umsatzsteuer ausgewiesen.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <Button type="submit" className="w-full" disabled={createOrder.isPending}>
                {createOrder.isPending ? "Wird gesendet …" : "Kostenpflichtig bestellen"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Die ersten {TRIAL_DAYS} Tage sind kostenlos. Zahlung per Rechnung /
                SEPA-Überweisung.
              </p>
            </form>
          </>
        ) : null}

        {plan && result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-primary" />
                Bestellung eingegangen
              </DialogTitle>
              <DialogDescription>
                Bestellnummer <strong>{result.orderNumber}</strong> – wir bestätigen Ihre Bestellung
                per E-Mail an {form.email}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="rounded-lg border bg-secondary/40 p-4">
                <p className="font-semibold">Kostenlose Testphase</p>
                <p className="mt-1 text-muted-foreground">
                  {TRIAL_DAYS} Tage unverbindlich testen. Die erste Rechnung wird erst nach Ablauf
                  der Testphase gestellt.
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="font-semibold">Zahlungsdetails (Rechnung / SEPA-Überweisung)</p>
                <dl className="mt-2 space-y-1">
                  <Row label="Empfänger" value={pay.recipient} />
                  <Row label="IBAN" value={formatIban(pay.iban)} />
                  <Row label="BIC" value={pay.bic} />
                  <Row label="Bank" value={pay.bank} />
                  <Row label="Verwendungszweck" value={result.orderNumber} />
                  <Row label="Netto" value={euro(result.totals.netCents)} />
                  <Row
                    label={result.totals.vatCents > 0 ? "19 % MwSt." : "Umsatzsteuer"}
                    value={euro(result.totals.vatCents)}
                  />
                  <Row label="Rechnungsbetrag" value={euro(result.totals.grossCents)} strong />
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">
                  {result.totals.reverseCharge
                    ? "Steuerschuldnerschaft des Leistungsempfängers (Reverse-Charge, § 13b UStG)."
                    : pay.terms}
                </p>
              </div>
              <Button className="w-full" onClick={() => close(false)}>
                Schließen
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  const id = label.replace(/\W+/g, "-").toLowerCase();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "font-semibold" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
