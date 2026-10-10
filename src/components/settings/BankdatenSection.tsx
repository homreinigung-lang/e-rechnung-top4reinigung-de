import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

import { PlatformBankdatenCard } from "@/components/PlatformBankdatenCard";
import { useIsAdmin } from "@/lib/subscriptions";
import { Landmark } from "lucide-react";

export function BankdatenSection() {
  const { data: isAdmin } = useIsAdmin();
  return (
    <div className="space-y-4">
      <div className="surface flex flex-wrap items-center justify-between gap-3 p-6">
        <div className="flex items-start gap-3">
          <Landmark className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="space-y-1">
            <h2 className="font-display text-lg font-semibold">Bankverbindung</h2>
            <p className="text-sm text-muted-foreground">
              IBAN, BIC und Kontoinhaber für Ihre eigenen Rechnungen und den GiroCode pflegen.
            </p>
          </div>
        </div>
        <Button asChild>
          <Link to="/bankverbindung">Bankdaten öffnen & ändern</Link>
        </Button>
      </div>

      {isAdmin ? (
        <PlatformBankdatenCard />
      ) : (
        <div className="surface p-6">
          <h2 className="font-display text-lg font-semibold">Plattform-Bankdaten</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Die Bankdaten für Paket-Zahlungen und Proforma-Rechnungen werden zentral durch die
            Plattform-Administration gepflegt. Wenden Sie sich an den Support, falls eine Änderung
            nötig ist.
          </p>
        </div>
      )}
    </div>
  );
}
