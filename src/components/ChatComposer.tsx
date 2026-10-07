import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  chatDb,
  CHAT_BUCKET,
  CHAT_MIMES,
  chatFilePath,
  validateChatFile,
  type ChatAttachment,
  type ChatContext,
} from "@/lib/chat";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Paperclip, Send, X } from "lucide-react";
import { toast } from "sonner";
export type ChatDraft = { id: string; text: string; files: ChatAttachment[] };
export function ChatComposer({
  thread,
  ownerId,
  authId,
  context,
  draft,
  onChange,
  onSent,
}: {
  thread: string;
  ownerId: string;
  authId: string;
  context: ChatContext;
  draft: ChatDraft;
  onChange: (draft: ChatDraft) => void;
  onSent: () => void;
}) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const send = useMutation({
    mutationFn: async (snapshot: ChatDraft) => {
      const { error } = await chatDb
        .from("chat_messages")
        .insert({
          id: snapshot.id,
          user_id: ownerId,
          thread_employee_id: thread,
          body: snapshot.text.trim(),
          attachments: snapshot.files,
          ...context,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      onChange({ id: crypto.randomUUID(), text: "", files: [] });
      onSent();
      void qc.invalidateQueries({ queryKey: ["chat_messages"] });
      void qc.invalidateQueries({ queryKey: ["chat_overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => {
      lock.current = false;
    },
  });
  function submit() {
    if (lock.current || busy || (!draft.text.trim() && !draft.files.length)) return;
    lock.current = true;
    send.mutate(draft);
  }
  async function upload(file: File) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      validateChatFile(file);
      if (draft.files.length >= 3) throw new Error("Maximal drei Anhänge pro Nachricht.");
      const path = chatFilePath(thread, draft.id, authId, file.type);
      const { error } = await supabase.storage
        .from(CHAT_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      onChange({
        ...draft,
        files: [...draft.files, { path, name: file.name, mime: file.type, size: file.size }],
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload fehlgeschlagen.");
    } finally {
      lock.current = false;
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function remove(file: ChatAttachment) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    const { error } = await supabase.storage.from(CHAT_BUCKET).remove([file.path]);
    if (error) toast.error("Anhang konnte nicht entfernt werden.");
    else onChange({ ...draft, files: draft.files.filter((f) => f.path !== file.path) });
    lock.current = false;
    setBusy(false);
  }
  return (
    <div className="space-y-2 border-t p-3">
      {context.report_id || context.assignment_id ? (
        <p className="text-xs text-muted-foreground">
          Nachricht mit Verweis auf {context.report_id ? "die Meldung" : "den Einsatz"}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {draft.files.map((file) => (
          <span
            key={file.path}
            className="flex max-w-full items-center gap-1 rounded border p-1 text-xs"
          >
            <span className="truncate">{file.name}</span>
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              aria-label={`Anhang ${file.name} entfernen`}
              disabled={busy || send.isPending}
              onClick={() => void remove(file)}
            >
              <X className="size-3" />
            </Button>
          </span>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <Textarea
          rows={2}
          aria-label="Nachricht schreiben"
          maxLength={4000}
          value={draft.text}
          disabled={busy || send.isPending}
          placeholder="Nachricht schreiben …"
          onChange={(e) => onChange({ ...draft, text: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button
          size="icon"
          variant="outline"
          aria-label="Foto oder Datei anhängen"
          disabled={busy || send.isPending || draft.files.length >= 3}
          onClick={() => input.current?.click()}
        >
          <Paperclip className="size-4" />
        </Button>
        <input
          ref={input}
          type="file"
          hidden
          accept={CHAT_MIMES.join(",")}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button
          size="icon"
          aria-label="Nachricht senden"
          disabled={busy || send.isPending || (!draft.text.trim() && !draft.files.length)}
          onClick={submit}
        >
          <Send className="size-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {busy
          ? "Anhang wird verarbeitet …"
          : "Bis zu 3 Fotos, PDF oder TXT · je 10 MB · Enter senden, Shift+Enter neue Zeile"}
      </p>
    </div>
  );
}
