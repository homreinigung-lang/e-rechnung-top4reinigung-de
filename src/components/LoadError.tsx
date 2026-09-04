import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Sichtbarer Hinweis, wenn Daten nicht geladen werden konnten. Ohne diesen
 * Hinweis sieht ein Rechte- oder Netzproblem aus wie „keine Daten“.
 */
export function LoadError({
  error,
  title = "Daten konnten nicht geladen werden",
  onRetry,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
}) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div
      role="alert"
      className="flex flex-wrap items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-destructive">{title}</p>
        <p className="break-words text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="size-4" /> Erneut versuchen
        </Button>
      )}
    </div>
  );
}

/** Erster aufgetretener Fehler aus mehreren Abfragen. */
export function firstError(...errors: unknown[]): unknown {
  return errors.find(Boolean) ?? null;
}
