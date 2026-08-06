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

/** Korrekter MIME-Typ je Dateiendung – wichtig für iOS/Safari. */
export function mimeFor(filename: string) {
  switch (extensionOf(filename)) {
    case ".csv":
      return "text/csv;charset=utf-8;";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".xls":
      return "application/vnd.ms-excel;charset=utf-8;";
    case ".pdf":
      return "application/pdf";
    case ".zip":
      return "application/zip";
    case ".xml":
      return "application/xml;charset=utf-8;";
    default:
      return "application/octet-stream";
  }
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

function isIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && typeof document !== "undefined" && "ontouchend" in document)
  );
}

/**
 * Erzwingt einen echten Datei-Download über einen Anchor mit download-Attribut.
 * Auf iOS wird der Blob zusätzlich als application/octet-stream ausgeliefert,
 * damit Safari die Datei nicht als Text im Tab öffnet.
 */
function fallbackDownload(blob: Blob, filename: string) {
  const payload = isIos() ? new Blob([blob], { type: "application/octet-stream" }) : blob;
  const url = URL.createObjectURL(payload);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.target = "_self";
  a.style.display = "none";
  document.body.appendChild(a);
  a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 10000);
}

/** iOS: „In Dateien sichern…“ über das native Teilen-Blatt. */
async function iosShare(blob: Blob, filename: string): Promise<boolean> {
  try {
    if (typeof File === "undefined" || !navigator.canShare || !navigator.share) return false;
    const file = new File([blob], filename, { type: blob.type || mimeFor(filename) });
    if (!navigator.canShare({ files: [file] })) return false;
    await navigator.share({ files: [file], title: filename });
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return false;
  }
}

/**
 * Speichert eine Datei lokal. Wenn der Browser es unterstützt, öffnet sich der
 * native „Speichern unter…“-Dialog (bzw. auf iOS das Teilen-/Dateien-Blatt),
 * sonst wird direkt in den Download-Ordner gespeichert.
 */
export async function saveFile(blobOrData: Blob, filename: string): Promise<boolean> {
  const ext = extensionOf(filename);
  const type = blobOrData.type || mimeFor(filename);
  const blob = blobOrData.type ? blobOrData : new Blob([blobOrData], { type });
  const toastId = toast.loading(`„${filename}“ wird vorbereitet…`);

  try {
    if (isIos()) {
      try {
        if (await iosShare(blob, filename)) {
          toast.success("Datei bereit", {
            id: toastId,
            description: `„${filename}“ wurde gespeichert bzw. geteilt.`,
            duration: 6000,
          });
          return true;
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          toast.info("Speichern abgebrochen", { id: toastId, duration: 3000 });
          return false;
        }
      }
      fallbackDownload(blob, filename);
      toast.success("Download gestartet", {
        id: toastId,
        description: `„${filename}“ wurde in „Downloads“ (App „Dateien“) gespeichert.`,
        duration: 7000,
      });
      return true;
    }

    const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker })
      .showSaveFilePicker;

    if (typeof picker === "function") {
      try {
        const handle = await picker({
          suggestedName: filename,
          types: ext ? [{ description: describe(ext), accept: { [type]: [ext] } }] : [],
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
