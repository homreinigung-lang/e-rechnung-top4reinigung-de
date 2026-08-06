import { toast } from "sonner";

type SaveFilePicker = (options: {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}>;

function extensionOf(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot > -1 ? filename.slice(dot).toLowerCase() : "";
}

function describe(ext: string) {
  switch (ext) {
    case ".csv":
      return "CSV-Datei";
    case ".pdf":
      return "PDF-Dokument";
    case ".xls":
    case ".xlsx":
      return "Excel-Datei";
    case ".zip":
      return "ZIP-Archiv";
    case ".xml":
      return "XML-Datei";
    default:
      return "Datei";
  }
}

function fallbackDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 5000);
}

/**
 * Speichert eine Datei lokal. Wenn der Browser es unterstützt, öffnet sich der
 * native „Speichern unter…“-Dialog, sonst wird direkt in den Download-Ordner
 * gespeichert. Zeigt Fortschritt und Bestätigung als Toast an.
 */
export async function saveFile(blob: Blob, filename: string): Promise<boolean> {
  const ext = extensionOf(filename);
  const toastId = toast.loading(`„${filename}“ wird vorbereitet…`);

  try {
    const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker })
      .showSaveFilePicker;

    if (typeof picker === "function") {
      try {
        const handle = await picker({
          suggestedName: filename,
          types: ext
            ? [{ description: describe(ext), accept: { [blob.type || "application/octet-stream"]: [ext] } }]
            : [],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        toast.success("Download abgeschlossen", {
          id: toastId,
          description: `„${filename}“ wurde am gewählten Speicherort gespeichert.`,
          duration: 6000,
        });
        return true;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          toast.info("Speichern abgebrochen", { id: toastId, duration: 3000 });
          return false;
        }
        // Picker nicht nutzbar (z. B. iframe/Berechtigung) → normaler Download
      }
    }

    fallbackDownload(blob, filename);
    toast.success("Download gestartet", {
      id: toastId,
      description: `„${filename}“ wurde in Ihrem Download-Ordner gespeichert.`,
      duration: 6000,
    });
    return true;
  } catch (e) {
    toast.error("Download fehlgeschlagen", {
      id: toastId,
      description: e instanceof Error ? e.message : undefined,
    });
    return false;
  }
}
