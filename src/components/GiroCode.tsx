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
    QRCode.toDataURL(payload, {
      margin: 0,
      width: size * 3,
      errorCorrectionLevel: "M",
      color: { dark: "#111827", light: "#ffffff" },
    })
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => setSrc(""));
    return () => {
      active = false;
    };
  }, [payload, size]);

  return (
    <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-4 rounded-md border bg-white px-4 py-3">
      <div className="min-w-0 text-xs">
        <div className="font-display text-sm font-semibold text-foreground">
          Überweisen per Code
        </div>
        <div className="mt-1 text-muted-foreground">
          Ganz bequem Code mit der Banking-App scannen.
        </div>
      </div>
      {src ? (
        <img
          src={src}
          alt="GiroCode zur Überweisung"
          width={size}
          height={size}
          style={{ width: size, height: size }}
          className="shrink-0"
        />
      ) : (
        <div style={{ width: size, height: size }} className="shrink-0 rounded bg-muted" />
      )}
    </div>
  );
}
