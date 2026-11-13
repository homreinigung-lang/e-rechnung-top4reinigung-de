import { createFileRoute } from "@tanstack/react-router";
import { KalkulationSearch } from "@/components/kalkulation/shared";
import { SimpleAiCalculation } from "@/components/kalkulation/SimpleAiCalculation";

export const Route = createFileRoute("/_authenticated/kalkulation")({
  validateSearch: (search: Record<string, unknown>): KalkulationSearch => {
    const area = Number(search["area"]);
    return {
      ...(Number.isFinite(area) && area > 0 ? { area } : {}),
      ...(search["objekt"] ? { objekt: String(search["objekt"]) } : {}),
      ...(search["belag"] ? { belag: String(search["belag"]) } : {}),
      ...(search["projekt"] ? { projekt: String(search["projekt"]) } : {}),
    };
  },

  head: () => ({
    meta: [
      { title: "Kalkulation – Reinigungspreise berechnen" },
      {
        name: "description",
        content:
          "Reinigungsaufträge nach Fläche, Stundensatz und Zusatzleistungen kalkulieren, Endpreis anpassen und direkt in ein Angebot übernehmen.",
      },
      { property: "og:title", content: "Kalkulation – Reinigungspreise berechnen" },
      {
        property: "og:description",
        content: "Preise für Reinigungsaufträge kalkulieren und als Angebot übernehmen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KalkulationPage,
});

function KalkulationPage() { return <SimpleAiCalculation />; }
