import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Lock } from "lucide-react";
import { PasswordInput } from "@/components/PasswordInput";

import { openPicker } from "./shared";

import { AccountantPortalExports } from "./AccountantPortalExports";
import type { AccountantPortalState } from "./useAccountantPortalState";
export function AccountantPortalView({ state }: { state: AccountantPortalState }) {
  const { code, data, from, report, setCode, setFrom, setTo, to, year } = state;
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <header className="no-print">
        <h1 className="font-display text-2xl font-semibold">
          Steuerberater-Zugang {data?.companyName ? `– ${data.companyName}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          Nur-Lese-Zugriff auf Rechnungen, Ausgaben und Stundenzettel inkl. Exporte. Ausschließlich
          DATEV-Einstellungen dürfen bearbeitet werden.
        </p>
      </header>

      <section className="no-print grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="code">Zugangspasswort</Label>
          <PasswordInput
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="z. B. A1B2"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="from">Zeitraum von</Label>
          <Input
            id="from"
            type="date"
            lang="de-DE"
            dir="ltr"
            max={to || undefined}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            onClick={(e) => openPicker(e.currentTarget)}
            className="w-full"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">Zeitraum bis</Label>
          <Input
            id="to"
            type="date"
            lang="de-DE"
            dir="ltr"
            min={from || undefined}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            onClick={(e) => openPicker(e.currentTarget)}
            className="w-full"
          />
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-3">
          {[1, 2, 3, 4].map((q) => (
            <Button
              key={q}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const startMonth = (q - 1) * 3;
                const start = new Date(Date.UTC(year, startMonth, 1));
                const end = new Date(Date.UTC(year, startMonth + 3, 0));
                setFrom(start.toISOString().slice(0, 10));
                setTo(end.toISOString().slice(0, 10));
              }}
            >
              Q{q} {year}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setFrom(`${year}-01-01`);
              setTo(`${year}-12-31`);
            }}
          >
            Gesamtes Jahr {year}
          </Button>
        </div>
        <div className="sm:col-span-3">
          <Button onClick={() => report.mutate()} disabled={report.isPending || !code}>
            <Lock className="size-4" /> {report.isPending ? "Lädt…" : "Daten laden"}
          </Button>
        </div>
      </section>

      <AccountantPortalExports state={state} />
    </main>
  );
}
