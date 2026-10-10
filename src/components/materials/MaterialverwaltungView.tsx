import { AlertTriangle } from "lucide-react";

import { formatMoney } from "@/lib/format";

import { MaterialverwaltungBestellungen } from "./MaterialverwaltungBestellungen";
import { MaterialverwaltungMaterialverbrauchProObjekt } from "./MaterialverwaltungMaterialverbrauchProObjekt";
import { MaterialverwaltungMaterialJeObjekt } from "./MaterialverwaltungMaterialJeObjekt";
import { MaterialverwaltungMaterialstammLager } from "./MaterialverwaltungMaterialstammLager";
import type { MaterialverwaltungState } from "./useMaterialverwaltungState";
export function MaterialverwaltungView({ state }: { state: MaterialverwaltungState }) {
  const { lowStock, materials, stockValue } = state;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Materialverwaltung</h1>
        <p className="mt-1 text-muted-foreground">
          Lagerbestand, Materialien je Objekt und Bestellungen zentral verwalten.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="surface p-4">
          <div className="text-xs text-muted-foreground">Aktive Materialien</div>
          <div className="mt-1 text-2xl font-semibold">{materials.length}</div>
        </div>
        <div className="surface p-4">
          <div className="text-xs text-muted-foreground">Nachbestellung nötig</div>
          <div
            className={`mt-1 text-2xl font-semibold ${lowStock.length ? "text-destructive" : ""}`}
          >
            {lowStock.length}
          </div>
        </div>
        <div className="surface p-4">
          <div className="text-xs text-muted-foreground">Lagerwert</div>
          <div className="mt-1 text-2xl font-semibold">{formatMoney(stockValue)}</div>
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <div className="flex items-center gap-2 font-semibold text-amber-700">
            <AlertTriangle className="size-4" /> Mindestbestand erreicht
          </div>
          <p className="mt-1 text-muted-foreground">
            {lowStock.map((item) => item.name).join(", ")}
          </p>
        </div>
      )}

      <MaterialverwaltungMaterialstammLager state={state} />

      <MaterialverwaltungMaterialJeObjekt state={state} />

      <MaterialverwaltungMaterialverbrauchProObjekt state={state} />

      <MaterialverwaltungBestellungen state={state} />
    </div>
  );
}
