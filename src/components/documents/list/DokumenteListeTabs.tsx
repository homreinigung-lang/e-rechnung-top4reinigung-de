import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { toast } from "sonner";
import { deleteBlockedMessage, isLockedDocument } from "@/lib/gobd-guard";
import { DOC_TYPE_LABEL, STATUS_LABEL, formatDate, formatMoney, today } from "@/lib/format";

import { dueInfo, mahnLabel, mahnungAllowed } from "@/lib/workflow";
import { BadgeEuro, BellRing, Copy, Gavel, MoreVertical, Trash2 } from "lucide-react";

import { AngebotsTabelle } from "./AngebotsTabelle";
import type { DokumenteListeState } from "./useDokumenteListeState";
export function DokumenteListeTabs({ state }: { state: DokumenteListeState }) {
  const {
    complete,
    convert,
    decide,
    documents,
    duplicate,
    filteredInvoices,
    invoiceFilter,
    list,
    markPaid,
    numberById,
    openAmount,
    openInvoices,
    overdueAmount,
    overdueInvoices,
    paidAmount,
    paidInvoices,
    quoteToInvoice,
    reminder,
    remove,
    setDeclineReason,
    setDeclineTarget,
    setDeleteTarget,
    setInvoiceFilter,
    setPayDate,
    setPayTarget,
    stornoReasonById,
    tab,
    toInvoice,
  } = state;
  return (
    <>
      {tab === "quote" || tab === "order" ? (
        <AngebotsTabelle
          kind={tab}
          list={list}
          decide={decide}
          decline={(id: string, label: string) => {
            setDeclineTarget({ id, label });
            setDeclineReason("");
          }}
          convert={convert}
          toInvoice={tab === "order" ? toInvoice : quoteToInvoice}
          complete={complete}
          duplicate={duplicate}
          remove={remove}
          isLocked={(r: Record<string, unknown>) => isLockedDocument(r)}
          followUp={(id: string) => {
            const src = documents.find((x) => x.id === id);
            const targetId = src?.converted_document_id ?? null;
            if (!targetId) return null;
            const target = documents.find((x) => x.id === targetId);
            if (!target) return null;
            return { id: target.id, number: String(target.number), type: String(target.type) };
          }}
          onDelete={(id, label) => setDeleteTarget({ id, label })}
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setInvoiceFilter("open")}
              className={`surface p-4 text-left transition hover:bg-muted/50 ${invoiceFilter === "open" ? "ring-2 ring-primary" : ""}`}
            >
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Offen
              </div>
              <div className="mt-1 text-2xl font-bold">{formatMoney(openAmount)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {openInvoices.length} offene Rechnung{openInvoices.length === 1 ? "" : "en"}
              </div>
            </button>
            <button
              type="button"
              onClick={() => setInvoiceFilter("overdue")}
              className={`surface p-4 text-left transition hover:bg-muted/50 ${invoiceFilter === "overdue" ? "ring-2 ring-destructive" : ""}`}
            >
              <div className="text-xs font-medium uppercase tracking-wide text-destructive">
                Überfällig
              </div>
              <div className="mt-1 text-2xl font-bold text-destructive">
                {formatMoney(overdueAmount)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {overdueInvoices.length} überfällige Rechnung
                {overdueInvoices.length === 1 ? "" : "en"}
              </div>
            </button>
            <button
              type="button"
              onClick={() => setInvoiceFilter("paid")}
              className={`surface p-4 text-left transition hover:bg-muted/50 ${invoiceFilter === "paid" ? "ring-2 ring-primary" : ""}`}
            >
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Bezahlt
              </div>
              <div className="mt-1 text-2xl font-bold">{formatMoney(paidAmount)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {paidInvoices.length} bezahlte Rechnung{paidInvoices.length === 1 ? "" : "en"}
              </div>
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              ["all", "Alle"],
              ["open", "Offen"],
              ["overdue", "Überfällig"],
              ["paid", "Bezahlt"],
            ].map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={invoiceFilter === value ? "default" : "outline"}
                onClick={() => setInvoiceFilter(value as "all" | "open" | "overdue" | "paid")}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="surface overflow-hidden">
            {filteredInvoices.length === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-muted-foreground">
                {invoiceFilter === "overdue"
                  ? "Keine überfälligen Rechnungen."
                  : invoiceFilter === "open"
                    ? "Keine offenen Rechnungen."
                    : invoiceFilter === "paid"
                      ? "Noch keine bezahlten Rechnungen."
                      : "Noch keine Rechnungen vorhanden."}
              </p>
            ) : (
              <ul className="divide-y">
                {filteredInvoices.map((d) => {
                  const r = d as unknown as Record<string, unknown>;
                  const isStorno = Boolean(r["is_storno"]);
                  const cancelsNumber = r["cancels_document_id"]
                    ? (numberById.get(String(r["cancels_document_id"])) ?? "")
                    : "";
                  const cancelledByNumber = r["cancelled_by_document_id"]
                    ? (numberById.get(String(r["cancelled_by_document_id"])) ?? "")
                    : "";
                  const cancelledReason = r["cancelled_by_document_id"]
                    ? (stornoReasonById.get(String(r["cancelled_by_document_id"])) ?? "")
                    : "";
                  const due = isStorno ? null : dueInfo(d.due_date, d.status);
                  const level = Number(r["reminder_level"] ?? 0);
                  const deletable = !isLockedDocument(r);

                  return (
                    <li key={d.id} className="px-5 py-4 hover:bg-muted/60">
                      <div className="flex items-center gap-2">
                        <Link
                          to="/dokumente/$id"

                          params={{ id: d.id }}
                          className="flex flex-1 flex-wrap items-center justify-between gap-3"
                        >
                          <div>
                            <div className="flex flex-wrap items-center gap-2 font-medium">
                              <span>
                                {isStorno ? "Stornorechnung" : DOC_TYPE_LABEL[d.type]} {d.number}
                              </span>
                              {isStorno && cancelsNumber ? (
                                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                                  Storno zu {cancelsNumber}
                                </span>
                              ) : null}
                              {/* Storno-Hinweis erscheint nur einmal – als Unterzeile unten. */}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {d.customer_company || d.customer_name || "Ohne Kunde"} ·{" "}
                              {formatDate(d.issue_date)}
                              {due ? (
                                <>
                                  {" · "}
                                  <span
                                    className={due.overdue ? "font-medium text-destructive" : ""}
                                  >
                                    {due.label}
                                  </span>
                                </>
                              ) : null}
                              {!isStorno && level > 0 ? ` · ${mahnLabel(level)}` : ""}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium">{formatMoney(Number(d.total))}</div>
                            <div className="text-xs text-muted-foreground">
                              {isStorno ? "Storniert (Korrekturbeleg)" : STATUS_LABEL[d.status]}
                            </div>
                          </div>
                        </Link>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" title="Aktionen">
                              <MoreVertical className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            {d.type === "invoice" &&
                              d.status !== "paid" &&
                              d.status !== "cancelled" &&
                              d.status !== "draft" && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      if (confirm("Freundliche Zahlungserinnerung jetzt senden?")) {
                                        reminder.mutate({ docId: d.id, kind: "erinnerung" });
                                      }
                                    }}
                                    disabled={reminder.isPending}
                                  >
                                    <BellRing className="mr-2 size-4" /> Zahlungserinnerung
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      if (
                                        confirm("Offizielle Mahnung jetzt senden? [Jetzt senden]")
                                      ) {
                                        reminder.mutate({ docId: d.id, kind: "mahnung" });
                                      }
                                    }}
                                    disabled={reminder.isPending || !mahnungAllowed(d.due_date)}
                                  >
                                    <Gavel className="mr-2 size-4" /> Mahnung senden
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                </>
                              )}

                            {/* Zahlungsstatus ist von der GoBD-Sperre ausgenommen – jederzeit möglich. */}
                            {d.type === "invoice" &&
                              d.status !== "paid" &&
                              d.status !== "cancelled" &&
                              d.status !== "draft" && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setPayTarget({
                                      id: d.id,
                                      label: `${DOC_TYPE_LABEL[d.type]} ${d.number}`,
                                    });
                                    setPayDate(formatDate(today()));
                                  }}
                                  disabled={markPaid.isPending}
                                >
                                  <BadgeEuro className="mr-2 size-4 text-primary" /> Als bezahlt
                                  markieren
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
                                setDeleteTarget({
                                  id: d.id,
                                  label: `${DOC_TYPE_LABEL[d.type]} ${d.number}`,
                                });
                              }}
                            >
                              <Trash2 className="mr-2 size-4" /> Löschen
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {cancelledByNumber ? (
                        <p className="mt-1 pl-1 text-xs text-destructive">
                          Storniert durch {cancelledByNumber}
                          {cancelledReason ? ` · Grund: ${cancelledReason}` : ""}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
