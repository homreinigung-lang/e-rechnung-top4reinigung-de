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
  disabled = false,
  onBusyChange,
}: {
  folder: string;
  accept?: string;
  label?: string;
  onUploaded: (path: string, file: File) => void | Promise<void>;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handle(file: File) {
    if (busy || disabled) return;
    setBusy(true);
    onBusyChange?.(true);
    try {
      const path = await uploadUserFile(file, folder);
      // Upload and document analysis are separate steps. Do not signal a
      // successful analysis merely because Storage accepted the file.
      await onUploaded(path, file);
      toast.success("Datei angehängt");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload oder Verarbeitung fehlgeschlagen");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={busy || disabled}
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
