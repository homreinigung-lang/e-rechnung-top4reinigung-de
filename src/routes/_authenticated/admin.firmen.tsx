import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Building2, CheckCircle2, Lock, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/format";
import {
  approvalStatusLabel,
  useAccountApprovals,
  useDeleteCompanyAccount,
  useSetApprovalStatus,
} from "@/lib/admin";

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
  const deleteAccount = useDeleteCompanyAccount();

  const active = rows.filter((r) => r.status === "approved").length;
  const blocked = rows.filter((r) => r.status === "blocked" || r.status === "rejected").length;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {rows.length} Firmenkonten · {active} aktiv · {blocked} gesperrt
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
                  <p className="font-semibold">{row.company_name || row.full_name || row.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.full_name ? `${row.full_name} · ` : ""}
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
                  variant="outline"
                  disabled={row.status === "blocked" || setStatus.isPending}
                  onClick={() => setStatus.mutate({ id: row.id, status: "blocked" })}
                >
                  <Lock className="size-4" />
                  Sperren
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive" disabled={deleteAccount.isPending}>
                      <Trash2 className="size-4" />
                      Löschen
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Account endgültig löschen?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {row.company_name || row.full_name || row.email} wird unwiderruflich
                        entfernt: Anmelde-Zugang, Freigabe-Eintrag und Abonnement. Dieser Schritt
                        kann nicht rückgängig gemacht werden.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteAccount.mutate(row.id)}>
                        Account löschen
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Neue Registrierungen sind sofort aktiv und starten mit 60 Tagen kostenloser Testphase.
        Gesperrte Firmen werden beim nächsten Seitenaufruf automatisch abgemeldet.
      </p>
    </div>
  );
}
