import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Upload } from "lucide-react";
import { uploadUserFile } from "@/lib/storage";
import { toast } from "sonner";

export function FileUploadButton({
  folder,
  accept,
  label = "Datei auswählen",
  onUploaded,
}: {
  folder: string;
  accept?: string;
  label?: string;
  onUploaded: (path: string, file: File) => void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handle(file: File) {
    setBusy(true);
    try {
      const path = await uploadUserFile(file, folder);
      onUploaded(path, file);
      toast.success("Datei hochgeladen");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {label}
      </Button>
      <input
        id={id}
        ref={inputRef}
        type="file"
        {...(accept ? { accept } : {})}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handle(file);
          e.target.value = "";
        }}
      />
    </>
  );
}
