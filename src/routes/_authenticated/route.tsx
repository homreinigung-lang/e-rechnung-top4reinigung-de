import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { getApprovalStatus } from "@/lib/approval.functions";
import { ensureTrialSubscription } from "@/lib/trial.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // Konten sind nach der Registrierung sofort nutzbar; nur gesperrte Firmen
    // werden abgewiesen. Netzwerkfehler dürfen die App nicht blockieren.
    let status: string | null = null;
    try {
      status = (await getApprovalStatus()).status;
    } catch (error) {
      console.warn("Freigabe-Status konnte nicht geprüft werden:", error);
    }
    if (status === "blocked" || status === "rejected") {
      await supabase.auth.signOut();
      throw redirect({ to: "/freigabe-ausstehend" });
    }

    // Neue Firmen erhalten automatisch eine kostenlose Testphase.
    try {
      await ensureTrialSubscription();
    } catch (error) {
      console.warn("Testphase konnte nicht angelegt werden:", error);
    }

    return { user: data.user };
  },

  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
