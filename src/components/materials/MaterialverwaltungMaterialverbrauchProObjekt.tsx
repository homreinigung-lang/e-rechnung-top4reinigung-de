import { PackageMinus, Trash2 } from "lucide-react";

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

import { formatDate, formatMoney, formatNumber } from "@/lib/format";

import type { MaterialverwaltungState } from "./useMaterialverwaltungState";
export function MaterialverwaltungMaterialverbrauchProObjekt({
  state,
}: {
  state: MaterialverwaltungState;
}) {
  const {
    addConsumption,
    assignedForConsumption,
    consumeDate,
    consumeMaterial,
    consumeNote,
    consumeProject,
    consumeQuantity,
    consumptionCost,
    consumptions,
    materialName,
    materials,
    projectName,
    projects,
    removeConsumption,
    setConsumeDate,
    setConsumeMaterial,
    setConsumeNote,
    setConsumeProject,
    setConsumeQuantity,
  } = state;
  return (
    <section className="surface space-y-4 p-5">
      <div className="flex items-center gap-2">
        <PackageMinus className="size-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">Materialverbrauch pro Objekt</h2>
          <p className="text-sm text-muted-foreground">
            Verbrauch buchen, Objektbestand automatisch reduzieren und Materialkosten je Objekt
            nachvollziehen.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5 md:items-end">
        <div className="space-y-1">
          <Label>Objekt</Label>
          <Select
            value={consumeProject}
            onValueChange={(value) => {
              setConsumeProject(value);
              setConsumeMaterial("");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Objekt auswählen" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name || "Objekt"}
                  {project.city ? ` · ${project.city}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Material</Label>
          <Select
            value={consumeMaterial}
            onValueChange={setConsumeMaterial}
            disabled={!consumeProject || assignedForConsumption.length === 0}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  !consumeProject
                    ? "Zuerst Objekt wählen"
                    : assignedForConsumption.length === 0
                      ? "Kein Material zugeordnet"
                      : "Material auswählen"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {assignedForConsumption.map((assignment) => {
                const material = materials.find((item) => item.id === assignment.material_id);
                return (
                  <SelectItem key={assignment.id} value={assignment.material_id}>
                    {material?.name ?? "Material"} · Bestand{" "}
                    {formatNumber(Number(assignment.object_stock))}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Menge</Label>
          <Input
            type="number"
            min={0.01}
            step="0.01"
            value={consumeQuantity}
            onChange={(e) => setConsumeQuantity(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label>Datum</Label>
          <Input type="date" value={consumeDate} onChange={(e) => setConsumeDate(e.target.value)} />
        </div>

        <Button
          type="button"
          onClick={() => addConsumption.mutate()}
          disabled={addConsumption.isPending || !consumeProject || !consumeMaterial}
        >
          Verbrauch buchen
        </Button>

        <div className="space-y-1 md:col-span-5">
          <Label>Notiz</Label>
          <Input
            value={consumeNote}
            onChange={(e) => setConsumeNote(e.target.value)}
            placeholder="z. B. Grundreinigung, Sanitärbereich …"
          />
        </div>
      </div>

      {consumeProject && assignedForConsumption.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Diesem Objekt ist noch kein Material zugeordnet. Bitte zuerst unter „Material je Objekt“
          Material und Objektbestand hinterlegen.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
        <span className="text-muted-foreground">Erfasste Materialkosten gesamt</span>
        <strong>{formatMoney(consumptionCost)}</strong>
      </div>

      <div className="space-y-2">
        {consumptions.slice(0, 30).map((entry) => {
          const material = materials.find((item) => item.id === entry.material_id);
          return (
            <div
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            >
              <div>
                <div className="font-medium">
                  {projectName(entry.project_id)} · {materialName(entry.material_id)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(entry.consumed_on)} · {formatNumber(Number(entry.quantity))}{" "}
                  {material?.unit || ""} ·{" "}
                  {formatMoney(Number(entry.quantity) * Number(entry.unit_cost))}
                  {entry.note ? ` · ${entry.note}` : ""}
                </div>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Verbrauch entfernen"
                onClick={() => removeConsumption.mutate(entry.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        })}
        {consumptions.length === 0 && (
          <p className="text-sm text-muted-foreground">Noch kein Materialverbrauch erfasst.</p>
        )}
      </div>
    </section>
  );
}
