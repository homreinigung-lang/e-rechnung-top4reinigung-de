import { createFileRoute } from "@tanstack/react-router";

import { useFahrtenbuchState } from "@/components/vehicle-log/useFahrtenbuchState";
import { FahrtenbuchView } from "@/components/vehicle-log/FahrtenbuchView";
export const Route = createFileRoute("/_authenticated/fahrtenbuch")({
  head: () => ({
    meta: [
      { title: "Fahrtenbuch – GebCalc" },
      {
        name: "description",
        content:
          "Geschäftliche Fahrten mit Fahrzeug, Zeit, Fahrtart, Ziel und Kilometerständen erfassen.",
      },
    ],
  }),
  component: Fahrtenbuch,
});
function Fahrtenbuch() {
  const state = useFahrtenbuchState();
  return <FahrtenbuchView state={state} />;
}
