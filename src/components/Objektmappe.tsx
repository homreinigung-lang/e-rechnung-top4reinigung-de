import type { SupabaseClient } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FileText, FolderOpen, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { FileUploadButton } from "@/components/FileUploadButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FILES_BUCKET, openStoredFile } from "@/lib/storage";
import { formatDate } from "@/lib/format";

type ProjectFile = {
  id: string;
  project_id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  category: string;
  note: string;
  created_at: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  vertrag: "Vertrag",
  leistungsverzeichnis: "Leistungsverzeichnis",
  foto: "Foto",
  arbeitsschein: "Arbeitsschein",
  sonstiges: "Sonstiges",
};

export function Objektmappe({ projectId }: { projectId: string }) {
  const db = supabase as SupabaseClient;
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("sonstiges");
  const [note, setNote] = useState("");

  const { data: files = [], isLoading } = useQuery({
    queryKey: ["project_files", projectId],
    queryFn: async () => {
      const { data, error } = await db
        .from("project_files")
        .select("id,project_id,user_id,file_name,file_path,category,note,created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProjectFile[];
    },
  });

  const addFile = useMutation({
    mutationFn: async ({ path, file }: { path: string; file: File }) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const { error } = await db.from("project_files").insert({
        user_id: userId,
        project_id: projectId,
        file_name: file.name,
        file_path: path,
        category,
        note: note.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["project_files", projectId] });
      toast.success("Datei in der Objektmappe gespeichert");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeFile = useMutation({
    mutationFn: async (file: ProjectFile) => {
      const { error: storageError } = await supabase.storage
        .from(FILES_BUCKET)
        .remove([file.file_path]);
      if (storageError) throw storageError;
      const { error } = await db.from("project_files").delete().eq("id", file.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["project_files", projectId] });
      toast.success("Datei gelöscht");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="surface space-y-4 p-5">
      <div>
        <h2 className="text-lg font-semibold">Digitale Objektmappe</h2>
        <p className="text-sm text-muted-foreground">
          Verträge, Leistungsverzeichnisse, Fotos und sonstige Objektunterlagen zentral speichern.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[220px_1fr_auto] sm:items-end">
        <div className="space-y-2">
          <Label>Kategorie</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="vertrag">Vertrag</SelectItem>
              <SelectItem value="leistungsverzeichnis">Leistungsverzeichnis</SelectItem>
              <SelectItem value="foto">Foto</SelectItem>
              <SelectItem value="arbeitsschein">Arbeitsschein</SelectItem>
              <SelectItem value="sonstiges">Sonstiges</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Notiz</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional, z. B. Vertrag ab 01.01.2027" />
        </div>
        <FileUploadButton
          folder={`objektmappe/${projectId}`}
          accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx"
          label="Datei hinzufügen"
          onUploaded={(path, file) => addFile.mutateAsync({ path, file })}
          disabled={addFile.isPending}
          showSuccessToast={false}
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Objektmappe wird geladen …</p>
      ) : files.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Noch keine Dateien in der Objektmappe.
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <div key={file.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
              <div className="flex min-w-0 items-start gap-3">
                <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <button
                    type="button"
                    className="max-w-full truncate text-left font-medium underline-offset-2 hover:underline"
                    onClick={() => void openStoredFile(file.file_path, file.file_name)}
                  >
                    {file.file_name}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    {CATEGORY_LABELS[file.category] ?? file.category} · {formatDate(file.created_at.slice(0, 10))}
                    {file.note ? ` · ${file.note}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => void openStoredFile(file.file_path, file.file_name)}>
                  <FolderOpen className="size-4" /> Öffnen
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Datei löschen"
                  disabled={removeFile.isPending}
                  onClick={() => removeFile.mutate(file)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
