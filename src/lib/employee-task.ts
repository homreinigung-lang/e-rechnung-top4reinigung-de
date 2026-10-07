export type TaskTimeEntry = {
  id: string;
  work_date?: string | null;
  project_id?: string | null;
  entry_type?: string | null;
  approval_status?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

export type TaskIdentity = { date: string; projectId: string | null; start: string; end: string };

/** Only the same object and overlapping time can complete a planned task. */
export function matchesTask(entry: TaskTimeEntry, task: TaskIdentity): boolean {
  if ((entry.entry_type ?? "work") !== "work" || entry.approval_status === "rejected") return false;
  if (entry.work_date?.slice(0, 10) !== task.date || entry.project_id !== task.projectId)
    return false;
  const start = entry.start_time?.slice(0, 5);
  const end = entry.end_time?.slice(0, 5);
  if (task.start && task.end && start && end) return start < task.end && end > task.start;
  return true; // Legacy plans without clock times still match their own object only.
}

export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
