import { useEffect, useId, useRef, useState } from "react";
import { Camera, FileUp, Loader2, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  finishReceiptScan,
  prepareReceiptScan,
  type ReceiptScanDraft,
} from "@/lib/receipt-image-scan";
import { validReceiptQuad, type Quad } from "@/lib/receipt-corners";
import { ReceiptCropPreview } from "./ReceiptCropPreview";

export function ReceiptScannerButton({
  label = "Beleg fotografieren/hochladen – wird als PDF gespeichert",
  onProcessed,
  disabled = false,
  onBusyChange,
}: {
  label?: string;
  onProcessed: (file: File) => void | Promise<void>;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const processing = useRef(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [draft, setDraft] = useState<ReceiptScanDraft | null>(null);
  const [corners, setCorners] = useState<Quad | null>(null);
  const [adjusted, setAdjusted] = useState(false);

  useEffect(() => {
    setCameraReady(false);
    if (!open || draft) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    async function startCamera() {
      setCameraError("");
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error();
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 2560 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        if (!cancelled) setCameraReady(true);
      } catch {
        stream?.getTracks().forEach((t) => t.stop());
        if (!cancelled)
          setCameraError(
            "Kamera konnte nicht geöffnet werden. Bitte Kamerazugriff erlauben oder Datei auswählen.",
          );
      }
    }
    void startCamera();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, draft]);

  async function run(task: () => Promise<void>) {
    if (processing.current || disabled) return;
    processing.current = true;
    setBusy(true);
    onBusyChange?.(true);
    try {
      await task();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Beleg konnte nicht verarbeitet werden.");
    } finally {
      processing.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  function close() {
    setOpen(false);
    setDraft(null);
    setCorners(null);
    setAdjusted(false);
  }
  async function prepare(file: File) {
    if (!file.type.startsWith("image/")) {
      await onProcessed(file);
      close();
      return;
    }
    const result = await prepareReceiptScan(file);
    setDraft(result);
    setCorners(result.corners);
    setAdjusted(false);
  }
  async function captureScan() {
    await run(async () => {
      const video = videoRef.current;
      if (!video?.videoWidth || !video.videoHeight)
        throw new Error("Kamera ist noch nicht bereit.");
      // Keep all four paper corners; the viewfinder must not pre-crop them.
      const scale = Math.min(1, 2600 / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Kamerabild konnte nicht verarbeitet werden.");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Kamerabild konnte nicht erstellt werden."))),
          "image/jpeg",
          0.96,
        ),
      );
      await prepare(new File([blob], `beleg-${Date.now()}.jpg`, { type: "image/jpeg" }));
    });
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
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={inputId + "-title"}
          className="fixed inset-0 z-[100] flex h-[100dvh] w-screen flex-col overflow-hidden bg-background"
        >
          <div className="flex shrink-0 items-start gap-3 border-b px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
            <div className="min-w-0 flex-1">
              <h2 id={inputId + "-title"} className="text-lg font-semibold">
                {draft ? "Papierkanten prüfen" : "Beleg scannen"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {draft
                  ? draft.detected
                    ? "Papier erkannt. Ecken prüfen und bei Bedarf auf die Papierkanten ziehen."
                    : "Papierkanten nicht sicher erkannt. Bitte die vier markierten Ecken auf die Papierkanten ziehen."
                  : "Die ganze Rechnung mit etwas Hintergrund fotografieren. Danach Papierkanten prüfen und zuschneiden."}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Scanner schließen"
              disabled={busy}
              onClick={close}
            >
              <X className="size-5" />
            </Button>
          </div>
          {draft && corners ? (
            <ReceiptCropPreview
              draft={draft}
              corners={corners}
              disabled={busy}
              onChange={(q) => {
                setCorners(q);
                setAdjusted(true);
              }}
            />
          ) : (
            <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
              <video ref={videoRef} playsInline muted className="h-full w-full object-contain" />
              {!cameraReady && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-white">
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Kamera wird geöffnet…
                </div>
              )}
            </div>
          )}
          {!draft && cameraError && (
            <p className="shrink-0 px-4 py-2 text-sm text-destructive">{cameraError}</p>
          )}
          {draft && corners && !validReceiptQuad(corners) && (
            <p role="alert" className="px-4 py-2 text-sm text-destructive">
              Die Kanten dürfen sich nicht kreuzen. Bitte Ecken korrigieren.
            </p>
          )}
          <div className="flex shrink-0 flex-wrap gap-2 border-t bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
            {draft && corners ? (
              <>
                <Button
                  type="button"
                  className="min-h-12 flex-1"
                  disabled={busy || !validReceiptQuad(corners) || (!draft.detected && !adjusted)}
                  onClick={() =>
                    void run(async () => {
                      const file = await finishReceiptScan(draft, corners);
                      await onProcessed(file);
                      close();
                    })
                  }
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ScanLine className="size-4" />
                  )}
                  Zuschneiden &amp; übernehmen
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setDraft(null);
                    setCorners(null);
                    setAdjusted(false);
                  }}
                >
                  Neu aufnehmen
                </Button>
              </>
            ) : (
              <Button
                type="button"
                onClick={() => void captureScan()}
                disabled={!cameraReady || busy}
                className="min-h-12 flex-1"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
                Scannen
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="min-h-12 flex-1"
            >
              <FileUp className="size-4" />
              Datei auswählen
            </Button>
            <input
              id={inputId}
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void run(() => prepare(file));
                e.target.value = "";
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
