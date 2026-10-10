import { STATUS_LABEL } from "@/lib/format";

import { STATUS_STYLES } from "./shared";

export function StatusBadge({ status }: { status: string }) {
  const label = status === "accepted" ? "Angenommen (Auftrag)" : (STATUS_LABEL[status] ?? status);
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status] ?? STATUS_STYLES["draft"]}`}
    >
      {label}
    </span>
  );
}
