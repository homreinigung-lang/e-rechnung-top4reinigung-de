import { createFileRoute, redirect } from "@tanstack/react-router";

/** Alter Pfad – die Verwaltung liegt jetzt im geschützten Admin-Bereich. */
export const Route = createFileRoute("/_authenticated/abonnements")({
  beforeLoad: () => {
    throw redirect({ to: "/admin", replace: true });
  },
  component: () => null,
});
