import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function GiroCode({ payload, size = 116 }: { payload: string | null; size?: number }) {
  const [src, setSrc] = useState<string>("");

  useEffect(() => {
    let active = true;
    if (!payload) {
      setSrc("");
      return;
    }
    QRCode.toDataURL(payload, { margin: 0, width: size * 2, errorCorrectionLevel: "M" })
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
    <div className="flex items-center gap-3">
      <img src={src} alt="GiroCode zur Überweisung" width={size} height={size} />
      <div className="text-xs text-muted-foreground">
        <div className="font-medium text-foreground">Überweisen per Code</div>
        <div>Mit der Banking-App scannen (GiroCode / EPC-QR).</div>
      </div>
    </div>
  );
}
