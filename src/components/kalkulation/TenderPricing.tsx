import { AlertTriangle, FileSignature } from "lucide-react";
import { formatMoney, formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { num } from "./shared";
import type { KalkulationStateContext } from "./useKalkulationState";

export function TenderPricing({ state }: { state: KalkulationStateContext }) {
  const {
    base,
    confirmed,
    contribution,
    contributionMargin,
    costingMonthlyHours,
    discountAmountInput,
    discountFixed,
    discountPercent,
    discountReason,
    discountTotal,
    economyLevel,
    effectiveSellingRate,
    extrasTotal,
    grossTotal,
    laborBurdenPerHour,
    laborBurdenPercent,
    laborWage,
    lvPositions,
    lvTotal,
    materialCost,
    mode,
    monthlySelfCost,
    navigate,
    overheadCost,
    pct,
    profitMarkup,
    selfCostPerHour,
    setConfirmed,
    setDiscountAmountInput,
    setDiscountPercent,
    setDiscountReason,
    setHourlyRate,
    setTaxMode,
    stairs,
    stairsTotal,
    subtotal,
    suggested,
    targetMonthlyRevenue,
    targetSellingRate,
    taxMode,
    taxNote,
    toQuote,
    travel,
    vatAmount,
    vatRate,
    warnings,
  } = state;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Berechnung</CardTitle>
        <CardDescription>Automatische Vorab-Berechnung und freier Endpreis</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Grundleistung</span>
            <span>{formatMoney(base)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Zusatzoptionen</span>
            <span>{formatMoney(extrasTotal)}</span>
          </div>
          {stairs && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Treppenhausreinigung</span>
              <span>{formatMoney(stairsTotal)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Anfahrt</span>
            <span>{formatMoney(num(travel))}</span>
          </div>
          <div className="flex justify-between border-t pt-1 font-medium">
            <span>Zwischensumme (netto)</span>
            <span>{formatMoney(subtotal)}</span>
          </div>
        </div>

        <details className="group rounded-md border">
          <summary className="cursor-pointer list-none p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Kosten & Wirtschaftlichkeit</p>
                <p className="text-xs text-muted-foreground">
                  Selbstkosten {formatMoney(selfCostPerHour)} / Std. · Ziel{" "}
                  {formatMoney(targetSellingRate)} / Std.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={
                    economyLevel === "good"
                      ? "font-medium text-emerald-700 dark:text-emerald-300"
                      : economyLevel === "tight"
                        ? "font-medium text-amber-700 dark:text-amber-300"
                        : "font-medium text-red-700 dark:text-red-300"
                  }
                >
                  {economyLevel === "good"
                    ? "Wirtschaftlich"
                    : economyLevel === "tight"
                      ? "Kostendeckend"
                      : "Nicht kostendeckend"}
                </span>
                <span className="text-primary group-open:hidden">Details</span>
                <span className="hidden text-primary group-open:inline">Schließen</span>
              </div>
            </div>
          </summary>

          <div className="space-y-3 border-t p-3">
            <p className="text-xs text-muted-foreground">
              Kostenbasis und Leistungswerte werden zentral unter Einstellungen →
              Kalkulationsgrundlagen gepflegt. Hier werden sie nur zur Kalkulation angezeigt.
            </p>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-md bg-muted/40 p-2">
                <p className="text-[11px] text-muted-foreground">Lohn brutto / Std.</p>
                <p className="text-sm font-medium">{formatMoney(num(laborWage))}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <p className="text-[11px] text-muted-foreground">Lohnnebenkosten</p>
                <p className="text-sm font-medium">
                  {formatNumber(num(laborBurdenPercent))} % · {formatMoney(laborBurdenPerHour)}
                </p>
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <p className="text-[11px] text-muted-foreground">Material / Std.</p>
                <p className="text-sm font-medium">{formatMoney(num(materialCost))}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <p className="text-[11px] text-muted-foreground">Gemeinkosten / Std.</p>
                <p className="text-sm font-medium">{formatMoney(num(overheadCost))}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <p className="text-[11px] text-muted-foreground">Gewinnaufschlag</p>
                <p className="text-sm font-medium">{formatNumber(num(profitMarkup))} %</p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Selbstkosten / Std.</p>
                <p className="font-semibold">{formatMoney(selfCostPerHour)}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Ziel-Verkaufspreis / Std.</p>
                <p className="font-semibold">{formatMoney(targetSellingRate)}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Effektiver Erlös / Std.</p>
                <p className="font-semibold">{formatMoney(effectiveSellingRate)}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Deckungsbeitrag / Monat</p>
                <p className="font-semibold">{formatMoney(contribution)}</p>
              </div>
            </div>

            <div
              className={
                economyLevel === "good"
                  ? "rounded-md border border-emerald-500/60 bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                  : economyLevel === "tight"
                    ? "rounded-md border border-amber-500/60 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                    : "rounded-md border border-red-500/60 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950/30 dark:text-red-200"
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>
                  {economyLevel === "good"
                    ? "Wirtschaftlich"
                    : economyLevel === "tight"
                      ? "Kostendeckend, aber unter Zielmarge"
                      : "Nicht kostendeckend"}
                </strong>
                <span>
                  Marge {formatNumber(contributionMargin)} % · {formatNumber(costingMonthlyHours)}{" "}
                  Std./Monat
                </span>
              </div>
              <p className="mt-1 text-xs opacity-80">
                Monatliche Selbstkosten {formatMoney(monthlySelfCost)} · Zielumsatz bei gewünschter
                Marge {formatMoney(targetMonthlyRevenue)}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate({ to: "/einstellungen" })}
              >
                Kostenbasis & Leistungswerte ändern
              </Button>
              {mode === "hours" && targetSellingRate > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setHourlyRate(String(targetSellingRate).replace(".", ","))}
                >
                  Ziel-Stundensatz übernehmen
                </Button>
              ) : null}
            </div>
          </div>
        </details>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Rabatt (%)</Label>
            <Input
              inputMode="decimal"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Rabatt (fester Betrag netto)</Label>
            <Input
              inputMode="decimal"
              value={discountAmountInput}
              onChange={(e) => setDiscountAmountInput(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Rabattgrund</Label>
            <Input
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
              placeholder="z. B. Treuerabatt"
            />
          </div>
        </div>

        {discountTotal > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Rabatt{pct > 0 ? ` ${formatNumber(pct)} %` : ""}
              {discountFixed > 0 ? ` + ${formatMoney(discountFixed)}` : ""}
              {discountReason ? ` – ${discountReason}` : ""}
            </span>
            <span>−{formatMoney(discountTotal)}</span>
          </div>
        )}

        <div className="space-y-2">
          <Label>Steuerart</Label>
          <Select value={taxMode} onValueChange={setTaxMode}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="domestic">Inland – 19 % USt.</SelectItem>
              <SelectItem value="eu_reverse_charge">EU-Ausland – Reverse-Charge (0 %)</SelectItem>
              <SelectItem value="kleinunternehmer">Kleinunternehmer § 19 UStG (0 %)</SelectItem>
            </SelectContent>
          </Select>
          {taxNote ? <p className="text-xs text-muted-foreground">{taxNote}</p> : null}
        </div>

        <div className="space-y-2 rounded-md border p-3 text-sm">
          <div className="flex justify-between font-medium">
            <span>Vorschlag Grundkalkulation (netto)</span>
            <span>{formatMoney(suggested)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Quelle: Grundkalkulation (primär für Ausschreibungen/LV). Über „Grundkalkulation für
            Angebot übernehmen“ werden diese Werte als Positionen in das Leistungsverzeichnis
            geschrieben. Maßgeblich für Angebot und PDF ist immer die Summe der LV-Positionen.
          </p>
        </div>

        <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Positionen im Leistungsverzeichnis</span>
            <span>{lvPositions.length}</span>
          </div>
          <div className="flex justify-between border-t pt-1 font-medium">
            <span>Gesamt netto</span>
            <span>{formatMoney(lvTotal)}</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{vatRate > 0 ? `zzgl. ${formatNumber(vatRate)} % MwSt.` : "Umsatzsteuer"}</span>
            <span>{formatMoney(vatAmount)}</span>
          </div>
          <div className="flex justify-between text-base font-semibold">
            <span>{vatRate > 0 ? "Gesamt brutto" : "Gesamtbetrag"}</span>
            <span>{formatMoney(grossTotal)}</span>
          </div>
          <p className="pt-1 text-xs text-muted-foreground">
            Die Gesamtsumme ergibt sich ausschließlich aus Menge × Einzelpreis der LV-Positionen –
            ohne stille Ausgleichsposition.
          </p>
        </div>

        {warnings.length > 0 && (
          <div className="flex gap-2 rounded-md border border-amber-500/60 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div className="space-y-1">
              <p className="font-medium">Bitte Angaben prüfen</p>
              {warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3 rounded-md border border-dashed p-3">
          <p className="text-xs text-muted-foreground">
            Diese Kalkulation ist ein interner Entwurf. Bitte alle Angaben prüfen und final
            bestätigen – erst danach kann ein Angebot erstellt werden.
          </p>
          <label className="flex cursor-pointer items-start gap-2 text-sm font-medium">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(Boolean(checked))}
            />
            <span>Kalkulation geprüft und final bestätigt</span>
          </label>
        </div>

        <Button
          className="w-full"
          disabled={toQuote.isPending || lvTotal <= 0 || !confirmed || warnings.length > 0}
          onClick={() => toQuote.mutate()}
        >
          <FileSignature className="size-4" />
          In Angebot übernehmen
        </Button>
      </CardContent>
    </Card>
  );
}
