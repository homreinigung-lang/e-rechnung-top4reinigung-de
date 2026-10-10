import { createFileRoute } from "@tanstack/react-router";

import { useDokumenteListeState } from "@/components/documents/list/useDokumenteListeState";
import { DokumenteListeView } from "@/components/documents/list/DokumenteListeView";
export const Route = createFileRoute("/_authenticated/dokumente/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: "invoice" | "quote" | "order" | undefined } => ({
    tab:
      search["tab"] === "quote"
        ? "quote"
        : search["tab"] === "order"
          ? "order"
          : search["tab"] === "invoice"
            ? "invoice"
            : undefined,
  }),

  head: () => ({
    meta: [
      { title: "Rechnungen & Angebote verwalten" },
      {
        name: "description",
        content: "Alle Rechnungen und Angebote der Reinigungsfirma an einem Ort verwalten.",
      },
      { property: "og:title", content: "Rechnungen & Angebote verwalten" },
      {
        property: "og:description",
        content: "Dokumente erstellen, duplizieren, löschen und versenden.",
      },
    ],
  }),
  component: DokumenteListe,
});
function DokumenteListe() {
  const state = useDokumenteListeState();
  return <DokumenteListeView state={state} />;
}
