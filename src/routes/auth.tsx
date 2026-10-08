import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/AuthPage";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Anmelden – Rechnungen & Angebote" },
      {
        name: "description",
        content: "Melden Sie sich an, um Angebote und Rechnungen zu verwalten und zu versenden.",
      },
      { property: "og:title", content: "Anmelden – Rechnungen & Angebote" },
      {
        property: "og:description",
        content: "Zugang zum Rechnungsprogramm für Reinigungsdienste.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => <AuthPage />,
});
