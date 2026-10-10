import { LoadError } from "@/components/LoadError";

import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Plus } from "lucide-react";

import { emptyForm } from "./shared";

import { QmReklamationenMitarbeiterRückmeldungen } from "./QmReklamationenMitarbeiterRückmeldungen";
import { QmReklamationenTabelle } from "./QmReklamationenTabelle";
import type { QmReklamationenState } from "./useQmReklamationenState";
export function QmReklamationenView({ state }: { state: QmReklamationenState }) {
  const {
    casesError,
    doneCount,
    feedbackError,
    openCount,
    overdueCount,
    projectFilter,
    projects,
    reviewCount,
    setForm,
    setOpen,
    setProjectFilter,
    setStatusFilter,
    statusFilter,
  } = state;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">QM / Reklamationen</h1>
          <p className="mt-1 text-muted-foreground">
            Interne Qualitätsfälle, Kundenreklamationen, Maßnahmen und Fristen zentral verfolgen.
          </p>
        </div>
        <Button
          onClick={() => {
            setForm(emptyForm);
            setOpen(true);
          }}
        >
          <Plus className="size-4" /> Neue Reklamation
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="surface p-4">
          <div className="text-xs text-muted-foreground">Offen</div>
          <div className="mt-1 text-2xl font-semibold">{openCount}</div>
        </div>
        <div className="surface p-4">
          <div className="text-xs text-muted-foreground">Überfällig</div>
          <div className="mt-1 text-2xl font-semibold text-destructive">{overdueCount}</div>
        </div>
        <div className="surface p-4">
          <div className="text-xs text-muted-foreground">Erledigt</div>
          <div className="mt-1 text-2xl font-semibold">{doneCount}</div>
        </div>
        <div className="surface p-4">
          <div className="text-xs text-muted-foreground">Zur Prüfung</div>
          <div className="mt-1 text-2xl font-semibold text-primary">{reviewCount}</div>
        </div>
      </div>

      <div className="surface flex flex-wrap gap-3 p-4">
        <div className="min-w-[190px] space-y-1">
          <Label>Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="offen">Offen</SelectItem>
              <SelectItem value="neu">Neu</SelectItem>
              <SelectItem value="in_bearbeitung">In Bearbeitung</SelectItem>
              <SelectItem value="erledigt">Erledigt</SelectItem>
              <SelectItem value="alle">Alle</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[240px] space-y-1">
          <Label>Objekt</Label>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Objekte</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name || "Ohne Namen"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <LoadError
        error={casesError || feedbackError}
        title="QM-Daten konnten nicht geladen werden"
      />
      <QmReklamationenTabelle state={state} />

      <QmReklamationenMitarbeiterRückmeldungen state={state} />
    </div>
  );
}
