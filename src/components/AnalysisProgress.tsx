import { useEffect, useState } from "react";

/** Indeterminate progress: elapsed time is real; no estimated percentage or completion time. */
export function AnalysisProgress({ label = "Datei wird gelesen …" }: { label?: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = window.setInterval(
      () => setSeconds(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3" aria-busy="true">
      <p role="status" className="text-sm">
        {label}
      </p>
      <p className="text-xs text-muted-foreground">Vergangene Zeit: {seconds} Sekunden</p>
      <div
        role="progressbar"
        aria-label={label}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full w-full animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
      </div>
    </div>
  );
}
