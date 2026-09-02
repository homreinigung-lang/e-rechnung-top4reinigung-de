import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PREFIX = "Angebot für professionelle ";

const QUICK_OPTIONS = [
  { label: "Grundreinigung", value: "Grundreinigung" },
  { label: "Unterhaltsreinigung", value: "Unterhaltsreinigung" },
  { label: "Glasreinigung", value: "Glasreinigung" },
  { label: "Teppichreinigung", value: "Teppichreinigung" },
];

type DocumentTitleSelectorProps = {
  title: string;
  onChange: (value: string) => void;
};

export function DocumentTitleSelector({ title, onChange }: DocumentTitleSelectorProps) {
  const extension = useMemo(() => {
    if (title.startsWith(PREFIX)) return title.slice(PREFIX.length);
    return "";
  }, [title]);

  const setExtension = (value: string) => {
    const trimmed = value.trim();
    onChange(trimmed ? `${PREFIX}${trimmed}` : "");
  };

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
      <Label className="text-sm font-semibold">Dokumenttitel</Label>

      <div className="flex flex-col items-stretch overflow-hidden rounded-md border bg-muted focus-within:ring-2 focus-within:ring-ring sm:flex-row sm:items-center">
        <div className="select-none whitespace-nowrap border-b bg-muted px-3 py-2.5 text-sm font-medium text-muted-foreground sm:border-b-0 sm:border-r">
          Angebot für professionelle
        </div>
        <Input
          type="text"
          value={extension}
          onChange={(e) => setExtension(e.target.value)}
          placeholder="Grundreinigung"
          className="flex-1 rounded-none border-0 bg-background px-3 py-2.5 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="mr-1 text-xs font-medium text-muted-foreground">Schnellauswahl:</span>
        {QUICK_OPTIONS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setExtension(item.value)}
            className="rounded-md border bg-muted px-2.5 py-1 text-xs text-muted-foreground transition-all hover:border-primary/30 hover:bg-accent hover:text-accent-foreground"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
