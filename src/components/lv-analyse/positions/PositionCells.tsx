import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";

import { REVIEW_LABEL } from "@/lib/lv-analyse/export";
import { EMPTY } from "./shared";
export function ReviewMark({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="mt-0.5 inline-flex items-center gap-1 whitespace-nowrap text-[10px] text-amber-700">
      <AlertTriangle className="size-3 shrink-0" /> {REVIEW_LABEL}
    </span>
  );
}
export function Placeholder() {
  return <span className="text-muted-foreground">{EMPTY}</span>;
}
export function NumCell({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const format = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));
  /** Lokaler Roh-Text: Zwischenzustände wie „12," dürfen nicht verloren gehen. */
  const [text, setText] = useState(() => format(value));
  const [focused, setFocused] = useState(false);

  // Nur synchronisieren, wenn das Feld nicht bearbeitet wird – sonst frisst
  // das Neurendern das eben getippte Komma.
  if (!focused && text !== format(value)) setText(format(value));

  return (
    <Input
      className="h-7 text-right text-xs tabular-nums"
      value={text}
      placeholder={EMPTY}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setText(format(value));
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const trimmed = raw.trim();
        if (!trimmed) return onChange(null);
        const n = Number(trimmed.replace(/\./g, "").replace(",", "."));
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}
