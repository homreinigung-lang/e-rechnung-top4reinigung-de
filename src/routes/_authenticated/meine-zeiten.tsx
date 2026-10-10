import { createFileRoute } from "@tanstack/react-router";

import { useMeineZeitenState } from "@/components/employee-time/useMeineZeitenState";
import { MeineZeitenView } from "@/components/employee-time/MeineZeitenView";
export const Route = createFileRoute("/_authenticated/meine-zeiten")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    projekt?: string | undefined;
    einsatz?: string | undefined;
    datum?: string | undefined;
    aktion?: "urlaub" | undefined;
  } => ({
    projekt: typeof search["projekt"] === "string" ? search["projekt"] : undefined,
    einsatz: typeof search["einsatz"] === "string" ? search["einsatz"] : undefined,
    datum:
      typeof search["datum"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search["datum"])
        ? search["datum"]
        : undefined,
    aktion: search["aktion"] === "urlaub" ? ("urlaub" as const) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Meine Arbeitszeiten – GebCalc" },
      {
        name: "description",
        content:
          "Mitarbeiterbereich: eigene Arbeitszeiten erfassen, bearbeiten und den Monat im Blick behalten.",
      },
      { property: "og:title", content: "Meine Arbeitszeiten" },
      {
        property: "og:description",
        content: "Eigene Arbeitsstunden schnell und einfach selbst erfassen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MeineZeiten,
});
function MeineZeiten() {
  const state = useMeineZeitenState();
  if (!state.ready) return state.fallback;
  return <MeineZeitenView state={state} />;
}
