import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { formatMoney } from "@/lib/format";

import { DateiVorschau } from "@/components/DateiVorschau";
import { WiederkehrendeAusgaben } from "@/components/WiederkehrendeAusgaben";

import { FileArchive, Loader2 } from "lucide-react";
import { CATEGORIES } from "./shared";

import { ExpenseRow } from "./ExpenseRow";
import { AusgabenFormular } from "./AusgabenFormular";
import type { AusgabenState } from "./useAusgabenState";
export function AusgabenView({ state }: { state: AusgabenState }) {
  const {
    attachReceipt,
    customFrom,
    customTo,
    exportRows,
    filterYear,
    filteredRows,
    periodFrom,
    periodMode,
    periodTo,
    preview,
    receiptExport,
    remove,
    selectedQuarter,
    setCustomFrom,
    setCustomTo,
    setFilterYear,
    setPeriodMode,
    setPreview,
    setSelectedQuarter,
    totalGross,
    totalNet,
    totalVat,
  } = state;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Ausgaben & Eingangsrechnungen</h1>
        <p className="mt-1 text-muted-foreground">
          Betriebsausgaben erfassen und Vorsteuer sowie Ergebnis auswerten.
        </p>
      </div>

      <AusgabenFormular state={state} />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Ausgaben netto", value: totalNet },
          { label: "Vorsteuer", value: totalVat },
          { label: "Ausgaben brutto", value: totalGross },
        ].map((s) => (
          <div key={s.label} className="surface p-5">
            <div className="text-sm text-muted-foreground">{s.label}</div>
            <div className="mt-2 font-display text-2xl font-semibold">{formatMoney(s.value)}</div>
          </div>
        ))}
      </div>

      <div className="surface space-y-4 p-5">
        <div>
          <h2 className="font-display text-lg font-semibold">Zeitraum & Ausgabenbelege</h2>
          <p className="text-sm text-muted-foreground">
            Liste, Summen und Beleg-Download verwenden immer denselben gewählten Zeitraum.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="filter-year">Jahr</Label>
            <Input
              id="filter-year"
              type="number"
              min="2000"
              max="2100"
              value={filterYear}
              onChange={(e) => setFilterYear(Number(e.target.value))}
              disabled={periodMode === "custom"}
            />
          </div>
          <div className="space-y-1 sm:col-span-2 lg:col-span-3">
            <Label>Zeitraum</Label>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4].map((quarter) => (
                <Button
                  key={quarter}
                  type="button"
                  variant={
                    periodMode === "quarter" && selectedQuarter === quarter ? "default" : "outline"
                  }
                  onClick={() => {
                    setSelectedQuarter(quarter);
                    setPeriodMode("quarter");
                  }}
                >
                  Q{quarter}
                </Button>
              ))}
              <Button
                type="button"
                variant={periodMode === "year" ? "default" : "outline"}
                onClick={() => setPeriodMode("year")}
              >
                Gesamtjahr
              </Button>
              <Button
                type="button"
                variant={periodMode === "custom" ? "default" : "outline"}
                onClick={() => setPeriodMode("custom")}
              >
                Eigener Zeitraum
              </Button>
            </div>
          </div>
          {periodMode === "custom" && (
            <>
              <div className="space-y-1">
                <Label htmlFor="custom-from">Von</Label>
                <Input
                  id="custom-from"
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="custom-to">Bis</Label>
                <Input
                  id="custom-to"
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </div>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => receiptExport.mutate()}
            disabled={receiptExport.isPending || exportRows.length === 0 || periodFrom > periodTo}
          >
            {receiptExport.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileArchive className="size-4" />
            )}
            Alle Belege für Steuerberater herunterladen
          </Button>
          <span className="text-sm text-muted-foreground">
            {exportRows.length === 0
              ? "Keine Ausgaben im gewählten Zeitraum."
              : `${exportRows.length} Ausgaben ausgewählt · ${exportRows.filter((row) => Boolean(row.receipt_url)).length} mit Beleg`}
          </span>
        </div>
      </div>

      <div className="surface overflow-hidden">
        {filteredRows.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            Keine Ausgaben im gewählten Zeitraum.
          </p>
        ) : (
          <ul className="divide-y">
            {filteredRows.map((r) => (
              <ExpenseRow
                key={r.id}
                row={r as never}
                onDelete={() => remove.mutate(r.id)}
                onPreview={(path) => setPreview(path)}
                onAttach={(path) => attachReceipt.mutateAsync({ id: r.id, path })}
              />
            ))}
          </ul>
        )}
      </div>

      <WiederkehrendeAusgaben categories={CATEGORIES} />

      <DateiVorschau path={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
