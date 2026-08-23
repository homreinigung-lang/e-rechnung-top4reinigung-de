import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, CheckCircle2, Lock } from "lucide-react";
import { formatDate } from "@/lib/format";
import { approvalStatusLabel, useAccountApprovals, useSetApprovalStatus } from "@/lib/admin";

export const Route = createFileRoute("/_authenticated/admin/firmen")({
  component: FirmenPage,
});

function variantFor(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "approved") return "default";
  if (status === "pending") return "secondary";
  if (status === "blocked" || status === "rejected") return "destructive";
  return "outline";
}

function FirmenPage() {
  const { data: rows = [], isLoading } = useAccountApprovals(true);
  const setStatus = useSetApprovalStatus();

  const pending = rows.filter((r) => r.status === "pending").length;
  const blocked = rows.filter((r) => r.status === "blocked").length;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {rows.length} Konten · {pending} warten auf Freigabe · {blocked} gesperrt
      </p>

      {isLoading ? (
        <p className="text-muted-foreground">Wird geladen …</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground">Noch keine Registrierungen vorhanden.</p>
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className="surface flex flex-wrap items-center justify-between gap-4 p-4"
            >
              <div className="flex items-start gap-3">
                <Building2 className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <p className="font-semibold">{row.full_name || row.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.email} · registriert am {formatDate(row.created_at)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={variantFor(row.status)}>
                  {approvalStatusLabel[row.status] ?? row.status}
                </Badge>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={row.status === "approved" || setStatus.isPending}
                  onClick={() => setStatus.mutate({ id: row.id, status: "approved" })}
                >
                  <CheckCircle2 className="size-4" />
                  Freigeben
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={row.status === "blocked" || setStatus.isPending}
                  onClick={() => setStatus.mutate({ id: row.id, status: "blocked" })}
                >
                  <Lock className="size-4" />
                  Sperren
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Gesperrte Firmen werden beim nächsten Seitenaufruf automatisch abgemeldet und können sich
        nicht erneut anmelden, bis der Zugang wieder freigegeben wird.
      </p>
    </div>
  );
}
