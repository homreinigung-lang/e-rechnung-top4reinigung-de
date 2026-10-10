import { createFileRoute } from "@tanstack/react-router";

import { useEinstellungenState } from "@/components/settings/useEinstellungenState";
import { EinstellungenView } from "@/components/settings/EinstellungenView";
export const Route = createFileRoute("/_authenticated/einstellungen")({
  head: () => ({
    meta: [
      { title: "Einstellungen – E-Mail, Export & Import" },
      {
        name: "description",
        content: "SMTP-Zugang, E-Mail-Signatur, DATEV-Export für den Steuerberater und CSV-Import.",
      },
      { property: "og:title", content: "Systemeinstellungen" },
      { property: "og:description", content: "E-Mail, Steuerberater-Export und Datenimport." },
    ],
  }),
  component: Einstellungen,
});
function Einstellungen() {
  const state = useEinstellungenState();
  return <EinstellungenView state={state} />;
}
