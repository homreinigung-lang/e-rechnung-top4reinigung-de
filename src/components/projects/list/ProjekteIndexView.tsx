import { Link } from "@tanstack/react-router";

import { ProjectScanReview } from "@/components/ProjectScanReview";

import { FolderKanban } from "lucide-react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { formatDate } from "@/lib/format";

import { modeLabel } from "./shared";

import { ProjekteIndexObjektControllingGesamtübersicht } from "./ProjekteIndexObjektControllingGesamtübersicht";
import { ProjekteIndexProjekte } from "./ProjekteIndexProjekte";
import type { ProjekteIndexState } from "./useProjekteIndexState";
export function ProjekteIndexView({ state }: { state: ProjekteIndexState }) {
  const { applyScan, mode, projects, remove, scanResult, skipScan } = state;
  return (
    <div className="space-y-6">
      <ProjekteIndexProjekte state={state} />

      <ProjekteIndexObjektControllingGesamtübersicht state={state} />

      <div className="surface overflow-hidden">
        {projects.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            Noch keine Projekte angelegt.
          </p>
        ) : (
          <ul className="divide-y">
            {projects.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <FolderKanban className="size-5 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <Link
                    to="/projekte/$id"
                    params={{ id: p.id }}
                    className="font-medium hover:underline"
                  >
                    {p.name || "Ohne Namen"}
                  </Link>
                  <div className="truncate text-sm text-muted-foreground">
                    {[modeLabel(p.mode), p.customer_name, p.city].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDate(p.created_at.slice(0, 10))}
                </span>
                <ConfirmDeleteButton
                  title="Projekt wirklich löschen?"
                  description={`Das Projekt „${p.name || "Ohne Namen"}" wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`}
                  onConfirm={() => remove.mutate(p.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <ProjectScanReview
        open={Boolean(scanResult)}
        mode={mode === "tender" ? "tender" : "floorplan"}
        result={scanResult}
        saving={applyScan.isPending}
        onCancel={skipScan}
        onConfirm={(review) => applyScan.mutate(review)}
      />
    </div>
  );
}
