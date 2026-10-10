import type { PendingTime } from "./offline-time-store";

export interface TimeQueueStore {
  list(accountId: string, employeeId: string): Promise<PendingTime[]>;
  remove(id: string): Promise<void>;
}
/** Keep the same UUID after any failure, including a lost server response. */
export async function syncTimeQueue(
  accountId: string,
  employeeId: string,
  store: TimeQueueStore,
  send: (entry: PendingTime) => Promise<void>,
  currentAccount: () => Promise<string | undefined>,
) {
  let sent = 0;
  for (const entry of await store.list(accountId, employeeId)) {
    if ((await currentAccount()) !== accountId) break;
    await send(entry);
    await store.remove(entry.id);
    sent++;
  }
  return sent;
}

export interface TimeTransport {
  insert(
    row: PendingTime["row"],
  ): PromiseLike<{ error: { code?: string; message: string } | null }>;
  find(id: string): PromiseLike<{
    data: { employee_id: string | null; user_id: string } | null;
    error: unknown;
  }>;
}

/** A duplicate UUID is acknowledged only when the saved row belongs to this entry. */
export async function deliverPendingTime(entry: PendingTime, transport: TimeTransport) {
  const { error } = await transport.insert(entry.row);
  if (!error) return;
  if (error.code === "23505") {
    const existing = await transport.find(entry.id);
    if (
      !existing.error &&
      existing.data?.employee_id === entry.employeeId &&
      existing.data.user_id === entry.row.user_id
    )
      return;
  }
  throw new Error(error.message);
}
