import { useEffect, useState, type RefObject } from "react";
import { detectReceiptCorners, type Quad } from "@/lib/receipt-corners";

/** Bounded, local-only camera analysis; never uploads or captures automatically. */
export function ReceiptLiveEdges({ videoRef, ready }: {
  videoRef: RefObject<HTMLVideoElement | null>;
  ready: boolean;
}) {
  const [outline, setOutline] = useState<{ corners: Quad; width: number; height: number } | null>(null);
  useEffect(() => {
    setOutline(null);
    if (!ready) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    function check() {
      if (stopped) return;
      const video = videoRef.current;
      if (ctx && video && video.readyState >= 2 && video.videoWidth && video.videoHeight && !document.hidden) {
        try {
          const scale = Math.min(1, 320 / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.max(8, Math.round(video.videoWidth * scale));
          canvas.height = Math.max(8, Math.round(video.videoHeight * scale));
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const corners = detectReceiptCorners(image.data, image.width, image.height);
          setOutline(corners ? { corners, width: video.videoWidth, height: video.videoHeight } : null);
        } catch {
          setOutline(null);
        }
      }
      timer = setTimeout(check, 650);
    }
    check();
    return () => { stopped = true; clearTimeout(timer); };
  }, [ready, videoRef]);
  return <div className="pointer-events-none absolute inset-0">
    {outline && <svg className="h-full w-full" viewBox={`0 0 ${outline.width} ${outline.height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <polygon points={outline.corners.map(p => `${p.x * outline.width},${p.y * outline.height}`).join(" ")} fill="rgba(16,185,129,0.12)" stroke="#34d399" strokeWidth="3" vectorEffect="non-scaling-stroke" />
    </svg>}
    {ready && <p className="absolute inset-x-3 bottom-3 rounded bg-black/70 px-3 py-2 text-center text-sm text-white" role="status">
      {outline ? "Papier erkannt – ruhig halten und scannen" : "Ganze Papierseite mit etwas Hintergrund ins Bild halten"}
    </p>}
  </div>;
}
