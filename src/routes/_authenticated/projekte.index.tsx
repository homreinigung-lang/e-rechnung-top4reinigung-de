import { createFileRoute } from "@tanstack/react-router";

import { MODES, modeLabel } from "@/components/projects/list/shared";
import { useProjekteIndexState } from "@/components/projects/list/useProjekteIndexState";
import { ProjekteIndexView } from "@/components/projects/list/ProjekteIndexView";
export const Route = createFileRoute("/_authenticated/projekte/")({
  head: () => ({
    meta: [
      { title: "Projekte – Raumbuch & Ausschreibungen" },
      {
        name: "description",
        content:
          "Projekte mit Grundriss-Raumbuch oder Ausschreibungs-Leistungsverzeichnis verwalten und Mitarbeiter zuweisen.",
      },
      { property: "og:title", content: "Projektverwaltung" },
      {
        property: "og:description",
        content: "Raumbuch, Leistungsverzeichnis und Personaleinsatz in einer Übersicht.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProjekteIndex,
});
function ProjekteIndex() {
  const state = useProjekteIndexState();
  return <ProjekteIndexView state={state} />;
}
export { MODES, modeLabel } from "@/components/projects/list/shared";
