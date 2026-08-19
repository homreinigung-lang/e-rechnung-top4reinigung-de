import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/employee";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MessageSquare, Search, Send, Trash2, Users } from "lucide-react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";

export const Route = createFileRoute("/_authenticated/nachrichten")({
  head: () => ({
    meta: [
      { title: "Interner Chat – HomR" },
      {
        name: "description",
        content:
          "Direktnachrichten zwischen Verwaltung und einzelnen Mitarbeitenden: Absprachen zu Einsätzen, Objekten und Zeiten.",
      },
      { property: "og:title", content: "Interner Chat" },
      {
        property: "og:description",
        content: "Private Einzelgespräche zwischen Verwaltung und Team an einem Ort.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NachrichtenPage,
});

type ChatMessage = {
  id: string;
  user_id: string;
  sender_auth_user_id: string;
  sender_name: string;
  sender_role: string;
  body: string;
  created_at: string;
  thread_employee_id: string | null;
};

type EmployeeRow = { id: string; name: string; role: string; active: boolean };

function timeLabel(iso: string) {
  return new Date(iso).toLocaleString("de-DE-u-ca-gregory-nu-latn", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function NachrichtenPage() {
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useMyEmployee();
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const { data: auth } = useQuery({
    queryKey: ["auth_user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });

  const isOwner = !meLoading && !me;
  const ownerId = me ? me.user_id : (auth?.id ?? null);

  // Mitarbeiterliste (nur Verwaltung)
  const { data: employees = [] } = useQuery({
    queryKey: ["chat_employees"],
    enabled: isOwner,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id,name,role,active")
        .order("name");
      if (error) throw error;
      return (data ?? []) as EmployeeRow[];
    },
  });

  // Mitarbeitende sehen nur ihren eigenen Gesprächsfaden
  const threadId = isOwner ? selected : (me?.id ?? null);

  const { data: messages = [] } = useQuery({
    queryKey: ["chat_messages", threadId],
    enabled: Boolean(threadId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("thread_employee_id", threadId!)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ChatMessage[];
    },
  });

  // Letzte Nachricht je Gesprächsfaden für die Vorschau in der Liste
  const { data: overview = [] } = useQuery({
    queryKey: ["chat_overview"],
    enabled: isOwner,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("thread_employee_id,body,created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as {
        thread_employee_id: string | null;
        body: string;
        created_at: string;
      }[];
    },
  });

  const lastByThread = useMemo(() => {
    const map = new Map<string, { body: string; created_at: string }>();
    for (const row of overview) {
      if (!row.thread_employee_id) continue;
      if (!map.has(row.thread_employee_id)) {
        map.set(row.thread_employee_id, { body: row.body, created_at: row.created_at });
      }
    }
    return map;
  }, [overview]);

  useEffect(() => {
    const channel = supabase
      .channel("chat-messages")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["chat_messages"] });
        void queryClient.invalidateQueries({ queryKey: ["chat_overview"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, threadId]);

  const senderName = useMemo(
    () => (me ? me.name : (auth?.user_metadata?.["full_name"] as string) || "Verwaltung"),
    [me, auth],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? employees.filter((e) => `${e.name} ${e.role}`.toLowerCase().includes(q))
      : employees;
    return [...list].sort((a, b) => {
      const la = lastByThread.get(a.id)?.created_at ?? "";
      const lb = lastByThread.get(b.id)?.created_at ?? "";
      if (la !== lb) return lb.localeCompare(la);
      return a.name.localeCompare(b.name, "de");
    });
  }, [employees, search, lastByThread]);

  const activePartner = useMemo(
    () => employees.find((e) => e.id === selected) ?? null,
    [employees, selected],
  );

  const send = useMutation({
    mutationFn: async () => {
      const body = text.trim();
      if (!body) throw new Error("Bitte eine Nachricht eingeben.");
      if (!ownerId) throw new Error("Kein Betrieb zugeordnet.");
      if (!threadId) throw new Error("Bitte zuerst eine Person auswählen.");
      const { error } = await supabase.from("chat_messages").insert({
        user_id: ownerId,
        sender_name: senderName,
        sender_role: isOwner ? "owner" : "employee",
        thread_employee_id: threadId,
        body,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setText("");
      void queryClient.invalidateQueries({ queryKey: ["chat_messages"] });
      void queryClient.invalidateQueries({ queryKey: ["chat_overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chat_messages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chat_messages"] });
      void queryClient.invalidateQueries({ queryKey: ["chat_overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const headerTitle = isOwner ? (activePartner?.name ?? "Kein Gespräch ausgewählt") : "Verwaltung";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Interner Chat</h1>
        <p className="text-sm text-muted-foreground">
          {isOwner
            ? "Direktnachrichten: Person links auswählen und privat schreiben."
            : "Direkter Draht zur Verwaltung – nur Sie und die Verwaltung sehen diesen Verlauf."}
        </p>
      </div>

      <div className={`grid gap-4 ${isOwner ? "lg:grid-cols-[280px_1fr]" : ""}`}>
        {isOwner && (
          <aside className="surface flex h-[65vh] flex-col overflow-hidden">
            <div className="border-b p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Users className="size-4" /> Mitarbeitende
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Suchen …"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  Keine Mitarbeitenden gefunden.
                </p>
              ) : (
                filtered.map((e) => {
                  const last = lastByThread.get(e.id);
                  const active = e.id === selected;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setSelected(e.id)}
                      className={`mb-1 flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition hover:bg-muted ${
                        active ? "bg-primary/10 ring-1 ring-primary/30" : ""
                      }`}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                        {initials(e.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">{e.name}</span>
                          {!e.active && (
                            <span className="text-[10px] text-muted-foreground">inaktiv</span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {last ? last.body : e.role || "Noch keine Nachrichten"}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </aside>
        )}

        <div className="surface flex h-[65vh] flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b p-3">
            <MessageSquare className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">{headerTitle}</span>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {isOwner && !threadId ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Bitte links eine Person auswählen, um das Gespräch zu öffnen.
              </p>
            ) : messages.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Noch keine Nachrichten. Schreiben Sie die erste Nachricht.
              </p>
            ) : (
              messages.map((m) => {
                const mine = m.sender_auth_user_id === auth?.id;
                return (
                  <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                    <div
                      className={`max-w-[80%] rounded-lg border px-3 py-2 text-sm ${
                        mine ? "border-primary/30 bg-primary/10" : "bg-muted"
                      }`}
                    >
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium">
                          {m.sender_name || (m.sender_role === "owner" ? "Verwaltung" : "Team")}
                        </span>
                        <span>{timeLabel(m.created_at)}</span>
                        {isOwner && (
                          <ConfirmDeleteButton
                            size="sm"
                            className="ml-auto size-6 p-0 text-destructive"
                            iconClassName="size-3.5"
                            ariaLabel="Nachricht löschen"
                            title="Nachricht wirklich löschen?"
                            description={`Die Nachricht von „${m.sender_name || (m.sender_role === "owner" ? "Verwaltung" : "Team")}" wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`}
                            onConfirm={() => remove.mutate(m.id)}
                          />
                        )}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={endRef} />
          </div>

          <div className="flex items-end gap-2 border-t p-3">
            <Textarea
              rows={2}
              value={text}
              disabled={!threadId}
              placeholder={threadId ? "Nachricht schreiben …" : "Zuerst eine Person auswählen …"}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (text.trim() && threadId) send.mutate();
                }
              }}
            />
            <Button
              type="button"
              disabled={send.isPending || !text.trim() || !threadId}
              onClick={() => send.mutate()}
            >
              <Send className="size-4" /> Senden
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
