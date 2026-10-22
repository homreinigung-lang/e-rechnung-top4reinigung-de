import { formatMoney, formatNumber } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { KalkulationStateContext } from "./useKalkulationState";

export function DiscountPanel({ state }: { state: KalkulationStateContext }) {
  const { discountPercent, setDiscountPercent, discountAmountInput, setDiscountAmountInput, discountReason, setDiscountReason, discountTotal, pct, discountFixed } = state;
  return (
    <>
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

    </>
  );
}
