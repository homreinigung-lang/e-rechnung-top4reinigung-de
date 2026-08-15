import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/employee";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/format";

type Assignment = {
  id: string;
  project_id: string | null;
  assignment_role: string | null;
  start_date: string | null;
  note: string | null;
  created_at: string;
};

const STORAGE_KEY = "assignments_seen_at";

/**
 * Glocken-Button im Mitarbeiterkonto: zeigt neue Einsatz-Zuweisungen
 * in Echtzeit mit Zähler der ungelesenen Benachrichtigungen.
 */
export function AssignmentBell() {
  const queryClient = useQueryClient();
  const { data: me } = useMyEmployee();
  const [seenAt, setSeenAt] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSeenAt(window.localStorage.getItem(STORAGE_KEY) ?? "");
  }, []);

  const { data: assignments = [] } = useQuery({
    queryKey: ["assignment_notifications", me?.id],
    enabled: !!me?.id,
    queryFn: async (): Promise<Assignment[]> => {
      const { data, error } = await supabase
        .from("project_assignments")
        .select("id,project_id,assignment_role,start_date,note,created_at")
        .eq("employee_id", me!.id)
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) return [];
      const { data: rel } = await supabase.from("plan_releases").select("week_start");
      const released = new Set((rel ?? []).map((r) => String(r.week_start)));
      // Entwürfe (noch nicht freigegebene Wochen) werden nicht gemeldet.
      return ((data ?? []) as Assignment[]).filter(
        (a) => !a.start_date || released.has(String(a.start_date)),
      );

    },
  });

  const { data: releases = [] } = useQuery({
    queryKey: ["plan_release_notifications", me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("plan_releases")
        .select("id,week_start,week_end,released_at")
        .order("released_at", { ascending: false })
        .limit(5);
      return (data ?? []) as {
        id: string;
        week_start: string;
        week_end: string;
        released_at: string;
      }[];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["notification_projects", me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("id,name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const projectName = useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p.name || "Objekt"]));
    return (id: string | null) => (id ? (map.get(id) ?? "Objekt") : "Objekt");
  }, [projects]);

  // Echtzeit: neue Zuweisung sofort melden
  useEffect(() => {
    if (!me?.id || typeof window === "undefined") return;
    const channel = supabase
      .channel(`assignments-${me.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "project_assignments",
          filter: `employee_id=eq.${me.id}`,
        },
        () => {
          toast.info("Neue Aufgabe zugewiesen");
          queryClient.invalidateQueries({ queryKey: ["assignment_notifications"] });
          queryClient.invalidateQueries({ queryKey: ["my_assignments"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "plan_releases" },
        () => {
          toast.info("Wochenplan wurde freigegeben");
          queryClient.invalidateQueries({ queryKey: ["plan_release_notifications"] });
          queryClient.invalidateQueries({ queryKey: ["my_assignments"] });
        },
      );
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [me?.id, queryClient]);


  const unreadReleases = releases.filter((r) => !seenAt || r.released_at > seenAt);
  const unread = [
    ...assignments.filter((a) => !seenAt || a.created_at > seenAt),
    ...unreadReleases,
  ];


  if (!me) return null;

  function markRead() {
    const now = new Date().toISOString();
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, now);
    setSeenAt(now);
  }

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) markRead();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Benachrichtigungen${unread.length ? ` (${unread.length} neu)` : ""}`}
        >
          <Bell className="size-5" />
          {unread.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Benachrichtigungen</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {assignments.length === 0 && releases.length === 0 && (
          <DropdownMenuItem disabled>Keine Zuweisungen</DropdownMenuItem>
        )}
        {releases.map((r) => {
          const isNew = !seenAt || r.released_at > seenAt;
          return (
            <DropdownMenuItem key={r.id} className="flex flex-col items-start gap-0.5">
              <span className="text-sm font-medium">
                {isNew ? "● " : ""}
                Wochenplan freigegeben
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDate(r.week_start)} – {formatDate(r.week_end)}
              </span>
            </DropdownMenuItem>
          );
        })}

        {assignments.map((a) => {
          const isNew = !seenAt || a.created_at > seenAt;
          return (
            <DropdownMenuItem key={a.id} className="flex flex-col items-start gap-0.5">
              <span className="text-sm font-medium">
                {isNew ? "● " : ""}
                {projectName(a.project_id)}
              </span>
              <span className="text-xs text-muted-foreground">
                {a.assignment_role ? `${a.assignment_role} · ` : ""}
                {a.start_date ? `ab ${formatDate(a.start_date)}` : formatDate(a.created_at.slice(0, 10))}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
