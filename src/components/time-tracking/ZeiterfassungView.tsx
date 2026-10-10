import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { toast } from "sonner";

import { formatMoney } from "@/lib/format";

import { ZeiterfassungSection2 } from "./ZeiterfassungSection2";
import { ZeiterfassungMitarbeiterZeiterfassung } from "./ZeiterfassungMitarbeiterZeiterfassung";
import type { ZeiterfassungState } from "./useZeiterfassungState";
export function ZeiterfassungView({ state }: { state: ZeiterfassungState }) {
  const { month, reviewCounts, reviewFilter, setMonth, setReviewFilter, totals } = state;
  return (
    <div className="space-y-6">
      <div className="surface space-y-2 p-4">
        <h2 className="font-semibold">So melden sich Mitarbeiter an</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Hier unter „Mitarbeiter“ den Mitarbeiter mit seiner E-Mail-Adresse anlegen.</li>
          <li>
            Mitarbeiter öffnet den Einladungslink, wählt „Registrieren“ und erstellt mit genau
            dieser E-Mail und Ihrem Unternehmens-Code seinen Mitarbeiterzugang.
          </li>
          <li>
            Nach dem Login erscheint der Bereich „Meine Zeiten“ – dort erfasst er nur seine eigenen
            Arbeitszeiten.
          </li>
        </ol>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" asChild>
            <a href="/mitarbeiter-anmeldung" target="_blank" rel="noopener">
              Anmeldeseite öffnen
            </a>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(`${window.location.origin}/auth`);
              toast.success("Registrierungs-Link kopiert");
            }}
          >
            Registrierungs-Link kopieren
          </Button>
        </div>
      </div>

      <ZeiterfassungMitarbeiterZeiterfassung state={state} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface p-5">
          <div className="text-sm text-muted-foreground">Monat</div>
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="mt-2"
          />
        </div>
        <div className="surface p-5">
          <div className="text-sm text-muted-foreground">Freigegebene Arbeitsstunden</div>
          <div className="mt-2 text-2xl font-bold">{totals.hours.toFixed(2)} Std.</div>
        </div>
        <div className="surface p-5">
          <div className="text-sm text-muted-foreground">
            Freigegebener Lohnwert (Stunden × Satz)
          </div>
          <div className="mt-2 text-2xl font-bold">{formatMoney(totals.amount)}</div>
        </div>
      </div>

      <section className="surface space-y-3 p-5" aria-label="Arbeitszeiten prüfen">
        <h2 className="text-lg font-semibold">Prüfung der Arbeitszeiten</h2>
        <p className="text-sm text-muted-foreground">
          Freigaben für Arbeitszeiten; Urlaubs- und Abwesenheitsanträge bleiben im bestehenden
          Antragsbereich. Ein offener Leistungsnachweis ist ein Hinweis und nicht automatisch eine
          Pflicht.
        </p>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Zu prüfen</div>
            <div className="text-xl font-bold">{reviewCounts.pending}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Freigegeben</div>
            <div className="text-xl font-bold">{reviewCounts.approved}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Abgelehnt</div>
            <div className="text-xl font-bold">{reviewCounts.rejected}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Leistungsnachweis offen</div>
            <div className="text-xl font-bold">{reviewCounts.proofOpen}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Arbeitszeiten filtern">
          {(
            [
              ["all", "Alle"],
              ["pending", "Zu prüfen"],
              ["approved", "Freigegeben"],
              ["rejected", "Abgelehnt"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={reviewFilter === value ? "default" : "outline"}
              onClick={() => setReviewFilter(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </section>

      {totals.perEmployee.length > 0 && (
        <div className="surface p-5">
          <h2 className="text-lg font-semibold">Freigegebene Summen je Mitarbeiter</h2>
          <ul className="mt-3 divide-y">
            {totals.perEmployee.map(([name, v]) => (
              <li key={name} className="flex items-center justify-between py-2 text-sm">
                <span>{name}</span>
                <span className="text-muted-foreground">
                  {v.hours.toFixed(2)} Std. · {formatMoney(v.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ZeiterfassungSection2 state={state} />
    </div>
  );
}
