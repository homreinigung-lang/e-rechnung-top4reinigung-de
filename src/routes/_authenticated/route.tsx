import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { getApprovalStatus } from "@/lib/approval.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // Neue Konten sind erst nach Freigabe durch den Inhaber nutzbar.
    const { status } = await getApprovalStatus({ data: { authUserId: data.user.id } });
    if (status === "pending") {
      await supabase.auth.signOut();
      throw redirect({ to: "/freigabe-ausstehend" });
    }
    return { user: data.user };
  },

  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
