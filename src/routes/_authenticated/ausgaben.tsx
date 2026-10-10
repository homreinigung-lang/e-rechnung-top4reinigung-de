import { createFileRoute } from "@tanstack/react-router";

import { useAusgabenState } from "@/components/expenses/useAusgabenState";
import { AusgabenView } from "@/components/expenses/AusgabenView";
export const Route = createFileRoute("/_authenticated/ausgaben")({
  head: () => ({
    meta: [
      { title: "Ausgaben & Eingangsrechnungen erfassen" },
      {
        name: "description",
        content: "Eingangsrechnungen und Betriebsausgaben erfassen und Einnahmen-Überschuss sehen.",
      },
      { property: "og:title", content: "Ausgaben & Eingangsrechnungen" },
      { property: "og:description", content: "Einnahmen und Ausgaben gegenüberstellen." },
    ],
  }),
  component: Ausgaben,
});
function Ausgaben() {
  const state = useAusgabenState();
  return <AusgabenView state={state} />;
}
