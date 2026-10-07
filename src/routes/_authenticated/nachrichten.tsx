import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useMyEmployee } from "@/lib/employee";
import {
  chatDb,
  useChatAuth,
  useChatOverview,
  type ChatMessage,
  type ChatContext as Context,
} from "@/lib/chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadError } from "@/components/LoadError";
import { ChatAttachment } from "@/components/ChatAttachment";
import { ChatContext } from "@/components/ChatContext";
import { ChatComposer, type ChatDraft } from "@/components/ChatComposer";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { toast } from "sonner";
import { MessageSquare, Search, CheckCheck, Users } from "lucide-react";

const optionalId = z.string().uuid().optional().catch(undefined);
export const Route = createFileRoute("/_authenticated/nachrichten")({
  validateSearch: z.object({
    mitarbeiter: optionalId,
    einsatz: optionalId,
    meldung: optionalId,
    datum: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .catch(undefined),
  }),
  head: () => ({
    meta: [
      { title: "Interner Chat – GebCalc" },
      {
        name: "description",
        content:
          "Private Nachrichten zwischen Verwaltung und Mitarbeitenden mit Anhängen und Einsatzverweisen.",
      },
    ],
  }),
  component: NachrichtenPage,
});
type EmployeeRow = {
  id: string;
  name: string;
  role: string;
  active: boolean;
  auth_user_id: string | null;
};
function timeLabel(iso: string) {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function NachrichtenPage() {
  const qc = useQueryClient();
  const params = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: me, isLoading: meLoading, error: meError } = useMyEmployee();
  const { data: auth, error: authError } = useChatAuth();
  const overviewQuery = useChatOverview();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ChatDraft>>({});
  const viewport = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const lastSeen = useRef<string | null>(null);
  const nearBottom = useRef(true);
  const [newBelow, setNewBelow] = useState(false);
  const [readError, setReadError] = useState<unknown>(null);
  const readBusy = useRef(false);
  const isOwner = !meLoading && !me && !meError;
  const ownerId = me?.user_id ?? auth?.id;
  const employeeQuery = useQuery({
    queryKey: ["chat_employees", auth?.id],
    enabled: isOwner && Boolean(auth),
    queryFn: async () => {
      const { data, error } = await chatDb
        .from("employees")
        .select("id,name,role,active,auth_user_id")
        .order("name");
      if (error) throw error;
      return (data ?? []) as EmployeeRow[];
    },
  });
  const selectedId = selected ?? params.mitarbeiter ?? null;
  const thread = isOwner ? selectedId : (me?.id ?? null);
  const context: Context =
    !isOwner || selectedId === params.mitarbeiter
      ? {
          assignment_id: params.einsatz ?? null,
          work_date: params.datum ?? null,
          report_id: params.meldung ?? null,
        }
      : { assignment_id: null, work_date: null, report_id: null };
  const messagesQuery = useInfiniteQuery({
    queryKey: ["chat_messages", auth?.id, thread],
    enabled: Boolean(thread && auth && !meLoading && !meError),
    refetchInterval: 20_000,
    initialPageParam: null as { created_at: string; id: string } | null,
    queryFn: async ({ pageParam }) => {
      let q = chatDb
        .from("chat_messages")
        .select("*")
        .eq("thread_employee_id", thread!)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(50);
      if (pageParam)
        q = q.or(
          `created_at.lt.${pageParam.created_at},and(created_at.eq.${pageParam.created_at},id.lt.${pageParam.id})`,
        );
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ChatMessage[];
    },
    getNextPageParam: (last) =>
      last.length === 50
        ? { created_at: last[last.length - 1]!.created_at, id: last[last.length - 1]!.id }
        : undefined,
  });
  const messages = useMemo(
    () => [...(messagesQuery.data?.pages.flat() ?? [])].reverse(),
    [messagesQuery.data],
  );
  const overview = useMemo(
    () => new Map((overviewQuery.data ?? []).map((row) => [row.thread_employee_id, row])),
    [overviewQuery.data],
  );
  const filtered = useMemo(
    () =>
      [...(employeeQuery.data ?? [])]
        .filter((e) => `${e.name} ${e.role}`.toLowerCase().includes(search.trim().toLowerCase()))
        .sort(
          (a, b) =>
            (overview.get(b.id)?.created_at ?? "").localeCompare(
              overview.get(a.id)?.created_at ?? "",
            ) || a.name.localeCompare(b.name, "de"),
        ),
    [employeeQuery.data, search, overview],
  );
  const partner = employeeQuery.data?.find((e) => e.id === selectedId);
  const draft = thread ? drafts[thread] : undefined;
  useEffect(() => {
    if (thread && !draft)
      setDrafts((d) => ({ ...d, [thread]: { id: crypto.randomUUID(), text: "", files: [] } }));
  }, [thread, draft]);
  useEffect(() => {
    lastSeen.current = null;
    nearBottom.current = true;
    setNewBelow(false);
    setReadError(null);
  }, [thread]);
  const latest = messages[messages.length - 1]?.id ?? null;
  useEffect(() => {
    if (!latest) return;
    if (lastSeen.current !== latest) {
      if (nearBottom.current) {
        end.current?.scrollIntoView({ block: "end" });
        setNewBelow(false);
      } else setNewBelow(true);
      lastSeen.current = latest;
    }
  }, [latest, thread]);

  // Only received bubbles visible in a focused tab are acknowledged.
  useEffect(() => {
    const root = viewport.current;
    if (!root || !auth) return;
    const visible = new Set<string>();
    const mark = async () => {
      if (
        !document.hasFocus() ||
        document.visibilityState !== "visible" ||
        readBusy.current ||
        !visible.size
      )
        return;
      const ids = [...visible];
      readBusy.current = true;
      try {
        const { error } = await chatDb
          .from("chat_messages")
          .update({ read_at: new Date().toISOString() })
          .in("id", ids)
          .eq("thread_employee_id", thread!)
          .neq("sender_auth_user_id", auth.id)
          .is("read_at", null);
        if (error) throw error;
        setReadError(null);
        void qc.invalidateQueries({ queryKey: ["chat_messages"] });
        void qc.invalidateQueries({ queryKey: ["chat_overview"] });
      } catch (e) {
        setReadError(e);
      } finally {
        readBusy.current = false;
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset["unreadId"];
          if (id) {
            if (entry.isIntersecting) visible.add(id);
            else visible.delete(id);
          }
        }
        void mark();
      },
      { root, threshold: 0 },
    );
    root.querySelectorAll("[data-unread-id]").forEach((el) => observer.observe(el));
    const onFocus = () => void mark();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const timer = window.setInterval(onFocus, 10_000);
    return () => {
      observer.disconnect();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.clearInterval(timer);
    };
  }, [messages, auth, thread, qc]);
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await chatDb.from("chat_messages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["chat_messages"] });
      void qc.invalidateQueries({ queryKey: ["chat_overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  function clearContext() {
    void navigate({ search: { mitarbeiter: selectedId ?? undefined }, replace: true });
  }
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Interner Chat</h1>
        <p className="text-sm text-muted-foreground">
          {isOwner
            ? "Privates Gespräch auswählen und mit dem Team abstimmen."
            : "Direkter Draht zur Verwaltung – nur Sie und die Verwaltung sehen dieses Gespräch."}
        </p>
      </div>
      <LoadError error={meError || authError || employeeQuery.error || overviewQuery.error} />
      <div className={`grid gap-4 ${isOwner ? "lg:grid-cols-[280px_1fr]" : ""}`}>
        {isOwner ? (
          <aside className="surface flex max-h-[30vh] flex-col overflow-hidden lg:max-h-none lg:h-[70vh]">
            <div className="border-b p-3">
              <p className="mb-2 flex gap-2 text-sm font-medium">
                <Users className="size-4" />
                Mitarbeitende
              </p>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  aria-label="Mitarbeitende suchen"
                  placeholder="Suchen …"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {employeeQuery.isLoading ? (
                <p>Gespräche werden geladen …</p>
              ) : filtered.length === 0 ? (
                <p className="p-3 text-sm">Keine Mitarbeitenden gefunden.</p>
              ) : (
                filtered.map((e) => {
                  const last = overview.get(e.id);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => {
                        nearBottom.current = true;
                        lastSeen.current = null;
                        setSelected(e.id);
                      }}
                      className={`mb-1 w-full rounded-md p-2 text-left hover:bg-muted ${selectedId === e.id ? "bg-primary/10 ring-1 ring-primary/30" : ""}`}
                    >
                      <span className="flex items-center justify-between gap-2 text-sm font-medium">
                        {e.name}
                        {last?.unread_count ? (
                          <span
                            className="rounded-full bg-primary px-2 text-xs text-primary-foreground"
                            aria-label={`${last.unread_count} ungelesene Nachrichten`}
                          >
                            {last.unread_count}
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {last?.body ?? e.role ?? "Noch keine Nachrichten"}
                        {!e.active ? " · inaktiv" : ""}
                        {!e.auth_user_id ? " · kein Portalzugang" : ""}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </aside>
        ) : null}
        <div className="surface flex h-[70vh] min-w-0 flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b p-3">
            <MessageSquare className="size-4" />
            <span className="text-sm font-medium">
              {isOwner ? (partner?.name ?? "Kein Gespräch ausgewählt") : "Verwaltung"}
            </span>
          </div>
          <div
            ref={viewport}
            onScroll={() => {
              const el = viewport.current;
              if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              if (nearBottom.current) setNewBelow(false);
            }}
            className="flex-1 space-y-3 overflow-y-auto p-4"
          >
            <LoadError
              error={messagesQuery.error}
              onRetry={() => void messagesQuery.refetch()}
              title="Nachrichten konnten nicht geladen werden"
            />
            <LoadError error={readError} title="Lesestatus konnte nicht gespeichert werden" />
            {messagesQuery.hasNextPage ? (
              <Button
                variant="outline"
                disabled={messagesQuery.isFetchingNextPage}
                onClick={() => {
                  nearBottom.current = false;
                  void messagesQuery.fetchNextPage();
                }}
              >
                Ältere Nachrichten laden
              </Button>
            ) : null}
            {!thread ? (
              <p className="py-8 text-center text-sm">Bitte eine Person auswählen.</p>
            ) : messagesQuery.isLoading ? (
              <p>Nachrichten werden geladen …</p>
            ) : messages.length === 0 && !messagesQuery.error ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Noch keine Nachrichten.
              </p>
            ) : null}
            {messages.map((m) => {
              const mine = m.sender_auth_user_id === auth?.id;
              return (
                <div
                  key={m.id}
                  data-unread-id={!mine && !m.read_at ? m.id : undefined}
                  className={`flex ${mine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[90%] rounded-lg border p-3 text-sm ${mine ? "border-primary/30 bg-primary/10" : "bg-muted"}`}
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium">{m.sender_name || "Team"}</span>
                      <span>{timeLabel(m.created_at)}</span>
                      {isOwner ? (
                        <ConfirmDeleteButton
                          size="sm"
                          className="ml-auto size-6 p-0 text-destructive"
                          ariaLabel="Nachricht löschen"
                          title="Nachricht wirklich löschen?"
                          description="Diese Nachricht wird aus dem Gespräch gelöscht."
                          onConfirm={() => remove.mutate(m.id)}
                        />
                      ) : null}
                    </div>
                    {m.body ? (
                      <p className="mt-1 whitespace-pre-wrap break-words">{m.body}</p>
                    ) : null}
                    {m.attachments.map((file) => (
                      <ChatAttachment key={file.path} file={file} />
                    ))}
                    <ChatContext context={m} employee={Boolean(me)} />
                    {mine ? (
                      <p className="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                        {m.read_at ? (
                          <>
                            <CheckCheck className="size-3" />
                            Gelesen · {timeLabel(m.read_at)}
                          </>
                        ) : (
                          "Gesendet"
                        )}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
            <div ref={end} />
          </div>
          {newBelow ? (
            <Button
              variant="secondary"
              onClick={() => {
                end.current?.scrollIntoView({ block: "end" });
                nearBottom.current = true;
                setNewBelow(false);
              }}
            >
              Neue Nachrichten anzeigen
            </Button>
          ) : null}
          {context.assignment_id || context.report_id ? (
            <div className="flex items-center justify-between border-t px-3">
              <ChatContext context={context} employee={Boolean(me)} />
              <Button variant="ghost" size="sm" onClick={clearContext}>
                Verweis entfernen
              </Button>
            </div>
          ) : null}
          {thread && ownerId && auth && draft ? (
            <ChatComposer
              key={thread}
              thread={thread}
              ownerId={ownerId}
              authId={auth.id}
              context={context}
              draft={draft}
              onChange={(next) => setDrafts((d) => ({ ...d, [thread]: next }))}
              onSent={() => undefined}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
