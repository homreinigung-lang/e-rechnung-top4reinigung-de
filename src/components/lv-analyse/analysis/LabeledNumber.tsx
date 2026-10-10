import { Input } from "@/components/ui/input";

export function LabeledNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        className="tabular-nums"
        value={String(value).replace(".", ",")}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\./g, "").replace(",", "."));
          onChange(Number.isFinite(n) ? n : 0);
        }}
      />
    </label>
  );
}
