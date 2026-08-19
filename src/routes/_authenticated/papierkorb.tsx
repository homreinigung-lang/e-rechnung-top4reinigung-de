import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";
import { FileText, RotateCcw, Trash2, Users, Receipt } from "lucide-react";

export const Route = createFileRoute("/_authenticated/papierkorb")({
  head: () => ({
    meta: [
      { title: "Papierkorb – HomR Office" },
      {
        name: "description",
        content:
          "Gelöschte Rechnungen, Angebote, Kunden und Ausgaben 30 Tage lang wiederherstellen oder endgültig entfernen.",
      },
      { property: "og:title", content: "Papierkorb – HomR Office" },
      {
        property: "og:description",
        content: "Versehentlich gelöschte Daten innerhalb von 30 Tagen wiederherstellen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PapierkorbPage,
});

type TrashRow = {
  entity: string;
  id: string;
  label: string | null;
  info: string | null;
  deleted_at: string;
};

const ENTITY_LABEL: Record<string, { name: string; icon: typeof FileText }> = {
  document: { name: "Beleg", icon: FileText },
  customer: { name: "Kunde", icon: Users },
  expense: { name: "Ausgabe", icon: Receipt },
};

function daysLeft(deletedAt: string): number {
  const ms = new Date(deletedAt).getTime() + 30 * 24 * 3600 * 1000 - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 3600 * 1000)));
}

function PapierkorbPage() {
  const queryClient = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["trash"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_trash");
      if (error) throw error;
      return (data ?? []) as TrashRow[];
    },
  });

  function invalidate() {
    for (const key of ["trash", "documents", "customers", "expenses", "dashboard"]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  }

  const restore = useMutation({
    mutationFn: async (row: TrashRow) => {
      const { error } = await supabase.rpc("restore_entity", {
        _entity: row.entity,
        _id: row.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Eintrag wiederhergestellt");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const purge = useMutation({
    mutationFn: async (row: TrashRow) => {
      const { error } = await supabase.rpc("purge_entity", { _entity: row.entity, _id: row.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Endgültig gelöscht");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Papierkorb</h1>
        <p className="text-sm text-muted-foreground">
          Gelöschte Belege, Kunden und Ausgaben bleiben 30 Tage erhalten und können jederzeit
          wiederhergestellt werden. Danach werden sie automatisch endgültig entfernt.
        </p>
      </div>

      <section className="surface overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Wird geladen …</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            Der Papierkorb ist leer – es wurden keine Daten gelöscht.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => {
              const meta = ENTITY_LABEL[row.entity] ?? { name: row.entity, icon: FileText };
              const Icon = meta.icon;
              const left = daysLeft(row.deleted_at);
              return (
                <li
                  key={`${row.entity}-${row.id}`}
                  className="flex flex-wrap items-center gap-3 p-4"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-40 flex-1">
                    <p className="text-sm font-medium">{row.label || "(ohne Bezeichnung)"}</p>
                    <p className="text-xs text-muted-foreground">
                      {meta.name}
                      {row.info ? ` · ${row.info}` : ""} · gelöscht am{" "}
                      {formatDate(row.deleted_at)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      left <= 5
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    noch {left} Tage
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => restore.mutate(row)}
                  >
                    <RotateCcw className="mr-2 size-4" />
                    Wiederherstellen
                  </Button>
                  <ConfirmDeleteButton
                    title="Endgültig löschen?"
                    description={`„${row.label ?? ""}" wird unwiderruflich entfernt und kann nicht mehr wiederhergestellt werden.`}
                    confirmLabel="Endgültig löschen"
                    onConfirm={() => purge.mutate(row)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </ConfirmDeleteButton>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
