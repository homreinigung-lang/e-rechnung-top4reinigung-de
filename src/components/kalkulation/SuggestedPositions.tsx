import { AlertTriangle, Sparkles, Trash2 } from "lucide-react";
import { formatMoney, formatNumber, parseGermanNumber } from "@/lib/format";
import { STAIR_RATE_PER_FLOOR, recurrenceUnitLabel } from "@/lib/constants";
import { round2 } from "@/lib/kalkulation-engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { num } from "./shared";
import type { KalkulationStateContext } from "./useKalkulationState";

export function SuggestedPositions({ state }: { state: KalkulationStateContext }) {
  const {
    aiReviewQuestions,
    annualVisits,
    applyKiAnalysis,
    area,
    floors,
    frequency,
    frequencyUnit,
    hourlyRate,
    hours,
    kiBasis,
    kiBasisChanged,
    kiBillingPeriod,
    kiItemChanged,
    kiItems,
    kiOutOfSync,
    kiPositions,
    kiPricingBasis,
    kiTotal,
    lvKiTotal,
    mode,
    patchKiItem,
    pricePerSqm,
    setKiItems,
    visitsPerMonth,
  } = state;
  return (
    <Card className="border-dashed bg-muted/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-5" /> Positionen der KI-Analyse
        </CardTitle>
        <CardDescription>
          Quelle: KI-Analyse (Grundriss/Beschreibung) – für normale Angebote an Endkunden. Diese
          Positionen sind ein Vorschlag und gelangen erst per Klick ins Leistungsverzeichnis.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {kiItems.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            Noch keine KI-Positionen. Auftrag oben beschreiben oder einen Grundriss im Tab
            „Grundriss" analysieren.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="hidden gap-2 px-1 text-xs text-muted-foreground sm:grid sm:grid-cols-[1fr_5rem_6rem_7rem_7rem_2.5rem]">
              <span>Leistung</span>
              <span>Menge</span>
              <span>Einheit</span>
              <span>Einzelpreis</span>
              <span className="text-right">Gesamt</span>
              <span />
            </div>
            {kiItems.map((i) => (
              <div
                key={i.id}
                className="grid gap-2 sm:grid-cols-[1fr_5rem_6rem_7rem_7rem_2.5rem] sm:items-center"
              >
                <Input
                  value={i.description}
                  placeholder="Leistung"
                  onChange={(e) => patchKiItem(i.id, { description: e.target.value })}
                />
                <Input
                  inputMode="decimal"
                  value={i.quantity}
                  onChange={(e) => patchKiItem(i.id, { quantity: e.target.value })}
                />
                <Input
                  value={i.unit}
                  onChange={(e) => patchKiItem(i.id, { unit: e.target.value })}
                />
                <Input
                  inputMode="decimal"
                  value={i.unit_price}
                  onChange={(e) => patchKiItem(i.id, { unit_price: e.target.value })}
                />
                <span className="text-right text-sm tabular-nums">
                  {formatMoney(round2(num(i.quantity) * parseGermanNumber(i.unit_price)))}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Position entfernen"
                  onClick={() => setKiItems((prev) => prev.filter((x) => x.id !== i.id))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <div className="flex justify-between border-t pt-2 text-sm font-medium">
              <span>Summe KI-Analyse (netto)</span>
              <span>{formatMoney(kiTotal)}</span>
            </div>
            {kiItemChanged && (
              <p className="text-xs text-muted-foreground">
                Die KI-Position wurde manuell geändert. Maßgeblich ist die oben angezeigte Summe.
              </p>
            )}
            {kiBasis !== null && !kiItemChanged && (
              <div className="rounded-md border p-3 text-xs text-muted-foreground">
                <p>
                  {kiBillingPeriod === "once"
                    ? "Einmalige Leistung."
                    : "Wiederkehrende Leistung als Monatspauschale."}
                </p>
                {kiPricingBasis === "floor" ? (
                  <p>
                    {formatNumber(num(floors))} Etagen × {formatMoney(STAIR_RATE_PER_FLOOR)} ={" "}
                    {formatMoney(round2(num(floors) * STAIR_RATE_PER_FLOOR))} je Einsatz.
                  </p>
                ) : mode === "area" ? (
                  <>
                    <p>
                      {formatNumber(num(area))} m² × {formatMoney(num(pricePerSqm))}/m² ={" "}
                      {formatMoney(round2(num(area) * num(pricePerSqm)))} je Einsatz.
                    </p>
                    {num(hours) > 0 && (
                      <p>
                        Vergleich: {formatNumber(num(hours))} Std. × {formatMoney(num(hourlyRate))}
                        /Std. = {formatMoney(round2(num(hours) * num(hourlyRate)))} je Einsatz.
                      </p>
                    )}
                  </>
                ) : (
                  <p>
                    {formatNumber(num(hours))} Std. × {formatMoney(num(hourlyRate))}/Std. ={" "}
                    {formatMoney(round2(num(hours) * num(hourlyRate)))} je Einsatz.
                  </p>
                )}
                {kiBillingPeriod === "month" && (
                  <p>
                    {formatNumber(num(frequency))} {recurrenceUnitLabel(frequencyUnit)} ={" "}
                    {formatNumber(annualVisits)} Einsätze/Jahr ÷ 12 = {formatNumber(visitsPerMonth)}{" "}
                    Einsätze im Monatsdurchschnitt.
                  </p>
                )}
                {mode === "area" &&
                  num(hours) > 0 &&
                  Math.abs(num(area) * num(pricePerSqm) - num(hours) * num(hourlyRate)) >
                    0.2 * num(hours) * num(hourlyRate) && (
                    <p className="font-medium text-amber-800 dark:text-amber-300">
                      Flächenpreis und Stundenansatz weichen um mehr als 20 % ab. Preis und Kosten
                      prüfen.
                    </p>
                  )}
              </div>
            )}
          </div>
        )}

        {kiOutOfSync && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/60 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <AlertTriangle className="size-4 shrink-0" />
            <p className="flex-1">
              {lvKiTotal === 0
                ? "Dieser KI-Vorschlag wurde noch nicht ins Angebot übernommen."
                : `Im Leistungsverzeichnis steht für diesen Bereich ${formatMoney(lvKiTotal)} statt ${formatMoney(kiTotal)}.`}
            </p>
          </div>
        )}

        {kiBasisChanged && (
          <p
            role="alert"
            className="rounded-md border border-amber-500/60 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          >
            Fläche, Turnus, Reinigungstyp oder m²-Preis wurden seit der KI-Analyse geändert. Bitte
            die Kalkulation erneut erstellen.
          </p>
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={kiPositions.length === 0 || aiReviewQuestions.length > 0 || kiBasisChanged}
            onClick={applyKiAnalysis}
          >
            <Sparkles className="size-4" /> KI-Positionen für Angebot übernehmen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
