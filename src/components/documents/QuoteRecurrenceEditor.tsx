import { useState } from "react";
import { recurrenceUnitLabel, visitsPerMonth, type RecurrenceUnit } from "@/lib/constants";
import { formatMoney, formatNumber, parsePositiveNumber } from "@/lib/format";
import { quoteRecurrencePosition, readQuoteRecurrence, quoteVisitPrice } from "@/lib/quote-recurrence";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function QuoteRecurrenceEditor({ description, onApply }: {
  description: string;
  onApply: (patch: { description: string; quantity: number; unit: string; unit_price: number }) => void;
}) {
  const saved = readQuoteRecurrence(description);
  const [frequency, setFrequency] = useState<string | null>(null);
  const [unit, setUnit] = useState<RecurrenceUnit | null>(null);
  const [basis, setBasis] = useState<"visit" | "hour">("visit");
  const [price, setPrice] = useState("");
  const [hours, setHours] = useState("");
  const [applied, setApplied] = useState<string | null>(null);
  const selectedUnit = unit ?? saved?.unit;
  const selectedFrequency = frequency ?? saved?.frequency ?? "1";
  const count = selectedUnit === "once" ? 1 : parsePositiveNumber(selectedFrequency);
  const visitPrice = quoteVisitPrice({ basis, price, hours });
  const valid = Boolean(selectedUnit && count > 0 && visitPrice > 0);
  const monthlyVisits = selectedUnit ? visitsPerMonth(count, selectedUnit) : 0;
  const signature = JSON.stringify([description, selectedFrequency, selectedUnit, basis, price, hours]);
  return (
    <div className="space-y-3 rounded-md bg-muted/40 p-3 sm:col-span-12">
      <p className="text-sm font-medium">Reinigungsrhythmus</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Preisberechnung">
        <Button type="button" size="sm" variant={basis === "visit" ? "default" : "outline"} aria-pressed={basis === "visit"} onClick={() => { if (basis !== "visit") { setBasis("visit"); setPrice(""); } }}>Festpreis je Besuch</Button>
        <Button type="button" size="sm" variant={basis === "hour" ? "default" : "outline"} aria-pressed={basis === "hour"} onClick={() => { if (basis !== "hour") { setBasis("hour"); setPrice(""); } }}>Nach Stunden</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {basis === "hour" && <div className="space-y-1">
          <Label>Stunden je Besuch</Label>
          <Input aria-label="Stunden je Besuch" inputMode="decimal" value={hours} placeholder="z. B. 2" onChange={(event) => setHours(event.target.value)} />
        </div>}
        <div className="space-y-1">
          <Label>{basis === "hour" ? "Preis je Stunde € netto" : "Preis je Besuch € netto"}</Label>
          <Input aria-label={basis === "hour" ? "Preis je Stunde" : "Preis je Besuch"} inputMode="decimal" value={price} placeholder={basis === "hour" ? "z. B. 30" : "z. B. 60"} onChange={(event) => setPrice(event.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-[5rem_1fr] gap-3">
        <div className="space-y-1">
          <Label>Anzahl</Label>
          <Input aria-label="Anzahl Einsätze" inputMode="decimal" disabled={selectedUnit === "once"} value={selectedUnit === "once" ? "1" : selectedFrequency} onChange={(event) => setFrequency(event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Wie oft?</Label>
          <Select value={selectedUnit ?? ""} onValueChange={(value) => setUnit(value as RecurrenceUnit)}>
            <SelectTrigger aria-label="Reinigungsintervall"><SelectValue placeholder="Bitte wählen" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="once">Einmalig</SelectItem>
              <SelectItem value="week">Pro Woche</SelectItem>
              <SelectItem value="fortnight">Alle 2 Wochen</SelectItem>
              <SelectItem value="month">Pro Monat</SelectItem>
              <SelectItem value="quarter">Pro Quartal</SelectItem>
              <SelectItem value="year">Pro Jahr</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {valid && <div className="rounded-md border bg-background p-3">
        {basis === "hour" && <p className="text-sm">{formatNumber(parsePositiveNumber(hours))} Std. × {formatMoney(parsePositiveNumber(price))} = {formatMoney(visitPrice)} je Besuch</p>}
        <p className="text-sm">{selectedUnit === "once" ? "Einmalige Reinigung" : `${formatNumber(count)} × ${recurrenceUnitLabel(selectedUnit!)}`}</p>
        <p className="text-lg font-semibold">{formatMoney(visitPrice * monthlyVisits)} netto {selectedUnit === "once" ? "gesamt" : "pro Monat"}</p>
      </div>}
      <Button type="button" size="sm" disabled={!valid} onClick={() => {
        if (valid && selectedUnit) {
          const patch = quoteRecurrencePosition({ description, frequency: selectedFrequency, unit: selectedUnit, pricePerVisit: String(visitPrice) });
          onApply(patch);
          setApplied(JSON.stringify([patch.description, selectedFrequency, selectedUnit, basis, price, hours]));
        }
      }}>{applied === signature ? "✓ Übernommen" : "Preis übernehmen"}</Button>
    </div>
  );
}
