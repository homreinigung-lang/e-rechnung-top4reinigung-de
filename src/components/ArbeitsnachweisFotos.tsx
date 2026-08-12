import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileUploadButton } from "@/components/FileUploadButton";
import { useFileUrl } from "@/hooks/useFileUrl";
import { toast } from "sonner";
import { Camera, X } from "lucide-react";

/**
 * Fotos gehören fest zu genau einem Arbeitszeit-Eintrag (Arbeitsnachweis).
 * Es gibt bewusst keine übergreifende Galerie: Fotos sind nur hier sichtbar.
 */
export function ArbeitsnachweisFotos({
  entryId,
  paths,
  canUpload = false,
  invalidateKey,
}: {
  entryId: string;
  paths: string[];
  canUpload?: boolean;
  invalidateKey: string;
}) {
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: async (next: string[]) => {
      const { data, error } = await supabase
        .from("time_entries")
        .update({ photo_paths: next } as never)
        .eq("id", entryId)
        .select("id,photo_paths");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Foto konnte nicht gespeichert werden (keine Berechtigung für diesen Eintrag).");
      }
      return data[0];
    },
    onSuccess: () => {
      toast.success("Foto gespeichert");
      queryClient.invalidateQueries({ queryKey: [invalidateKey] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canUpload && paths.length === 0) return null;

  return (
    <div className="mt-2 w-full">
      <div className="flex flex-wrap items-center gap-2">
        {paths.map((p) => (
          <Foto
            key={p}
            path={p}
            {...(canUpload
              ? { onRemove: () => save.mutate(paths.filter((x) => x !== p)) }
              : {})}
          />
        ))}

        {canUpload && (
          <FileUploadButton
            folder={`arbeitsnachweis/${entryId}`}
            accept="image/*"
            label={paths.length > 0 ? "Weiteres Foto" : "Foto hinzufügen"}
            onUploaded={(path) => save.mutate([...paths, path])}
          />
        )}
      </div>

      {paths.length > 0 && (
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Camera className="size-3" />
          {paths.length} Foto(s) zu diesem Arbeitsnachweis gespeichert
        </p>
      )}
    </div>
  );
}

function Foto({ path, onRemove }: { path: string; onRemove?: () => void }) {
  const src = useFileUrl(path);
  return (
    <div className="relative">
      <a href={src || undefined} target="_blank" rel="noreferrer">
        {src ? (
          <img
            src={src}
            alt="Foto zum Arbeitsnachweis"
            loading="lazy"
            className="size-16 rounded-md border object-cover"
          />
        ) : (
          <div className="size-16 animate-pulse rounded-md border bg-muted" />
        )}
      </a>
      {onRemove && (
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="absolute -right-2 -top-2 size-6"
          onClick={onRemove}
        >
          <X className="size-3" />
        </Button>
      )}
    </div>
  );
}
