import { createFileRoute } from "@tanstack/react-router";
import { PlatformBankdatenCard } from "@/components/PlatformBankdatenCard";

export const Route = createFileRoute("/_authenticated/admin/zahlung")({
  component: AdminZahlungPage,
});

function AdminZahlungPage() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Diese Bankdaten erscheinen in allen Zahlungsaufforderungen, im Zahlungs-Modal,
        im GiroCode-QR und in der Proforma-Rechnung.
      </p>
      <PlatformBankdatenCard />
    </div>
  );
}
