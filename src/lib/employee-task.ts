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
  if (task.start && task.end && start) {
    const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    const taskStart = minutes(task.start),
      entryStart = minutes(start);
    let taskEnd = minutes(task.end),
      entryEnd = end ? minutes(end) : entryStart + 1;
    if (taskEnd < taskStart) taskEnd += 24 * 60;
    if (entryEnd < entryStart) entryEnd += 24 * 60;
    return entryStart < taskEnd && entryEnd > taskStart;
  }
  return true; // Legacy plans without clock times still match their own object only.
}

export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
