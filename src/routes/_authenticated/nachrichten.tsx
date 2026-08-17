import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/employee";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Send, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/nachrichten")({
  head: () => ({
    meta: [
      { title: "Interner Chat – HomR" },
      {
        name: "description",
        content:
          "Interner Chat zwischen Verwaltung und Mitarbeitenden: kurze Absprachen zu Einsätzen, Objekten und Zeiten.",
      },
      { property: "og:title", content: "Interner Chat" },
      {
        property: "og:description",
        content: "Direkte Absprachen zwischen Verwaltung und Team an einem Ort.",
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
};

function timeLabel(iso: string) {
  return new Date(iso).toLocaleString("de-DE-u-ca-gregory-nu-latn", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NachrichtenPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMyEmployee();
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const { data: auth } = useQuery({
    queryKey: ["auth_user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });

  const ownerId = me ? me.user_id : (auth?.id ?? null);
  const isOwner = !me;

  const { data: messages = [] } = useQuery({
    queryKey: ["chat_messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ChatMessage[];
    },
  });

  // Live-Aktualisierung neuer Nachrichten
  useEffect(() => {
    const channel = supabase
      .channel("chat-messages")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages" },
        () => void queryClient.invalidateQueries({ queryKey: ["chat_messages"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const senderName = useMemo(
    () => (me ? me.name : (auth?.user_metadata?.["full_name"] as string) || "Verwaltung"),
    [me, auth],
  );

  const send = useMutation({
    mutationFn: async () => {
      const body = text.trim();
      if (!body) throw new Error("Bitte eine Nachricht eingeben.");
      if (!ownerId) throw new Error("Kein Betrieb zugeordnet.");
      const { error } = await supabase.from("chat_messages").insert({
        user_id: ownerId,
        sender_name: senderName,
        sender_role: isOwner ? "owner" : "employee",
        body,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setText("");
      void queryClient.invalidateQueries({ queryKey: ["chat_messages"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chat_messages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["chat_messages"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Interner Chat</h1>
        <p className="text-sm text-muted-foreground">
          Kurze Absprachen zwischen Verwaltung und Team – für alle Beteiligten sichtbar.
        </p>
      </div>

      <div className="surface flex h-[60vh] flex-col overflow-hidden">
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 ? (
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
                      mine ? "bg-primary/10 border-primary/30" : "bg-muted"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium">
                        {m.sender_name || (m.sender_role === "owner" ? "Verwaltung" : "Team")}
                      </span>
                      <span>{timeLabel(m.created_at)}</span>
                      {isOwner && (
                        <button
                          type="button"
                          aria-label="Nachricht löschen"
                          className="ml-auto text-destructive"
                          onClick={() => remove.mutate(m.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
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
            placeholder="Nachricht schreiben …"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (text.trim()) send.mutate();
              }
            }}
          />
          <Button
            type="button"
            disabled={send.isPending || !text.trim()}
            onClick={() => send.mutate()}
          >
            <Send className="size-4" /> Senden
          </Button>
        </div>
      </div>
    </div>
  );
}
