import { PackagePlus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { formatMoney } from "@/lib/format";

import type { MaterialverwaltungState } from "./useMaterialverwaltungState";
export function MaterialverwaltungMaterialstammLager({
  state,
}: {
  state: MaterialverwaltungState;
}) {
  const {
    addMaterial,
    archiveMaterial,
    materials,
    minStock,
    name,
    setMinStock,
    setName,
    setSku,
    setStock,
    setSupplier,
    setUnit,
    setUnitCost,
    sku,
    stock,
    supplier,
    unit,
    unitCost,
    updateMaterial,
  } = state;
  return (
    <section className="surface space-y-4 p-5">
      <div className="flex items-center gap-2">
        <PackagePlus className="size-5 text-primary" />
        <h2 className="text-lg font-semibold">Materialstamm & Lager</h2>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="space-y-1 md:col-span-2">
          <Label>Material</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z. B. Sanitärreiniger"
          />
        </div>
        <div className="space-y-1">
          <Label>Artikel-Nr.</Label>
          <Input value={sku} onChange={(e) => setSku(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Einheit</Label>
          <Input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="Stk., L, Karton"
          />
        </div>
        <div className="space-y-1">
          <Label>Bestand</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Mindestbestand</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={minStock}
            onChange={(e) => setMinStock(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>EK je Einheit</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Lieferant</Label>
          <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        </div>
      </div>
      <Button type="button" onClick={() => addMaterial.mutate()} disabled={addMaterial.isPending}>
        Material anlegen
      </Button>

      {materials.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-2">Material</th>
                <th className="p-2">Bestand</th>
                <th className="p-2">Minimum</th>
                <th className="p-2">EK</th>
                <th className="p-2">Lieferant</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {materials.map((item) => {
                const low =
                  Number(item.min_stock) > 0 &&
                  Number(item.current_stock) <= Number(item.min_stock);
                return (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="p-2">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.sku || "ohne Artikel-Nr."} · {item.unit}
                      </div>
                    </td>
                    <td className="p-2">
                      <Input
                        className={`w-28 ${low ? "border-amber-500" : ""}`}
                        type="number"
                        min={0}
                        step="0.01"
                        defaultValue={item.current_stock}
                        onBlur={(e) =>
                          updateMaterial.mutate({
                            id: item.id,
                            patch: { current_stock: Math.max(0, Number(e.target.value) || 0) },
                          })
                        }
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        className="w-28"
                        type="number"
                        min={0}
                        step="0.01"
                        defaultValue={item.min_stock}
                        onBlur={(e) =>
                          updateMaterial.mutate({
                            id: item.id,
                            patch: { min_stock: Math.max(0, Number(e.target.value) || 0) },
                          })
                        }
                      />
                    </td>
                    <td className="p-2">{formatMoney(Number(item.unit_cost || 0))}</td>
                    <td className="p-2">{item.supplier || "—"}</td>
                    <td className="p-2 text-right">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Material archivieren"
                        onClick={() => archiveMaterial.mutate(item.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
