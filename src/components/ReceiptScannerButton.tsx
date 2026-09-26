import { useEffect, useId, useRef, useState } from "react";
import { Camera, FileUp, Loader2, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { scanReceiptImage } from "@/lib/receipt-image-scan";
import { uploadUserFile } from "@/lib/storage";

export function ReceiptScannerButton({
  folder,
  label = "Beleg fotografieren/hochladen – wird als PDF gespeichert",
  onUploaded,
  disabled = false,
  onBusyChange,
}: {
  folder: string;
  label?: string;
  onUploaded: (path: string, file: File) => void | Promise<void>;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  }

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }

    let cancelled = false;

    async function startCamera() {
      setCameraError("");
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Kamera ist in diesem Browser nicht verfügbar. Bitte Datei auswählen.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 2560 },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setCameraReady(true);
      } catch {
        setCameraError("Kamera konnte nicht geöffnet werden. Bitte Kamerazugriff erlauben oder Datei auswählen.");
      }
    }

    void startCamera();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open]);

  async function process(file: File, scanImage: boolean) {
    if (busy || disabled) return;

    setBusy(true);
    onBusyChange?.(true);
    try {
      const prepared = scanImage && file.type.startsWith("image/")
        ? await scanReceiptImage(file)
        : file;
      const path = await uploadUserFile(prepared, folder);
      await onUploaded(path, prepared);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Beleg konnte nicht verarbeitet werden.");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  async function captureScan() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      toast.error("Kamera ist noch nicht bereit.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      toast.error("Kamerabild konnte nicht verarbeitet werden.");
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error("Kamerabild konnte nicht erstellt werden.")),
        "image/jpeg",
        0.96,
      );
    });

    const file = new File([blob], `beleg-${Date.now()}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });

    await process(file, true);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={busy || disabled}
        onClick={() => setOpen(true)}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <ScanLine className="size-4" />}
        {label}
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="receipt-scanner-title"
          className="fixed inset-0 z-[100] flex h-[100dvh] w-screen flex-col overflow-hidden bg-background"
        >
          <div className="flex shrink-0 items-start gap-3 border-b px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
            <div className="min-w-0 flex-1">
              <h2 id="receipt-scanner-title" className="text-lg font-semibold">
                Beleg scannen
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Beleg vollständig in den Rahmen legen. Der Scan wird zugeschnitten, entzerrt und für
                bessere Lesbarkeit aufbereitet.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              aria-label="Scanner schließen"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              <X className="size-5" />
            </Button>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-contain"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-[4%] bottom-[3%] top-[3%] rounded-md border-2 border-dashed border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.22)]"
            />
            {!cameraReady && !cameraError && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-white">
                <Loader2 className="mr-2 size-4 animate-spin" /> Kamera wird geöffnet…
              </div>
            )}
          </div>

          {cameraError ? (
            <p className="shrink-0 px-4 py-2 text-sm text-destructive">{cameraError}</p>
          ) : null}

          <div className="flex shrink-0 gap-2 border-t bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
            <Button
              type="button"
              onClick={() => void captureScan()}
              disabled={!cameraReady || busy}
              className="min-h-12 flex-1"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
              Scannen
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="min-h-12 flex-1"
            >
              <FileUp className="size-4" /> Datei auswählen
            </Button>

            <input
              id={inputId}
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void process(file, file.type.startsWith("image/"));
                e.target.value = "";
              }}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
