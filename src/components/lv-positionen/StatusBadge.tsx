import { type LvStatus, STATUS_LABEL, STATUS_DOT } from "./shared";
export function StatusBadge({ status }: { status: LvStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs">
      <span className={`size-2 rounded-full ${STATUS_DOT[status]}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}
