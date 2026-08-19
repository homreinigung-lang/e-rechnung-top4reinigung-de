import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, FolderOpen, ImageIcon, Trash2 } from "lucide-react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileUploadButton } from "@/components/FileUploadButton";
import { openStoredFile } from "@/lib/storage";
import { formatDate } from "@/lib/format";

type ProjectDocument = {
  id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  file_size: number;
  created_at: string;
};

function sizeLabel(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Projektunterlagen (Grundrisse, PDFs, Fotos) – dauerhaft am Projekt gespeichert,
 * damit hochgeladene Dateien der Kalkulation nicht verloren gehen.
 */
export function ProjektUnterlagen({ projectId }: { projectId: string | null }) {
  const queryClient = useQueryClient();

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["project_documents", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_documents")
        .select("id,file_name,file_path,mime_type,file_size,created_at")
        .eq("project_id", projectId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProjectDocument[];
    },
  });

  const addDoc = useMutation({
    mutationFn: async ({ path, file }: { path: string; file: File }) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const { error } = await supabase.from("project_documents").insert({
        user_id: userId,
        project_id: projectId!,
        file_name: file.name,
        file_path: path,
        mime_type: file.type || "",
        file_size: file.size,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Unterlage zum Projekt gespeichert");
      queryClient.invalidateQueries({ queryKey: ["project_documents", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeDoc = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("project_documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Unterlage entfernt");
      queryClient.invalidateQueries({ queryKey: ["project_documents", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium">
            <FolderOpen className="size-4" /> Projektunterlagen
          </p>
          <p className="text-xs text-muted-foreground">
            Grundrisse, Leistungsverzeichnisse, PDFs und Fotos – fest mit diesem Projekt verknüpft
            und jederzeit wieder abrufbar.
          </p>
        </div>
        {projectId && (
          <FileUploadButton
            folder={`projekt/${projectId}`}
            accept="application/pdf,image/jpeg,image/png,image/webp,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            label="Unterlage hochladen"
            onUploaded={(path, file) => addDoc.mutate({ path, file })}
          />
        )}
      </div>

      {!projectId ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          Bitte oben ein Projekt verknüpfen, damit Unterlagen dauerhaft am Projekt gespeichert
          werden können.
        </p>
      ) : isLoading ? (
        <p className="text-xs text-muted-foreground">Unterlagen werden geladen …</p>
      ) : docs.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          Noch keine Unterlagen zu diesem Projekt hochgeladen.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {docs.map((d) => {
            const isImage = d.mime_type.startsWith("image/");
            return (
              <li key={d.id} className="flex items-center gap-2 p-2">
                {isImage ? (
                  <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                )}
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() =>
                    void openStoredFile(d.file_path, d.file_name).catch(() =>
                      toast.error("Datei konnte nicht geöffnet werden."),
                    )
                  }
                >
                  <span className="block truncate text-sm hover:underline">{d.file_name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatDate(d.created_at)}
                    {sizeLabel(Number(d.file_size ?? 0))
                      ? ` · ${sizeLabel(Number(d.file_size ?? 0))}`
                      : ""}
                  </span>
                </button>
                <ConfirmDeleteButton
                  iconClassName="size-4"
                  ariaLabel="Unterlage entfernen"
                  title="Unterlage wirklich löschen?"
                  description={`Die Unterlage „${d.file_name || "ohne Namen"}" wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`}
                  onConfirm={() => removeDoc.mutate(d.id)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
