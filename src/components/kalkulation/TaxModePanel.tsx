import { formatMoney, formatNumber } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { KalkulationStateContext } from "./useKalkulationState";

export function TaxModePanel({ state }: { state: KalkulationStateContext }) {
  const { taxMode, setTaxMode, taxNote } = state;
  return (
    <>
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

    </>
  );
}
