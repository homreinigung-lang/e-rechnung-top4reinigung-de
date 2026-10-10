import type { Database } from "@/integrations/supabase/types";

export type TimeInsert = Database["public"]["Tables"]["time_entries"]["Insert"];
export type PendingTime = { id: string; accountId: string; employeeId: string; row: TimeInsert };
const databaseName = "gebcalc-offline-times-v1";

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("entries", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Lokaler Speicher nicht verfügbar. Zeit wurde nicht gespeichert."));
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("entries", mode);
      const request = action(tx.objectStore("entries"));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () =>
        reject(new Error("Lokales Speichern fehlgeschlagen. Bitte erneut versuchen."));
    });
  } finally {
    db.close();
  }
}

export const offlineTimeStore = {
  async list(accountId: string, employeeId: string) {
    const rows = (await transaction("readonly", (store) => store.getAll())) as PendingTime[];
    return rows.filter((row) => row.accountId === accountId && row.employeeId === employeeId);
  },
  async put(entry: PendingTime) {
    await transaction("readwrite", (store) => store.put(entry));
  },
  async remove(id: string) {
    await transaction("readwrite", (store) => store.delete(id));
  },
};
