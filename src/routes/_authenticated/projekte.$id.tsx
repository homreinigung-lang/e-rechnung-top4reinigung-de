import { createFileRoute } from "@tanstack/react-router";

import { useProjektDetailState } from "@/components/projects/detail/useProjektDetailState";
import { ProjektDetailView } from "@/components/projects/detail/ProjektDetailView";
export const Route = createFileRoute("/_authenticated/projekte/$id")({
  head: () => ({
    meta: [
      { title: "Projektdetails – Raumbuch & Leistungsverzeichnis" },
      {
        name: "description",
        content:
          "Projektkopf, Raumbuch, Leistungsverzeichnis, Kalkulationsübersicht und Mitarbeiter-Zuweisung.",
      },
      { property: "og:title", content: "Projektdetails" },
      {
        property: "og:description",
        content: "Räume und Leistungspositionen prüfen, korrigieren und Team zuordnen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProjektDetail,
});
function ProjektDetail() {
  const state = useProjektDetailState();
  if (!state.ready) return state.fallback;
  return <ProjektDetailView state={state} />;
}
