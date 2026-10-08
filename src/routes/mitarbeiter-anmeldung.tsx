import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/AuthPage";

export const Route = createFileRoute("/mitarbeiter-anmeldung")({
  validateSearch: (search: Record<string, unknown>): { code?: string } => ({
    code: typeof search["code"] === "string" ? search["code"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Mitarbeiterzugang – GebCalc" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => <AuthPage employeeOnly />,
});
