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

/** Normaler Browser-Download für Desktop/Android. */
function fallbackDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.target = "_self";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 10000);
}

/**
 * iOS-Fallback, wenn das native Teilen nicht verfügbar ist.
 * Statt einen unsichtbaren Download als erfolgreich zu melden, wird die Datei
 * sichtbar in einem neuen Tab geöffnet. So kann sie über Teilen -> In Dateien
 * sichern tatsächlich gespeichert werden.
 */
function openOnIos(blob: Blob): boolean {
  const url = URL.createObjectURL(blob);
  // `noopener` makes window.open return null even when opening succeeds.
  // Open a same-origin blank page, detach its opener, then navigate to the blob.
  const opened = window.open("about:blank", "_blank");
  if (!opened) {
    URL.revokeObjectURL(url);
    return false;
  }
  opened.opener = null;
  opened.location.replace(url);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
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
 * Speichert eine Datei lokal. Auf iOS wird bevorzugt das native Teilen-Blatt
 * verwendet. Falls das nicht möglich ist, wird die Datei sichtbar geöffnet,
 * damit kein irreführendes „Download gestartet“ ohne Ergebnis erscheint.
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
            description: `„${filename}“ kann jetzt gespeichert oder geteilt werden.`,
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

      if (openOnIos(blob)) {
        toast.info("Datei geöffnet", {
          id: toastId,
          description: "Bitte im geöffneten Dokument auf Teilen und anschließend „In Dateien sichern“ tippen.",
          duration: 9000,
        });
        return true;
      }

      toast.error("Datei konnte nicht geöffnet werden", {
        id: toastId,
        description: "Bitte Pop-ups für diese Seite erlauben und erneut versuchen.",
      });
      return false;
    }

    const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;

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
      }
    }

    fallbackDownload(blob, filename);
    toast.success("Download gestartet", {
      id: toastId,
      description: `„${filename}“ wurde an den Browser übergeben.`,
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
