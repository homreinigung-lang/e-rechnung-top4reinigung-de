import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GiroCode } from "@/components/GiroCode";
import { buildEpcPayload } from "@/lib/epc";
import { euro } from "@/lib/admin";
import { VAT_RATE } from "@/lib/plan-orders";
import { usePlatformPayment, PLATFORM_PAYMENT_FALLBACK, formatIban } from "@/lib/platform-payment";
import { buildProformaPdfBytes } from "@/lib/proforma-pdf";
import { downloadBytes } from "@/lib/pdf";

export type RenewalPaymentInfo = {
  title: string;
  description: string;
  reference: string;
  companyName: string;
  planName: string;
  intervalLabel: string;
  netCents: number;
};

export function RenewalPaymentDialog({
  info,
  onOpenChange,
}: {
  info: RenewalPaymentInfo | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: pay = PLATFORM_PAYMENT_FALLBACK } = usePlatformPayment();
  const [copied, setCopied] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const netCents = info?.netCents ?? 0;
  const vatCents = Math.round(netCents * VAT_RATE);
  const grossCents = netCents + vatCents;

  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? "" : c)), 1500);
      toast.success("Kopiert");
    } catch {
      toast.error("Kopieren nicht möglich");
    }
  }

  async function openPdf(download: boolean) {
    if (!info) return;
    setBusy(true);
    try {
      const bytes = await buildProformaPdfBytes({
        reference: info.reference,
        companyName: info.companyName,
        planName: info.planName,
        intervalLabel: info.intervalLabel,
        netCents,
        vatCents,
        grossCents,
        payment: pay,
      });
      const filename = `Zahlungsaufforderung-${info.reference}.pdf`;
      if (download) {
        downloadBytes(bytes, filename);
      } else {
        const url = URL.createObjectURL(
          new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" }),
        );
        window.open(url, "_blank", "noopener");
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
    } catch {
      toast.error("PDF konnte nicht erzeugt werden");
    } finally {
      setBusy(false);
    }
  }

  const rows: { key: string; label: string; value: string }[] = info
    ? [
        { key: "recipient", label: "Empfänger", value: pay.recipient },
        { key: "iban", label: "IBAN", value: formatIban(pay.iban) },
        { key: "bic", label: "BIC", value: pay.bic },
        { key: "bank", label: "Bank", value: pay.bank },
        { key: "amount", label: "Betrag", value: euro(grossCents) },
        { key: "reference", label: "Verwendungszweck", value: info.reference },
      ]
    : [];

  const qr = info
    ? buildEpcPayload({
        name: pay.recipient,
        iban: pay.iban,
        bic: pay.bic,
        amount: grossCents / 100,
        reference: info.reference,
      })
    : null;

  return (
    <Dialog open={Boolean(info)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {info ? (
          <>
            <DialogHeader>
              <DialogTitle>{info.title}</DialogTitle>
              <DialogDescription>{info.description}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              <div className="rounded-lg border">
                {rows.map((r) => (
                  <div
                    key={r.key}
                    className="flex items-center justify-between gap-3 border-b p-3 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{r.label}</p>
                      <p className="truncate font-medium">{r.value}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`${r.label} kopieren`}
                      onClick={() => copy(r.key, r.value)}
                    >
                      {copied === r.key ? (
                        <Check className="size-4 text-primary" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border bg-secondary/40 p-3 text-xs text-muted-foreground">
                <p>
                  {info.planName} · {info.intervalLabel} · Netto {euro(netCents)} zzgl.{" "}
                  {euro(vatCents)} MwSt.
                </p>
                <p className="mt-1">{pay.terms}</p>
              </div>

              {qr ? (
                <div className="flex justify-center">
                  <GiroCode payload={qr} />
                </div>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  disabled={busy}
                  onClick={() => openPdf(false)}
                >
                  <FileText className="size-4" />
                  Proforma ansehen
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  disabled={busy}
                  onClick={() => openPdf(true)}
                >
                  PDF herunterladen
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
