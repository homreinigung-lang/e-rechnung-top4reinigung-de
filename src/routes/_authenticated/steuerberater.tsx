import { createFileRoute } from "@tanstack/react-router";

import { useSteuerberaterState } from "@/components/accountant/admin/useSteuerberaterState";
import { SteuerberaterView } from "@/components/accountant/admin/SteuerberaterView";
export const Route = createFileRoute("/_authenticated/steuerberater")({
  head: () => ({
    meta: [
      { title: "Steuerberater – DATEV, Excel & PDF Export" },
      {
        name: "description",
        content:
          "Auswertung für den Steuerberater: Umsatz, Umsatzsteuer und Ausgaben je Zeitraum als DATEV-CSV, Excel oder PDF exportieren.",
      },
      { property: "og:title", content: "Steuerberater-Auswertung" },
      {
        property: "og:description",
        content: "Umsätze, Vorsteuer und Zahllast exportieren – DATEV, Excel, PDF.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Steuerberater,
});
function Steuerberater() {
  const state = useSteuerberaterState();
  return <SteuerberaterView state={state} />;
}
