import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { downloadStoredFile, fetchStoredBlob } from "@/lib/storage";

function nameFromPath(pathOrUrl: string) {
  const clean = pathOrUrl.split("?")[0] ?? pathOrUrl;
  return decodeURIComponent(clean.split("/").pop() || "datei");
}

/**
 * Interne Dateivorschau: die Datei wird als Blob geladen und im Dialog angezeigt.
 * Dadurch entstehen keine externen Aufrufe, die von Browsern/Adblockern
 * geblockt werden könnten (ERR_BLOCKED_BY_CLIENT).
 */
export function DateiVorschau({
  path,
  filename,
  onClose,
}: {
  path: string | null;
  filename?: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!path) {
      setUrl("");
      setType("");
      setFailed(false);
      return;
    }
    let objectUrl = "";
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetchStoredBlob(path)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setType(blob.type || "");
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  const name = filename || (path ? nameFromPath(path) : "Datei");
  const isImage = type.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif)$/i.test(name);

  return (
    <Dialog open={!!path} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate">{name}</DialogTitle>
          <DialogDescription>Vorschau im Programm – ohne externen Aufruf</DialogDescription>
        </DialogHeader>

        <div className="h-[60vh] overflow-auto rounded-md border bg-muted/30">
          {loading && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> Datei wird geladen…
            </div>
          )}
          {!loading && failed && (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Die Datei konnte nicht geladen werden. Bitte den Download verwenden.
            </div>
          )}
          {!loading &&
            !failed &&
            url &&
            (isImage ? (
              <img src={url} alt={name} className="mx-auto max-h-full object-contain" />
            ) : (
              <iframe src={url} title={name} className="h-full w-full" />
            ))}
        </div>

        <div className="flex justify-end">
          <Button
            onClick={() =>
              void downloadStoredFile(path, name).catch(() =>
                toast.error("Download nicht möglich."),
              )
            }
          >
            <Download className="mr-2 size-4" /> Herunterladen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
