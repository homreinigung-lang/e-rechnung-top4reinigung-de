import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function GiroCode({ payload, size = 104 }: { payload: string | null; size?: number }) {
  const [src, setSrc] = useState<string>("");

  useEffect(() => {
    let active = true;
    if (!payload) {
      setSrc("");
      return;
    }
    QRCode.toDataURL(payload, { margin: 0, width: size * 3, errorCorrectionLevel: "M" })
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => setSrc(""));
    return () => {
      active = false;
    };
  }, [payload, size]);

  if (!src) return null;

  return (
    <div className="inline-flex items-center gap-4 rounded-md border px-4 py-3">
      <div className="text-xs">
        <div className="font-display text-sm font-semibold text-foreground">Überweisen per Code</div>
        <div className="mt-1 text-muted-foreground">
          Ganz bequem Code mit der Banking-App scannen.
        </div>
      </div>
      <img src={src} alt="GiroCode zur Überweisung" width={size} height={size} />
    </div>
  );
}
