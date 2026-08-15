import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Tabellen, die live mit dem Frontend synchronisiert werden. */
const TABLES: { table: string; keys: string[] }[] = [
  { table: "customers", keys: ["customers"] },
  { table: "documents", keys: ["documents", "document"] },
  { table: "document_items", keys: ["documents", "document", "document-items"] },
  // Wochenplanung: Änderungen der Verwaltung erscheinen sofort im Mitarbeiterkalender.
  {
    table: "project_assignments",
    keys: ["project_assignments", "my_assignments", "my_projects"],
  },
  {
    table: "plan_releases",
    keys: ["plan_release", "plan_releases", "my_assignments"],
  },
];

/**
 * Abonniert Änderungen an Kunden und Belegen und aktualisiert die
 * React-Query-Caches sofort (Echtzeit-Synchronisation).
 */
export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const channel = supabase.channel("app-data-sync");
    for (const { table, keys } of TABLES) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          for (const key of keys) {
            queryClient.invalidateQueries({ queryKey: [key] });
          }
        },
      );
    }
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
