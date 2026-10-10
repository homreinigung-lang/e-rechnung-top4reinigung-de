import { Boxes, Trash2 } from "lucide-react";

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

import { formatNumber } from "@/lib/format";

import type { MaterialverwaltungState } from "./useMaterialverwaltungState";
export function MaterialverwaltungMaterialJeObjekt({ state }: { state: MaterialverwaltungState }) {
  const {
    assignMaterial,
    assignProject,
    assignToProject,
    materialName,
    materials,
    materialsError,
    materialsLoading,
    objectStock,
    projectMaterials,
    projectName,
    projects,
    removeProjectMaterial,
    setAssignMaterial,
    setAssignProject,
    setObjectStock,
    setTargetStock,
    targetStock,
    updateProjectMaterial,
  } = state;
  return (
    <section className="surface space-y-4 p-5">
      <div className="flex items-center gap-2">
        <Boxes className="size-5 text-primary" />
        <h2 className="text-lg font-semibold">Material je Objekt</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-4 md:items-end">
        <div className="space-y-1">
          <Label>Objekt</Label>
          <Select value={assignProject} onValueChange={setAssignProject}>
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
            value={assignMaterial}
            onValueChange={setAssignMaterial}
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
          <Label>Sollbestand</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={targetStock}
            onChange={(e) => setTargetStock(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Bestand im Objekt</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={objectStock}
            onChange={(e) => setObjectStock(e.target.value)}
          />
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => assignToProject.mutate()}
        disabled={assignToProject.isPending}
      >
        Objektmaterial speichern
      </Button>

      <div className="space-y-2">
        {projectMaterials.map((row) => {
          const low =
            Number(row.target_stock) > 0 && Number(row.object_stock) < Number(row.target_stock);
          return (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            >
              <div>
                <div className="font-medium">
                  {projectName(row.project_id)} · {materialName(row.material_id)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Ist {formatNumber(Number(row.object_stock))} · Soll{" "}
                  {formatNumber(Number(row.target_stock))}
                  {low ? " · Nachfüllen" : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  className="w-24"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={row.object_stock}
                  onBlur={(e) =>
                    updateProjectMaterial.mutate({
                      id: row.id,
                      patch: { object_stock: Math.max(0, Number(e.target.value) || 0) },
                    })
                  }
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Zuordnung entfernen"
                  onClick={() => removeProjectMaterial.mutate(row.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
