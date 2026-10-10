import { Input } from "@/components/ui/input";

export function NumCell({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <Input
      className={`h-7 text-right text-xs tabular-nums ${value === null ? "border-amber-500" : ""}`}
      value={value === null ? "" : String(value).replace(".", ",")}
      placeholder="–"
      onChange={(e) => {
        const raw = e.target.value.trim();
        if (!raw) return onChange(null);
        const n = Number(raw.replace(/\./g, "").replace(",", "."));
        onChange(Number.isFinite(n) ? n : null);
      }}
    />
  );
}
