import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, formatNumber } from "@/lib/format";

type DocumentTotalsEditorProps = {
  discountItemPresent: boolean;
  discountPercent: number;
  discountPercentValue: string;
  discountReason: string;
  itemsTotal: number;
  discountAmount: number;
  netTotal: number;
  vatRate: number;
  vatAmount: number;
  grossTotal: number;
  onDiscountPercentChange: (value: string) => void;
  onDiscountReasonChange: (value: string) => void;
};

export function DocumentTotalsEditor({
  discountItemPresent,
  discountPercent,
  discountPercentValue,
  discountReason,
  itemsTotal,
  discountAmount,
  netTotal,
  vatRate,
  vatAmount,
  grossTotal,
  onDiscountPercentChange,
  onDiscountReasonChange,
}: DocumentTotalsEditorProps) {
  return (
    <>
      {discountItemPresent && (
        <p role="alert" className="rounded-md border border-amber-500/60 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Dieser Beleg enthält bereits eine Rabattposition aus der Kalkulation. Ein zusätzlicher
          Belegrabatt ist deshalb gesperrt – sonst würde derselbe Nachlass doppelt abgezogen.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Rabatt (%)</Label>
          <Input inputMode="decimal" disabled={discountItemPresent} value={discountItemPresent ? "0" : discountPercentValue} onChange={(event) => onDiscountPercentChange(event.target.value)} placeholder="0" />
        </div>
        <div className="space-y-2">
          <Label>Rabattgrund</Label>
          <Input value={discountReason} onChange={(event) => onDiscountReasonChange(event.target.value)} placeholder="z. B. Treuerabatt" />
        </div>
      </div>

      <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Zwischensumme (netto)</span><span>{formatMoney(itemsTotal)}</span></div>
        {discountPercent > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Rabatt {formatNumber(discountPercent)} %{discountReason ? ` (${discountReason})` : ""}</span>
            <span>−{formatMoney(discountAmount)}</span>
          </div>
        )}
        <div className="flex justify-between"><span className="text-muted-foreground">Nettobetrag</span><span>{formatMoney(netTotal)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">zzgl. Umsatzsteuer {formatNumber(vatRate)} %</span><span>{formatMoney(vatAmount)}</span></div>
        <div className="flex justify-between border-t pt-1 font-display text-base font-semibold"><span>Bruttobetrag</span><span>{formatMoney(grossTotal)}</span></div>
      </div>
    </>
  );
}
