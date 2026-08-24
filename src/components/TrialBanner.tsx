import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";

/**
 * Zeigt der Firma prominent die verbleibenden Tage der kostenlosen
 * 60-Tage-Testphase an.
 */
export function TrialBanner() {
  const { data } = useQuery({
    queryKey: ["my_subscription_trial"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return null;
      const { data: row } = await supabase
        .from("subscriptions")
        .select("status,renews_on,started_on")
        .eq("user_id", uid)
        .maybeSingle();
      return row ?? null;
    },
  });

  if (!data || data.status !== "trial" || !data.renews_on) return null;

  const end = new Date(`${data.renews_on}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.max(0, Math.round((end.getTime() - today.getTime()) / 86_400_000));

  return (
    <div className="surface flex flex-wrap items-center justify-between gap-3 border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <p className="font-semibold">
            Kostenlose Testphase: noch {days} von 60 Tagen
          </p>
          <p className="text-xs text-muted-foreground">
            Voller Funktionsumfang bis {formatDate(data.renews_on)} – danach einfach ein Paket
            wählen.
          </p>
        </div>
      </div>
      <Link
        to="/mein-paket"
        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
      >
        Paket ansehen
      </Link>
    </div>
  );
}
