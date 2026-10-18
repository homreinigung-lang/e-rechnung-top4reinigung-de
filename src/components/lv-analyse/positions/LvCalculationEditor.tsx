import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, formatNumber } from "@/lib/format";
import { parseFrequency } from "@/lib/lv-analyse/normalize";
import {
  annualOfferPrice,
  offerPrice,
  ownUnitPrice,
  pricingQuantity,
  pricingUnit,
  PRICING_BASIS_LABELS,
} from "@/lib/lv-analyse/calculation";
import type { LvCalculation, LvNormalizedItem } from "@/lib/lv-analyse/types";
import { NumCell } from "./PositionCells";

export function LvCalculationEditor({
  item,
  onChange,
}: {
  item: LvNormalizedItem;
  onChange: (calculation: LvCalculation) => void;
}) {
  const c = item.calculation;
  const patch = (values: Partial<LvCalculation>) =>
    onChange({ ...c, pricing_basis: c.pricing_basis ?? null, scope_checked: false, ...values });
  const field = (
    key:
      | "own_quantity"
      | "minutes_per_execution"
      | "hourly_rate"
      | "own_unit_price"
      | "material_cost"
      | "overhead_cost"
      | "profit_percent"
      | "labor_cost",
    label: string,
  ) => (
    <div className="space-y-1" key={key}>
      <Label>{label}</Label>
      <NumCell
        value={c[key] ?? null}
        onChange={(value) => patch({ [key]: value })}
        ariaLabel={`${label} - Position ${item.item_number}`}
      />
    </div>
  );
  const price = offerPrice(item);
  const annual = annualOfferPrice(item);
  return (
    <section
      className="space-y-3 rounded-md border bg-muted/20 p-3"
      aria-label={`Eigene Kalkulation Position ${item.item_number}`}
    >
      <p className="font-medium">Eigene Kalkulation</p>
      <p className="text-xs text-muted-foreground">
        LV-Vorgaben bleiben erhalten. Fehlende Mengen ausdrücklich ergänzen; keine automatische
        Pauschalmenge. Diese Position nicht zusätzlich als komplette Raumreinigung berechnen.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Berechnungsart</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-2"
            aria-label="Berechnungsart"
            value={c.mode ?? "unit_price"}
            onChange={(e) => patch({ mode: e.target.value as "time" | "unit_price" })}
          >
            <option value="unit_price">Eigener Einheitspreis</option>
            <option value="time">Interner Zeitansatz</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Preisbezug laut Ausschreibung</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-2"
            aria-label="Preisbezug laut Ausschreibung"
            value={c.pricing_basis ?? ""}
            onChange={(e) =>
              patch({ pricing_basis: e.target.value as LvCalculation["pricing_basis"] })
            }
          >
            <option value="" disabled>
              Bitte ausdrücklich wählen
            </option>
            {Object.entries(PRICING_BASIS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {(item.quantity ?? 0) <= 0 ? (
          field("own_quantity", "Eigene Menge (im LV nicht angegeben)")
        ) : (
          <p className="text-xs">LV-Menge unverändert: {formatNumber(item.quantity!)}</p>
        )}
        {!item.unit.trim() ? (
          <div className="space-y-1">
            <Label>Eigene Einheit (im LV nicht angegeben)</Label>
            <Input
              aria-label="Eigene Einheit"
              value={c.own_unit ?? ""}
              placeholder="z. B. Stück, m², pauschal"
              onChange={(e) => patch({ own_unit: e.target.value })}
            />
          </div>
        ) : (
          <p className="text-xs">LV-Einheit unverändert: {item.unit}</p>
        )}
        <div className="space-y-1 sm:col-span-2">
          <Label>Geprüfter Reinigungsturnus</Label>
          <Input
            aria-label="Geprüfter Reinigungsturnus"
            value={c.own_frequency?.label ?? item.frequency.label}
            placeholder="z. B. 1 x pro Woche"
            onChange={(e) =>
              patch({ own_frequency: { ...parseFrequency(e.target.value), label: e.target.value } })
            }
          />
          <p className="text-xs text-muted-foreground">
            Original: {item.frequency.label || "nicht angegeben"}. Preisbezug und Reinigungsturnus
            sind unabhängig.
          </p>
        </div>
        {c.mode === "time" ? (
          <>
            {field(
              "minutes_per_execution",
              c.pricing_basis === "once"
                ? "Personalminuten insgesamt (einmaliger Umfang)"
                : "Personalminuten für die gesamte Position je Ausführung",
            )}
            {field("hourly_rate", "Eigener Stundensatz (€)")}
            {field(
              "material_cost",
              c.pricing_basis === "once" ? "Material insgesamt (€)" : "Material je Ausführung (€)",
            )}
            {field(
              "overhead_cost",
              c.pricing_basis === "once"
                ? "Weitere Kosten insgesamt (€)"
                : "Weitere Kosten je Ausführung (€)",
            )}
          </>
        ) : (
          <>
            {field("own_unit_price", "Eigener Einheitspreis (€)")}
            {field("labor_cost", "Zusätzliche Arbeitskosten je Preisbezug (€)")}
            {field("material_cost", "Material je Preisbezug (€)")}
            {field("overhead_cost", "Gemeinkosten je Preisbezug (€)")}
          </>
        )}
        {field("profit_percent", "Gewinnaufschlag (%)")}
      </div>
      <p className="text-xs text-muted-foreground">
        Beim Zeitansatz gelten die Minuten für alle Einheiten dieser Position zusammen. Zwei
        Personen à 15 Minuten = 30 Personalminuten. Mengen für einen ganzen Vertragszeitraum:
        „Einmalig / Vertragsgesamtmenge“ wählen, damit keine erneute Vervielfachung erfolgt.
      </p>
      {c.mode === "time" && (
        <label className="flex items-start gap-2 text-xs">
          <Checkbox
            checked={c.scope_checked ?? false}
            onCheckedChange={(value) => patch({ scope_checked: value === true })}
          />
          Leistungsumfang geprüft: Diese Minuten überschneiden sich nicht mit anderen LV-Positionen
          oder einer zusätzlichen kompletten Raumreinigung.
        </label>
      )}
      <div className="space-y-1 text-sm" aria-live="polite">
        <p>
          Menge × Einheit: {pricingQuantity(item) ?? "offen"} {pricingUnit(item) || "offen"}
        </p>
        <p>
          Eigener EP:{" "}
          {ownUnitPrice(item) === null
            ? "offen"
            : `${ownUnitPrice(item)!.toLocaleString("de-DE", { maximumFractionDigits: 6 })} €`}{" "}
          {c.mode === "time" ? "(aus Zeitansatz)" : ""}
        </p>
        <p>
          Positionspreis (
          {c.pricing_basis ? PRICING_BASIS_LABELS[c.pricing_basis] : "Preisbezug offen"}):{" "}
          <strong>{price === null ? "noch nicht berechenbar" : formatMoney(price)}</strong>
        </p>
        {price !== null && pricingQuantity(item) && (
          <p>
            Angebots-Einheitspreis inkl. Zuschläge:{" "}
            {(price / pricingQuantity(item)!).toLocaleString("de-DE", { maximumFractionDigits: 6 })}{" "}
            € / {pricingUnit(item)}
          </p>
        )}
        <p>
          {c.pricing_basis === "once" ? "Vertragsgesamtpreis" : "Jahrespreis"}:{" "}
          {annual === null ? "offen" : formatMoney(annual)}
        </p>
        {annual !== null && c.pricing_basis !== "once" && (
          <p>Monatsdurchschnitt: {formatMoney(annual / 12)}</p>
        )}
      </div>
    </section>
  );
}
