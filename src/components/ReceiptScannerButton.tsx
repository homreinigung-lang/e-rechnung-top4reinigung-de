import { useEffect, useId, useRef, useState } from "react";
import { Camera, FileUp, Loader2, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          setOpen(next);
        }}
      >
        <DialogContent className="max-w-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Beleg scannen</DialogTitle>
            <DialogDescription>
              Beleg vollständig in den Rahmen legen. Der Scan wird zugeschnitten, entzerrt und für bessere Lesbarkeit aufbereitet.
            </DialogDescription>
          </DialogHeader>

          <div className="relative overflow-hidden rounded-lg bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-contain sm:max-h-[62vh] sm:h-auto"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-[5%] bottom-[4%] top-[4%] rounded-md border-2 border-dashed border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.24)] sm:inset-[7%]"
            />
            {!cameraReady && !cameraError && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-white">
                <Loader2 className="mr-2 size-4 animate-spin" /> Kamera wird geöffnet…
              </div>
            )}
          </div>

          {cameraError && <p className="text-sm text-destructive">{cameraError}</p>}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void captureScan()}
              disabled={!cameraReady || busy}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
              Scannen
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
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
        </DialogContent>
      </Dialog>
    </>
  );
}
