import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileUploadButton } from "@/components/FileUploadButton";
import { useFileUrl } from "@/hooks/useFileUrl";
import { toast } from "sonner";
import { Camera, ImageOff, X } from "lucide-react";

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
  const [open, setOpen] = useState(false);

  const save = useMutation({
    mutationFn: async (next: string[]) => {
      const { error } = await supabase
        .from("time_entries")
        .update({ photo_paths: next } as never)
        .eq("id", entryId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [invalidateKey] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canUpload && paths.length === 0) return null;

  return (
    <div className="mt-2 w-full">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => setOpen((v) => !v)}
      >
        <Camera className="size-4" />
        {paths.length > 0 ? `Fotos (${paths.length})` : "Foto hinzufügen"}
      </Button>

      {open && (
        <div className="mt-2 rounded-md border bg-muted/30 p-3">
          {paths.length === 0 ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ImageOff className="size-4" /> Für diesen Arbeitsnachweis liegen keine Fotos vor.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {paths.map((p) => (
                <Foto
                  key={p}
                  path={p}
                  {...(canUpload
                    ? { onRemove: () => save.mutate(paths.filter((x) => x !== p)) }
                    : {})}
                />
              ))}
            </div>
          )}

          {canUpload && (
            <div className="mt-3">
              <FileUploadButton
                folder={`arbeitsnachweis/${entryId}`}
                accept="image/*"
                label="Foto aufnehmen / hochladen"
                onUploaded={(path) => save.mutate([...paths, path])}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Foto({ path, onRemove }: { path: string; onRemove?: () => void }) {
  const src = useFileUrl(path);
  return (
    <div className="relative">
      <a href={src || undefined} target="_blank" rel="noreferrer">
        <img
          src={src}
          alt="Foto zum Arbeitsnachweis"
          loading="lazy"
          className="size-20 rounded-md border object-cover"
        />
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
