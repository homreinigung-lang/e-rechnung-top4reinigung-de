import { createFileRoute } from "@tanstack/react-router";

import { useAccountantPortalState } from "@/components/accountant/portal/useAccountantPortalState";
import { AccountantPortalView } from "@/components/accountant/portal/AccountantPortalView";
export const Route = createFileRoute("/stb/$token")({
  head: () => ({
    meta: [
      { title: "Steuerberater-Zugang – Nur-Lese-Auswertung" },
      {
        name: "description",
        content:
          "Geschützter Nur-Lese-Zugang für den Steuerberater: Rechnungen, Ausgaben und Exporte als DATEV-CSV oder Excel.",
      },
      { property: "og:title", content: "Steuerberater-Zugang" },
      { property: "og:description", content: "Rechnungen und Ausgaben ansehen und exportieren." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountantPortal,
});
function AccountantPortal() {
  const state = useAccountantPortalState();
  return <AccountantPortalView state={state} />;
}
