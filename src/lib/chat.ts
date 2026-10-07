import type { SupabaseClient } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const chatDb = supabase as SupabaseClient;
export const CHAT_BUCKET = "chat-dateien";
export const CHAT_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
];
export type ChatAttachment = { path: string; name: string; mime: string; size: number };
export type ChatContext = {
  assignment_id: string | null;
  work_date: string | null;
  report_id: string | null;
};
export type ChatMessage = ChatContext & {
  id: string;
  user_id: string;
  sender_auth_user_id: string;
  sender_name: string;
  sender_role: string;
  body: string;
  created_at: string;
  thread_employee_id: string;
  attachments: ChatAttachment[];
  read_at: string | null;
};
export type ChatOverview = {
  thread_employee_id: string;
  body: string;
  created_at: string;
  unread_count: number;
};
export function validateChatFile(file: Pick<File, "name" | "type" | "size">) {
  if (!CHAT_MIMES.includes(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024)
    throw new Error("Bitte JPG, PNG, WebP, PDF oder TXT bis 10 MB auswählen.");
  if (!file.name.trim() || file.name.length > 180)
    throw new Error("Dateiname ist leer oder zu lang (max. 180 Zeichen).");
}
export function chatFilePath(thread: string, message: string, uploader: string, mime: string) {
  const ext: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "text/plain": "txt",
  };
  if (!ext[mime]) throw new Error("Dateityp nicht unterstützt.");
  return `${thread}/${message}/${uploader}/${crypto.randomUUID()}.${ext[mime]}`;
}
export function useChatAuth() {
  return useQuery({
    queryKey: ["auth_user"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    },
  });
}
export function useChatOverview() {
  const { data: auth } = useChatAuth();
  return useQuery({
    queryKey: ["chat_overview", auth?.id],
    enabled: Boolean(auth),
    refetchInterval: 20_000,
    queryFn: async (): Promise<ChatOverview[]> => {
      const { data, error } = await chatDb.rpc("chat_thread_overview");
      if (error) throw error;
      return data ?? [];
    },
  });
}
export function useChatRealtime() {
  const qc = useQueryClient();
  const { data: auth } = useChatAuth();
  useEffect(() => {
    if (!auth) return;
    const channel = supabase
      .channel(`chat:${auth.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => {
        void qc.invalidateQueries({ queryKey: ["chat_messages"] });
        void qc.invalidateQueries({ queryKey: ["chat_overview"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, auth]);
}
