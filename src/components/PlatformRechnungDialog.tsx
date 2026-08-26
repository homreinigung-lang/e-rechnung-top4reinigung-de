import { useState } from "react";
import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePlans, euro } from "@/lib/admin";
import { VAT_RATE } from "@/lib/plan-orders";
import { planNetCents, useCreatePlatformInvoice } from "@/lib/platform-invoices";
import type { Subscription } from "@/lib/subscriptions";

/** Ende eines Zeitraums ab Startdatum um n Monate. */
function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Erstellt eine offizielle Rechnung (kein Proforma) an einen Abo-Kunden,
 * speichert sie in `platform_invoices` und erfasst sie als Betriebseinnahme.
 */
export function PlatformRechnungDialog({ subscription }: { subscription: Subscription }) {
  const { data: plans = [] } = usePlans();
  const create = useCreatePlatformInvoice();
  const [open, setOpen] = useState(false);
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const today = new Date().toISOString().slice(0, 10);
  const [periodStart, setPeriodStart] = useState(today);
  const [periodEnd, setPeriodEnd] = useState(addMonths(today, 1));

  const plan = plans.find((p) => p.code.toLowerCase() === (subscription.plan || "").toLowerCase());
  const netCents = planNetCents(plan, interval);
  const vatCents = Math.round(netCents * VAT_RATE);

  function changeInterval(v: "monthly" | "yearly") {
    setInterval(v);
    setPeriodEnd(addMonths(periodStart, v === "yearly" ? 12 : 1));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <FileText className="size-4" />
          Rechnung erstellen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rechnung erstellen</DialogTitle>
          <DialogDescription>
            Offizielle Rechnung für {subscription.company_name || "diese Firma"} – wird als
            Betriebseinnahme in der EÜR erfasst.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Abrechnungszeitraum</Label>
            <Select value={interval} onValueChange={(v) => changeInterval(v as "monthly")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monatlich</SelectItem>
                <SelectItem value="yearly">Jährlich</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pi-plan">Paket</Label>
            <Input id="pi-plan" value={plan?.name ?? subscription.plan} readOnly />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pi-start">Leistung von</Label>
            <Input
              id="pi-start"
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pi-end">Leistung bis</Label>
            <Input
              id="pi-end"
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1 rounded-md border border-border p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Netto</span>
            <span>{euro(netCents)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">zzgl. 19 % MwSt.</span>
            <span>{euro(vatCents)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Rechnungsbetrag</span>
            <span>{euro(netCents + vatCents)}</span>
          </div>
        </div>

        {netCents <= 0 ? (
          <p className="text-xs text-destructive">
            Für dieses Paket ist kein Preis hinterlegt – bitte zuerst in „Pakete“ pflegen.
          </p>
        ) : null}

        <DialogFooter>
          <Button
            disabled={create.isPending || netCents <= 0}
            onClick={() =>
              create.mutate(
                {
                  subscription,
                  plan,
                  billingInterval: interval,
                  periodStart,
                  periodEnd,
                },
                { onSuccess: () => setOpen(false) },
              )
            }
          >
            {create.isPending ? "Wird erstellt …" : "Rechnung erstellen & PDF laden"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
