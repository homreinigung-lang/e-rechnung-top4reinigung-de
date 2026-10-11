import { useRef } from "react";
import { type Quad } from "@/lib/receipt-corners";
import { type ReceiptScanDraft } from "@/lib/receipt-image-scan";

const labels = ["Oben links", "Oben rechts", "Unten rechts", "Unten links"];

export function ReceiptCropPreview({
  draft,
  corners,
  onChange,
  disabled,
}: {
  draft: ReceiptScanDraft;
  corners: Quad;
  onChange: (corners: Quad) => void;
  disabled: boolean;
}) {
  const surface = useRef<HTMLDivElement>(null);
  function move(index: number, x: number, y: number) {
    if (disabled) return;
    onChange(
      corners.map((p, i) =>
        i === index ? { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) } : p,
      ) as unknown as Quad,
    );
  }
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-950 p-7">
      <div
        ref={surface}
        className="relative shrink-0 touch-none select-none"
        style={{
          width: `min(100%, calc(52dvh * ${draft.source.width / draft.source.height}))`,
          aspectRatio: `${draft.source.width} / ${draft.source.height}`,
        }}
      >
        <img
          src={draft.preview}
          alt="Beleg mit anpassbaren Papierkanten"
          draggable={false}
          className="block h-full w-full"
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <path
            d={`M0,0 H100 V100 H0 Z M${corners.map((p) => `${p.x * 100},${p.y * 100}`).join(" L")} Z`}
            fill="rgba(0,0,0,0.55)"
            fillRule="evenodd"
          />
          <polygon
            points={corners.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}
            fill="none"
            stroke="#22d3ee"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {corners.map((point, index) => (
          <button
            key={index}
            type="button"
            aria-label={`Papierecke ${labels[index]}`}
            disabled={disabled}
            className="absolute flex size-11 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full border-2 border-white bg-cyan-700 text-sm font-bold text-white shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              const rect = surface.current?.getBoundingClientRect();
              if (rect?.width && rect.height)
                move(
                  index,
                  (e.clientX - rect.left) / rect.width,
                  (e.clientY - rect.top) / rect.height,
                );
            }}
            onPointerUp={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onKeyDown={(e) => {
              const directions: Record<string, [number, number]> = {
                ArrowLeft: [-1, 0],
                ArrowRight: [1, 0],
                ArrowUp: [0, -1],
                ArrowDown: [0, 1],
              };
              const direction = directions[e.key];
              if (!direction) return;
              e.preventDefault();
              const step = e.shiftKey ? 0.02 : 0.005;
              move(index, point.x + direction[0] * step, point.y + direction[1] * step);
            }}
          >
            {index + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
