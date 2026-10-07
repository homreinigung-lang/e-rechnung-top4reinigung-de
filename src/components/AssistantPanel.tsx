import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { askAssistant, assistantAvailability } from "@/lib/assistant.functions";
import type { AssistantAnswer } from "@/lib/assistant";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LoadError } from "@/components/LoadError";
import { Sparkles, Loader2, Send, MessageSquare } from "lucide-react";
type Turn = { role: "user" | "assistant"; text: string; sources?: string[]; escalate?: boolean };
export function AssistantPanel({
  mode,
  assignmentId,
  date,
  employeeId,
}: {
  mode: "program" | "work";
  assignmentId?: string;
  date?: string;
  employeeId?: string;
}) {
  const ask = useServerFn(askAssistant);
  const availability = useServerFn(assistantAvailability);
  const {
    data: status,
    error: statusError,
    isLoading,
  } = useQuery({
    queryKey: ["assistant_availability"],
    queryFn: () => availability(),
    staleTime: 60_000,
  });
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const lock = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  const send = useMutation({
    mutationFn: async (snapshot: { question: string; history: Turn[] }): Promise<AssistantAnswer> =>
      ask({
        data: {
          mode,
          question: snapshot.question,
          history: snapshot.history.slice(-6).map((t) => ({ role: t.role, text: t.text })),
          ...(mode === "work" && assignmentId && date ? { assignmentId, date } : {}),
        },
      }),
    onSuccess: (answer, snapshot) => {
      setTurns((t) => [
        ...t,
        { role: "user", text: snapshot.question },
        {
          role: "assistant",
          text: answer.answer,
          sources: answer.sources,
          escalate: answer.escalate,
        },
      ]);
      setQuestion("");
    },
    onSettled: () => {
      lock.current = false;
    },
  });
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [turns.length]);
  function submit() {
    if (lock.current || !question.trim() || !status?.ready) return;
    lock.current = true;
    send.mutate({ question: question.trim(), history: turns });
  }
  const examples =
    mode === "work"
      ? [
          "Wie gehe ich bei fehlendem Material vor?",
          "Was mache ich bei einer abweichenden Arbeitszeit?",
          "Wie frage ich die Verwaltung zu diesem Einsatz?",
        ]
      : status?.worker
        ? [
            "Wie bestätige ich meine Arbeitszeit?",
            "Wie melde ich ein Problem?",
            "Wie beantrage ich Urlaub?",
          ]
        : [
            "Wie erstelle ich ein Angebot?",
            "Wie bearbeite ich eine Materialmeldung?",
            "Wie plane ich einen Einsatz?",
          ];
  const unavailable = status && !status.ready;
  return (
    <section
      lang="de"
      className="surface min-w-0 space-y-3 rounded-xl border p-4"
      aria-label={mode === "work" ? "KI-Arbeitshilfe" : "KI-Programmhilfe"}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="size-5 text-primary" />
          {mode === "work" ? "KI-Arbeitshilfe" : "KI-Programmhilfe"}
        </h2>
        {turns.length ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={send.isPending}
            onClick={() => {
              setTurns([]);
              send.reset();
            }}
          >
            Neues Gespräch
          </Button>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">
        {mode === "work"
          ? assignmentId
            ? `Fragen zu diesem Einsatz am ${date?.split("-").reverse().join(".")}.`
            : "Fragen zu Reinigung, Arbeitszeiten, Material und Ihrem Mitarbeiterbereich."
          : "Fragen zur Bedienung von GebCalc – mit kurzen Erklärungen und nächsten Schritten."}{" "}
        Antworten auf Deutsch.
      </p>
      <LoadError error={statusError} title="KI-Assistent konnte nicht geladen werden" />
      {isLoading ? <p className="text-sm">KI-Assistent wird geladen …</p> : null}
      {unavailable ? (
        <p role="status" className="rounded border p-3 text-sm">
          Der KI-Assistent ist noch nicht eingerichtet. Bitte die Verwaltung kontaktieren.
        </p>
      ) : null}
      {turns.length === 0 ? (
        <div className="flex flex-wrap gap-2">
          {examples.map((example) => (
            <Button
              key={example}
              variant="outline"
              size="sm"
              className="h-auto whitespace-normal text-left"
              disabled={!status?.ready || send.isPending}
              onClick={() => setQuestion(example)}
            >
              {example}
            </Button>
          ))}
        </div>
      ) : null}
      <div
        className="max-h-[45vh] space-y-3 overflow-y-auto"
        aria-live="polite"
        aria-busy={send.isPending}
      >
        {turns.map((turn, index) => (
          <article
            key={index}
            className={`rounded-lg p-3 text-sm ${turn.role === "user" ? "bg-primary/10" : "bg-muted"}`}
          >
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              {turn.role === "user" ? "Ihre Frage" : "KI-Assistent"}
            </p>
            <p className="whitespace-pre-wrap break-words">{turn.text}</p>
            {turn.sources ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Grundlage: {turn.sources.join(" · ")}
              </p>
            ) : null}
            {turn.escalate ? (
              <p className="mt-2 text-xs font-medium">Bitte mit der Verwaltung klären.</p>
            ) : null}
          </article>
        ))}
        {send.isPending ? (
          <p className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Antwort wird erstellt …
          </p>
        ) : null}
        <div ref={end} />
      </div>
      <LoadError error={send.error} title="Frage konnte nicht beantwortet werden" />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="flex items-end gap-2"
      >
        <Textarea
          aria-label="Frage an den KI-Assistenten"
          placeholder="Ihre Frage auf Deutsch …"
          rows={2}
          maxLength={2000}
          disabled={!status?.ready || send.isPending}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button
          type="submit"
          size="icon"
          aria-label="KI-Frage senden"
          disabled={!status?.ready || send.isPending || !question.trim()}
        >
          <Send className="size-4" />
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        Ihre Frage und ausgewählte Einsatzinformationen werden an Google Gemini übermittelt. Der
        Gesprächsverlauf bleibt in dieser Ansicht. Prüfen Sie KI-Antworten anhand der
        Objektvorgaben.
      </p>
      {employeeId ? (
        <Button asChild variant="outline" size="sm">
          <Link
            to="/nachrichten"
            search={{
              mitarbeiter: employeeId,
              ...(assignmentId && date ? { einsatz: assignmentId, datum: date } : {}),
            }}
          >
            <MessageSquare className="size-4" />
            Verwaltung fragen
          </Link>
        </Button>
      ) : null}
    </section>
  );
}
