import { Link, useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { toast } from "sonner";
import { deleteBlockedMessage } from "@/lib/gobd-guard";
import { formatDate, formatMoney } from "@/lib/format";

import {
  ArrowRightLeft,
  BadgeEuro,
  Check,
  ClipboardCheck,
  Copy,
  FileText,
  MoreVertical,
  Receipt,
  Trash2,
  X,
} from "lucide-react";

import { type AngebotsTabelleProps } from "./shared";

import { StatusBadge } from "./StatusBadge";

export function AngebotsTabelle({
  kind,
  list,
  decide,
  decline,
  convert,
  toInvoice,
  complete,
  duplicate,
  remove,
  isLocked,
  followUp,
  onDelete,
}: AngebotsTabelleProps) {
  const navigate = useNavigate();
  const isOrder = kind === "order";
  const label = isOrder ? "Auftragsbestätigung" : "Angebot";

  if (list.length === 0) {
    return (
      <p className="px-5 py-12 text-center text-sm text-muted-foreground">
        {isOrder ? "Noch keine Auftragsbestätigungen vorhanden." : "Noch keine Angebote vorhanden."}
      </p>
    );
  }

  return (
    <div className="surface overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 font-medium">{label}</th>
            <th className="px-4 py-3 font-medium">Kunde</th>
            <th className="px-4 py-3 text-right font-medium">Betrag</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium">Aktionen</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {list.map((d) => {
            const r = d as unknown as Record<string, unknown>;
            const deletable = !isLocked(r);
            const isAuftrag = d.status === "accepted" || Boolean(d.converted_document_id);
            return (
              <tr
                key={d.id}
                className="cursor-pointer align-middle hover:bg-muted/40"
                title={`${label} öffnen und bearbeiten`}
                onClick={() => navigate({ to: "/dokumente/$id", params: { id: d.id } })}
              >
                <td className="px-4 py-3">
                  <Link
                    to="/dokumente/$id"
                    params={{ id: d.id }}
                    className="font-medium hover:underline"
                  >
                    {d.number}
                  </Link>
                  <div className="text-xs text-muted-foreground">{formatDate(d.issue_date)}</div>
                </td>
                <td className="px-4 py-3">
                  {d.customer_company || d.customer_name || "Ohne Kunde"}
                </td>
                <td className="px-4 py-3 text-right font-medium">{formatMoney(Number(d.total))}</td>
                <td className="px-4 py-3">
                  <StatusBadge
                    status={isAuftrag && d.status === "accepted" ? "accepted" : d.status}
                  />
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" title="Aktionen">
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        {!isOrder && (d.status === "sent" || d.status === "draft") && (
                          <>
                            <DropdownMenuItem
                              onClick={() => decide.mutate({ docId: d.id, decision: "accepted" })}
                              disabled={decide.isPending}
                            >
                              <Check className="mr-2 size-4" /> Angebot annehmen
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => decline(d.id, `Angebot ${d.number}`)}>
                              <X className="mr-2 size-4" /> Angebot ablehnen
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}

                        <DropdownMenuItem
                          onClick={() =>
                            navigate({
                              to: "/dokumente/$id",
                              params: { id: d.id },
                              search: { bearbeiten: true },
                            })
                          }
                        >
                          <FileText className="mr-2 size-4" /> {label} bearbeiten
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => navigate({ to: "/dokumente/$id", params: { id: d.id } })}
                        >
                          <Receipt className="mr-2 size-4" /> {label} ansehen & PDF
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />

                        {!isOrder && d.status === "accepted" && !d.converted_document_id && (
                          <DropdownMenuItem
                            title="Auftragsbestätigung aus dem Angebot erstellen"
                            onClick={() => convert.mutate(d.id)}
                            disabled={convert.isPending}
                          >
                            <ClipboardCheck className="mr-2 size-4" /> Auftragsbestätigung erstellen
                          </DropdownMenuItem>
                        )}

                        {!d.converted_document_id && (isOrder || d.status === "accepted") && (
                          <DropdownMenuItem
                            title={
                              isOrder
                                ? "Rechnung aus der Auftragsbestätigung erstellen"
                                : "Rechnung direkt aus dem Angebot erstellen"
                            }
                            onClick={() => toInvoice.mutate(d.id)}
                            disabled={toInvoice.isPending}
                          >
                            <ArrowRightLeft className="mr-2 size-4" /> Rechnung erstellen
                          </DropdownMenuItem>
                        )}

                        {(() => {
                          const next = followUp(d.id);
                          if (!next) return null;
                          const nextLabel =
                            next.type === "invoice" ? "Rechnung öffnen" : "Folgebeleg öffnen";
                          return (
                            <DropdownMenuItem
                              title={`Bereits erstellt: ${next.number}`}
                              onClick={() =>
                                navigate({ to: "/dokumente/$id", params: { id: next.id } })
                              }
                            >
                              <ArrowRightLeft className="mr-2 size-4" /> {nextLabel} ({next.number})
                            </DropdownMenuItem>
                          );
                        })()}

                        {!isOrder && d.status === "accepted" && (
                          <DropdownMenuItem
                            onClick={() => complete.mutate(d.id)}
                            disabled={complete.isPending}
                          >
                            <BadgeEuro className="mr-2 size-4" /> Bezahlt/Abgeschlossen
                          </DropdownMenuItem>
                        )}

                        <DropdownMenuItem onClick={() => duplicate.mutate(d.id)}>
                          <Copy className="mr-2 size-4" /> Duplizieren
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className={deletable ? "text-destructive" : "text-muted-foreground"}
                          title={
                            deletable
                              ? "Entwurf löschen"
                              : "Löschen rechtlich nicht zulässig – bitte stornieren"
                          }
                          onClick={() => {
                            if (!deletable) {
                              toast.error(deleteBlockedMessage(r), { duration: 9000 });
                              return;
                            }
                            onDelete(d.id, `${label} ${d.number}`);
                          }}
                        >
                          <Trash2 className="mr-2 size-4" /> Löschen
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
