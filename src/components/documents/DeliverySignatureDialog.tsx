import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DeliverySignature } from "@/lib/delivery-note";

export function DeliverySignatureDialog({
  title,
  onSign,
  onClose,
  busy,
}: {
  title: string;
  onSign: (signature: DeliverySignature) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointer = useRef<number | null>(null);
  const bounds = useRef({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const [name, setName] = useState("");
  const [hasInk, setHasInk] = useState(false);
  const reset = () => {
    const el = canvas.current;
    el?.getContext("2d")?.clearRect(0, 0, el.width, el.height);
    bounds.current = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    pointer.current = null;
    setHasInk(false);
  };
  useEffect(() => {
    reset();
  }, []);
  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) * e.currentTarget.width) / box.width;
    const y = ((e.clientY - box.top) * e.currentTarget.height) / box.height;
    bounds.current.minX = Math.min(bounds.current.minX, x);
    bounds.current.minY = Math.min(bounds.current.minY, y);
    bounds.current.maxX = Math.max(bounds.current.maxX, x);
    bounds.current.maxY = Math.max(bounds.current.maxY, y);
    return { x, y };
  };
  const start = (e: PointerEvent<HTMLCanvasElement>) => {
    if (busy || pointer.current !== null || e.button !== 0) return;
    e.preventDefault();
    pointer.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.strokeStyle = "#172a40";
    ctx.fillStyle = "#172a40";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    setHasInk(true);
  };
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    if (pointer.current !== e.pointerId) return;
    const ctx = e.currentTarget.getContext("2d");
    const p = point(e);
    ctx?.lineTo(p.x, p.y);
    ctx?.stroke();
  };
  const sign = () => {
    const source = canvas.current;
    if (!source || !hasInk || name.trim().length < 2 || pointer.current !== null) return;
    // Crop empty margins. Keep transparent PNG and the original aspect ratio in the PDF.
    const b = bounds.current,
      padding = 16;
    const x = Math.max(0, Math.floor(b.minX) - padding),
      y = Math.max(0, Math.floor(b.minY) - padding);
    const out = document.createElement("canvas");
    out.width = Math.min(source.width - x, Math.ceil(b.maxX) - x + padding);
    out.height = Math.min(source.height - y, Math.ceil(b.maxY) - y + padding);
    out
      .getContext("2d")
      ?.drawImage(source, x, y, out.width, out.height, 0, 0, out.width, out.height);
    onSign({
      name: name.trim(),
      image: out.toDataURL("image/png"),
      signedAt: new Date().toISOString(),
    });
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Mengen prüfen, Namen eintragen und mit Finger oder Stift unterschreiben. Für mehr Platz
            das Handy quer halten.
          </DialogDescription>
        </DialogHeader>
        <Label htmlFor="delivery-signer">Vor- und Nachname</Label>
        <Input
          id="delivery-signer"
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
          autoComplete="name"
        />
        <canvas
          ref={canvas}
          width={1200}
          height={400}
          aria-label="Unterschriftsfeld"
          className="aspect-[3/1] w-full touch-none rounded-md border bg-white"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={(e) => {
            if (pointer.current === e.pointerId) pointer.current = null;
          }}
          onPointerCancel={reset}
          onLostPointerCapture={() => {
            pointer.current = null;
          }}
        />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={reset} disabled={busy}>
            Löschen / erneut unterschreiben
          </Button>
          <Button onClick={sign} disabled={busy || !hasInk || name.trim().length < 2}>
            Unterschrift speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
