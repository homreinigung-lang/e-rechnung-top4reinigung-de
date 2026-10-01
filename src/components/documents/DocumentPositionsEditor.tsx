import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney, formatNumber, roundCents } from "@/lib/format";

type PositionItem = {
  id: string;
  position: number;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  is_optional?: boolean;
};

type DocumentPositionsEditorProps = {
  items: PositionItem[];
  unitOptions: string[];
  defaultNetRate: number;
  vatRate: number;
  onItemsChange: (updater: (items: PositionItem[]) => PositionItem[]) => void;
  onUpdateItem: (index: number, patch: Partial<PositionItem>) => void;
};

export function DocumentPositionsEditor({
  items,
  unitOptions,
  defaultNetRate,
  vatRate,
  onItemsChange,
  onUpdateItem,
}: DocumentPositionsEditorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Positionen</Label>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            onItemsChange((previous) => [
              ...previous,
              {
                id: crypto.randomUUID(),
                position: previous.length + 1,
                description: "",
                quantity: 1,
                unit: "Std.",
                unit_price: Number(previous[previous.length - 1]?.unit_price) || defaultNetRate,
                is_optional: false,
              },
            ])
          }
        >
          <Plus className="size-4" /> Position
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Alle Preise werden als <strong>Netto-Beträge</strong> (z. B. Netto-Stundensatz)
        eingegeben. Die Umsatzsteuer wird automatisch berechnet.
      </p>

      {items.map((item, index) => (
        <div key={item.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-12">
          <div className="space-y-1 sm:col-span-5">
            <Label className="text-xs text-muted-foreground">Bezeichnung</Label>
            <Input
              placeholder="Bezeichnung (z. B. Unterhaltsreinigung Büro)"
              value={item.description}
              onChange={(event) => onUpdateItem(index, { description: event.target.value })}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Menge</Label>
            <Input type="number" step="0.01" value={item.quantity} onChange={(event) => onUpdateItem(index, { quantity: Number(event.target.value) })} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Einheit</Label>
            <Select value={unitOptions.includes(item.unit) ? item.unit : "__custom"} onValueChange={(value) => onUpdateItem(index, { unit: value === "__custom" ? "" : value })}>
              <SelectTrigger><SelectValue placeholder="Einheit" /></SelectTrigger>
              <SelectContent>
                {unitOptions.map((unit) => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}
                <SelectItem value="__custom">Andere …</SelectItem>
              </SelectContent>
            </Select>
            {!unitOptions.includes(item.unit) && <Input placeholder="Eigene Einheit" value={item.unit} onChange={(event) => onUpdateItem(index, { unit: event.target.value })} />}
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Netto-Preis / Einheit €</Label>
            <Input type="number" step="0.01" value={item.unit_price} onChange={(event) => onUpdateItem(index, { unit_price: Number(event.target.value) })} />
          </div>
          <div className="flex items-end sm:col-span-1">
            <Button variant="ghost" size="icon" onClick={() => onItemsChange((previous) => previous.filter((_, itemIndex) => itemIndex !== index))}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs sm:col-span-12">
            <Checkbox checked={Boolean(item.is_optional)} onCheckedChange={(value) => onUpdateItem(index, { is_optional: value === true })} />
            <span>Optionale Zusatzleistung (nur bei Durchführung berechnet)</span>
          </label>
          <p className="text-xs text-muted-foreground sm:col-span-12">
            Netto {formatMoney(roundCents(item.quantity * item.unit_price))}
            {vatRate > 0 && <>{" · "}Brutto inkl. {formatNumber(vatRate)} % MwSt. {formatMoney(roundCents(item.quantity * item.unit_price * (1 + vatRate / 100)))}</>}
          </p>
        </div>
      ))}
    </div>
  );
}
