import { ShoppingCart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatNumber } from "@/lib/format";

import type { MaterialverwaltungState } from "./useMaterialverwaltungState";
export function MaterialverwaltungBestellungen({ state }: { state: MaterialverwaltungState }) {
  const {
    createOrder,
    materialName,
    materials,
    materialsError,
    materialsLoading,
    openOrders,
    orderMaterial,
    orderNote,
    orderProject,
    orderQuantity,
    orderSupplier,
    orders,
    projectName,
    projects,
    setOrderMaterial,
    setOrderNote,
    setOrderProject,
    setOrderQuantity,
    setOrderSupplier,
    updateOrder,
  } = state;
  return (
    <section className="surface space-y-4 p-5">
      <div className="flex items-center gap-2">
        <ShoppingCart className="size-5 text-primary" />
        <h2 className="text-lg font-semibold">Bestellungen</h2>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label>Material</Label>
          <Select
            value={orderMaterial}
            onValueChange={(value) => {
              setOrderMaterial(value);
              const material = materials.find((item) => item.id === value);
              setOrderSupplier(material?.supplier ?? "");
            }}
            disabled={materialsLoading || Boolean(materialsError) || materials.length === 0}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  materialsLoading
                    ? "Materialien werden geladen …"
                    : materialsError
                      ? "Materialien konnten nicht geladen werden"
                      : materials.length === 0
                        ? "Zuerst Material oben anlegen"
                        : "Material auswählen"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {materials.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {materials.length === 0 && !materialsLoading && !materialsError && (
            <p className="text-xs text-muted-foreground">
              Noch kein aktives Material vorhanden. Bitte zuerst unter „Materialstamm & Lager“ ein
              Material anlegen.
            </p>
          )}
          {materialsError && (
            <p className="text-xs text-destructive">
              Materialliste konnte nicht geladen werden. Bitte Seite neu laden oder
              Datenbank-Migration prüfen.
            </p>
          )}
        </div>
        <div className="space-y-1">
          <Label>Für Objekt</Label>
          <Select value={orderProject} onValueChange={setOrderProject}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Zentrallager</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name || "Objekt"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Menge</Label>
          <Input
            type="number"
            min={0.01}
            step="0.01"
            value={orderQuantity}
            onChange={(e) => setOrderQuantity(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Lieferant</Label>
          <Input value={orderSupplier} onChange={(e) => setOrderSupplier(e.target.value)} />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label>Notiz</Label>
          <Textarea rows={2} value={orderNote} onChange={(e) => setOrderNote(e.target.value)} />
        </div>
      </div>
      <Button type="button" onClick={() => createOrder.mutate()} disabled={createOrder.isPending}>
        Bestellung anlegen
      </Button>

      <div className="space-y-2">
        {orders.map((order) => (
          <div
            key={order.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
          >
            <div>
              <div className="font-medium">
                {materialName(order.material_id)} · {formatNumber(Number(order.quantity))}
              </div>
              <div className="text-xs text-muted-foreground">
                {projectName(order.project_id)} · {order.supplier || "ohne Lieferant"} · Status{" "}
                {order.status}
                {order.order_date ? ` · bestellt ${formatDate(order.order_date)}` : ""}
              </div>
            </div>
            <Select
              value={order.status}
              onValueChange={(status) => updateOrder.mutate({ id: order.id, status })}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="offen">Offen</SelectItem>
                <SelectItem value="bestellt">Bestellt</SelectItem>
                <SelectItem value="geliefert">Geliefert</SelectItem>
                <SelectItem value="storniert">Storniert</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
        {orders.length === 0 && (
          <p className="text-sm text-muted-foreground">Noch keine Bestellungen angelegt.</p>
        )}
      </div>

      {openOrders.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {openOrders.length} offene bzw. bestellte Position{openOrders.length === 1 ? "" : "en"}.
        </p>
      )}
    </section>
  );
}
