import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileUploadButton } from "@/components/FileUploadButton";
import { useFileUrl } from "@/hooks/useFileUrl";
import { FILES_BUCKET } from "@/lib/storage";
import { toast } from "sonner";
import { Camera, Loader2, Trash2, X } from "lucide-react";

/**
 * Fotos gehören fest zu genau einem Arbeitszeit-Eintrag (Arbeitsnachweis).
 * Es gibt bewusst keine übergreifende Galerie: Fotos sind nur hier sichtbar.
 *
 * Rechte: Mitarbeitende dürfen ausschließlich Fotos an eigenen Einträgen
 * hinzufügen (Datenbank-Trigger erzwingt das). Die Verwaltung darf Fotos
 * zusätzlich endgültig aus dem privaten Speicher löschen.
 */
export function ArbeitsnachweisFotos({
  entryId,
  paths,
  canUpload = false,
  canDelete = false,
  invalidateKey,
}: {
  entryId: string;
  paths: string[];
  canUpload?: boolean;
  canDelete?: boolean;
  invalidateKey: string;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);

  const save = useMutation({
    mutationFn: async ({ next, purge }: { next: string[]; purge?: string[] }) => {
      const { data, error } = await supabase
        .from("time_entries")
        .update({ photo_paths: next } as never)
        .eq("id", entryId)
        .select("id,photo_paths");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(
          "Foto konnte nicht gespeichert werden (keine Berechtigung für diesen Eintrag).",
        );
      }
      // Endgültig aus dem privaten Speicher entfernen (nur Verwaltung).
      if (purge && purge.length > 0) {
        await supabase.storage.from(FILES_BUCKET).remove(purge);
      }
      return data[0];
    },
    onSuccess: () => {
      setSelected([]);
      queryClient.invalidateQueries({ queryKey: [invalidateKey] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canUpload && !canDelete && paths.length === 0) return null;

  function removeOne(path: string, purge: boolean) {
    save.mutate(
      { next: paths.filter((x) => x !== path), ...(purge ? { purge: [path] } : {}) },
      { onSuccess: () => toast.success(purge ? "Foto gelöscht" : "Foto entfernt") },
    );
  }

  function removeSelected() {
    if (selected.length === 0) return;
    save.mutate(
      { next: paths.filter((x) => !selected.includes(x)), purge: selected },
      { onSuccess: () => toast.success(`${selected.length} Foto(s) gelöscht`) },
    );
  }

  return (
    <div className="mt-2 w-full">
      <div className="flex flex-wrap items-center gap-2">
        {paths.map((p) => (
          <Foto
            key={p}
            path={p}
            selectable={canDelete}
            checked={selected.includes(p)}
            onToggle={() =>
              setSelected((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]))
            }
            {...(canUpload || canDelete
              ? { onRemove: () => removeOne(p, canDelete) }
              : {})}
          />
        ))}

        {canUpload && (
          <FileUploadButton
            folder={`arbeitsnachweis/${entryId}`}
            accept="image/*"
            label={paths.length > 0 ? "Weiteres Foto" : "Foto hinzufügen"}
            onUploaded={(path) =>
              save.mutate(
                { next: [...paths, path] },
                { onSuccess: () => toast.success("Foto gespeichert") },
              )
            }
          />
        )}

        {save.isPending && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> wird gespeichert …
          </span>
        )}
      </div>

      {paths.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Camera className="size-3" />
            {paths.length} Foto(s) zu diesem Arbeitsnachweis gespeichert
          </p>
          {canDelete && selected.length > 0 && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={save.isPending}
              onClick={removeSelected}
            >
              <Trash2 className="size-3" />
              {selected.length} Foto(s) endgültig löschen
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Foto({
  path,
  onRemove,
  selectable,
  checked,
  onToggle,
}: {
  path: string;
  onRemove?: () => void;
  selectable?: boolean;
  checked?: boolean;
  onToggle?: () => void;
}) {
  const src = useFileUrl(path);
  return (
    <div className="relative">
      <a href={src || undefined} target="_blank" rel="noreferrer">
        {src ? (
          <img
            src={src}
            alt="Foto zum Arbeitsnachweis"
            loading="lazy"
            className={`size-16 rounded-md border object-cover ${checked ? "ring-2 ring-destructive" : ""}`}
          />
        ) : (
          <div className="size-16 animate-pulse rounded-md border bg-muted" />
        )}
      </a>
      {selectable && (
        <input
          type="checkbox"
          aria-label="Foto zum Löschen auswählen"
          checked={Boolean(checked)}
          onChange={onToggle}
          className="absolute -left-1 -top-1 size-4 accent-current"
        />
      )}
      {onRemove && (
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Foto löschen"
          className="absolute -right-2 -top-2 size-6"
          onClick={onRemove}
        >
          <X className="size-3" />
        </Button>
      )}
    </div>
  );
}
