import { createFileRoute, redirect } from "@tanstack/react-router";

/** Das LV-Formular ist in die LV-Analyse integriert. */
export const Route = createFileRoute("/_authenticated/lv-formular")({
  beforeLoad: () => {
    throw redirect({ to: "/lv-analyse" });
  },
});
