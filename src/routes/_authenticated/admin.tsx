import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  // Harte Zugangssperre: nur der Master-Account mit Administrator-Rolle.
  beforeLoad: async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) throw redirect({ to: "/auth" });
    const { data, error } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
    if (error || data !== true) throw redirect({ to: "/dashboard" });
    return {};
  },
  head: () => ({
    meta: [
      { title: "Administration – GebCalc Plattformverwaltung" },
      {
        name: "description",
        content:
          "Geschützter Administrationsbereich: Firmen freigeben oder sperren, Abonnements verwalten und Pakete sowie Preise pflegen.",
      },
      { property: "og:title", content: "Administration – GebCalc Plattformverwaltung" },
      {
        property: "og:description",
        content: "Zentrale Verwaltung aller Firmenkonten, Abonnements und Preispakete.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminLayout,
});

const tabs = [
  { to: "/admin", label: "Abonnements", exact: true },
  { to: "/admin/firmen", label: "Firmen & Freigaben", exact: false },
  { to: "/admin/pakete", label: "Pakete & Preise", exact: false },
  { to: "/admin/zahlung", label: "Bankdaten", exact: false },
] as const;

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-1 size-6 shrink-0 text-primary" />
        <div>
          <h1 className="font-display text-2xl font-bold">Plattform-Administration</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Nur für den Master-Account. Firmenkonten, Abonnements und Preispakete zentral steuern.
          </p>
        </div>
      </div>

      <nav className="flex flex-wrap gap-2 border-b pb-2">
        {tabs.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium",
                active
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      <Outlet />
    </div>
  );
}
