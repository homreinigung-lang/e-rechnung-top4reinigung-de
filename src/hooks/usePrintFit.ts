import { useEffect } from "react";

/**
 * Skaliert den Druckbereich vor dem Drucken automatisch so, dass der komplette
 * Beleg (Summen, Zahlungsziel, Bankdaten, QR-Code) auf genau eine A4-Seite passt.
 */
export function usePrintFit(selector = ".print-area") {
  useEffect(() => {
    const A4_HEIGHT_PX = (297 / 25.4) * 96; // A4-Höhe in CSS-Pixeln

    const fit = () => {
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) return;
      el.style.removeProperty("--print-scale");
      const height = el.scrollHeight;
      if (!height) return;
      const scale = Math.min(1, (A4_HEIGHT_PX - 8) / height);
      el.style.setProperty("--print-scale", String(Math.max(0.55, scale)));
    };

    const reset = () => {
      document.querySelector<HTMLElement>(selector)?.style.removeProperty("--print-scale");
    };

    window.addEventListener("beforeprint", fit);
    window.addEventListener("afterprint", reset);
    return () => {
      window.removeEventListener("beforeprint", fit);
      window.removeEventListener("afterprint", reset);
    };
  }, [selector]);
}
