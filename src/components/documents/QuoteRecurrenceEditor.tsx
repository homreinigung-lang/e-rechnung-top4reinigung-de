import { useState } from "react";
import { recurrenceUnitLabel, visitsPerMonth, type RecurrenceUnit } from "@/lib/constants";
import { formatMoney, formatNumber, parsePositiveNumber } from "@/lib/format";
import { quoteRecurrencePosition, readQuoteRecurrence } from "@/lib/quote-recurrence";
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
  const [price, setPrice] = useState("");
  const selectedUnit = unit ?? saved?.unit;
  const selectedFrequency = frequency ?? saved?.frequency ?? "";
  const count = selectedUnit === "once" ? 1 : parsePositiveNumber(selectedFrequency);
  const valid = Boolean(selectedUnit && count > 0 && parsePositiveNumber(price) > 0);
  const monthlyVisits = selectedUnit ? visitsPerMonth(count, selectedUnit) : 0;
  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-3 sm:col-span-12">
      <p className="text-sm font-medium">Reinigungsrhythmus</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label>Anzahl Einsätze</Label>
          <Input aria-label="Anzahl Einsätze" inputMode="decimal" disabled={selectedUnit === "once"} value={selectedUnit === "once" ? "1" : selectedFrequency} placeholder="z. B. 2" onChange={(event) => setFrequency(event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Reinigungsintervall</Label>
          <Select value={selectedUnit ?? ""} onValueChange={(value) => setUnit(value as RecurrenceUnit)}>
            <SelectTrigger aria-label="Reinigungsintervall"><SelectValue placeholder="Turnus wählen" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="once">Einmalige Reinigung</SelectItem>
              <SelectItem value="week">Pro Woche</SelectItem>
              <SelectItem value="fortnight">Alle 2 Wochen (14-tägig)</SelectItem>
              <SelectItem value="month">Pro Monat</SelectItem>
              <SelectItem value="quarter">Pro Quartal</SelectItem>
              <SelectItem value="year">Pro Jahr</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Netto-Preis je Einsatz €</Label>
          <Input aria-label="Netto-Preis je Einsatz" inputMode="decimal" value={price} placeholder="Preis für einen Besuch" onChange={(event) => setPrice(event.target.value)} />
        </div>
      </div>
      {selectedUnit && count > 0 && <p className="text-xs text-muted-foreground">{selectedUnit === "once" ? "Einmalige Reinigung" : `${formatNumber(count)} × ${recurrenceUnitLabel(selectedUnit)} · ${formatNumber(monthlyVisits)} Einsätze im Monatsdurchschnitt`}{valid ? ` · ${formatMoney(parsePositiveNumber(price) * monthlyVisits)} netto ${selectedUnit === "once" ? "gesamt" : "pro Monat"}` : ""}</p>}
      <Button type="button" size="sm" variant="secondary" disabled={!valid} onClick={() => {
        if (valid && selectedUnit) onApply(quoteRecurrencePosition({ description, frequency: selectedFrequency, unit: selectedUnit, pricePerVisit: price }));
      }}>{selectedUnit === "once" ? "Turnus und Gesamtpreis übernehmen" : "Turnus und Monatspreis übernehmen"}</Button>
      <p className="text-xs text-muted-foreground">Preis für einen einzelnen Einsatz eingeben. Erst „Übernehmen“ aktualisiert den Positionspreis. Menge „1 Monat“ umfasst alle vereinbarten Einsätze.</p>
    </div>
  );
}
