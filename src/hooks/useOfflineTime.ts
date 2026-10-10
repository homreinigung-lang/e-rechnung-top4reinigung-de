import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { offlineTimeStore, type PendingTime, type TimeInsert } from "@/lib/offline-time-store";
import { deliverPendingTime, syncTimeQueue } from "@/lib/offline-time-sync";

const running = new Map<string, Promise<void>>();
const changed = "gebcalc-offline-times-changed";

async function send(entry: PendingTime) {
  await deliverPendingTime(entry, {
    insert: (row) => supabase.from("time_entries").insert(row),
    find: (id) =>
      supabase.from("time_entries").select("id,employee_id,user_id").eq("id", id).maybeSingle(),
  });
}

export function useOfflineTime(employeeId: string) {
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState<PendingTime[]>([]);
  const pending = entries.length;
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(true);
  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const accountId = data.session?.user.id;
    setEntries(accountId ? await offlineTimeStore.list(accountId, employeeId) : []);
  }, [employeeId]);

  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    const { data } = await supabase.auth.getSession();
    const accountId = data.session?.user.id;
    if (!accountId) return;
    const key = `${accountId}:${employeeId}`;
    if (running.has(key)) {
      await running.get(key);
      await refresh().catch(() => setError("Lokaler Speicher nicht verfügbar"));
      return;
    }
    setSyncing(true);
    const work = (async () => {
      try {
        const count = await syncTimeQueue(
          accountId,
          employeeId,
          offlineTimeStore,
          send,
          async () => {
            const { data: verified, error: authError } = await supabase.auth.getUser();
            if (authError || !verified.user)
              throw new Error(
                "Bitte online erneut anmelden, um gespeicherte Zeiten zu synchronisieren.",
              );
            return verified.user.id;
          },
        );
        if (count) {
          void queryClient.invalidateQueries({ queryKey: ["my_time_entries"] });
          void queryClient.invalidateQueries({ queryKey: ["time_entries"] });
        }
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Synchronisierung fehlgeschlagen");
      } finally {
        window.dispatchEvent(new Event(changed));
      }
    })();
    running.set(key, work);
    try {
      await work;
    } finally {
      running.delete(key);
      setSyncing(false);
      await refresh().catch(() => setError("Lokaler Speicher nicht verfügbar"));
    }
  }, [employeeId, queryClient, refresh]);

  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      void refresh().catch(() => setError("Lokaler Speicher nicht verfügbar"));
    };
    const reconnect = () => {
      update();
      void sync();
    };
    update();
    void sync();
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", update);
    window.addEventListener(changed, update);
    const interval = window.setInterval(() => void sync(), 30_000);
    const { data } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(update, 0);
    });
    return () => {
      window.clearInterval(interval);
      data.subscription.unsubscribe();
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", update);
      window.removeEventListener(changed, update);
    };
  }, [refresh, sync]);

  const save = async (row: TimeInsert) => {
    const { data } = await supabase.auth.getSession();
    const accountId = data.session?.user.id;
    if (!accountId) throw new Error("Bitte zuerst anmelden.");
    const id = crypto.randomUUID();
    await offlineTimeStore.put({ id, accountId, employeeId, row: { ...row, id } });
    window.dispatchEvent(new Event(changed));
    await sync().catch(() => setError("Gespeichert – Synchronisierung bitte erneut versuchen"));
    return (await offlineTimeStore.list(accountId, employeeId)).some((entry) => entry.id === id);
  };
  return { save, sync, pending, entries, error, syncing, online };
}
