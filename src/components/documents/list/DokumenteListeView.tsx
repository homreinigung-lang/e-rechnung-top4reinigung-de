import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

import { parseGermanDate } from "@/lib/format";

import { ClipboardCheck, FileText, Plus, Receipt } from "lucide-react";

import { DokumenteListeTabs } from "./DokumenteListeTabs";
import type { DokumenteListeState } from "./useDokumenteListeState";
export function DokumenteListeView({ state }: { state: DokumenteListeState }) {
  const {
    create,
    decline,
    declineReason,
    declineTarget,
    deleteTarget,
    markPaid,
    payDate,
    payTarget,
    remove,
    selectTab,
    setDeclineReason,
    setDeclineTarget,
    setDeleteTarget,
    setPayDate,
    setPayTarget,
    tab,
  } = state;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Rechnungen & Angebote</h1>
          <p className="mt-1 text-muted-foreground">
            Automatische, fortlaufende Nummerierung gemäß § 14 UStG – lückenlos und
            manipulationssicher.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => create.mutate("quote")}
            disabled={create.isPending}
          >
            <FileText className="size-4" /> Neues Angebot
          </Button>
          <Button onClick={() => create.mutate("invoice")}>
            <Plus className="size-4" /> Neue Rechnung
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => selectTab(v as "invoice" | "quote" | "order")}>
        <TabsList>
          <TabsTrigger value="invoice">
            <Receipt className="mr-2 size-4" /> Rechnungen
          </TabsTrigger>
          <TabsTrigger value="quote">
            <FileText className="mr-2 size-4" /> Angebote
          </TabsTrigger>
          <TabsTrigger value="order">
            <ClipboardCheck className="mr-2 size-4" /> Auftragsbestätigungen
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <DokumenteListeTabs state={state} />

      <Dialog open={payTarget !== null} onOpenChange={(o) => !o && setPayTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Als bezahlt markieren</DialogTitle>
            <DialogDescription>
              {payTarget?.label} – Zahlungsdatum im Format TT.MM.JJJJ erfassen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="pay-date">Zahlungsdatum</Label>
            <Input
              id="pay-date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              placeholder="TT.MM.JJJJ"
              inputMode="numeric"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayTarget(null)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => {
                const iso = parseGermanDate(payDate);
                if (!iso) {
                  toast.error("Bitte das Datum im Format TT.MM.JJJJ eingeben.");
                  return;
                }
                if (!payTarget) return;
                markPaid.mutate({ docId: payTarget.id, date: iso });
                setPayTarget(null);
              }}
              disabled={markPaid.isPending}
            >
              Zahlung buchen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Entwurf löschen</DialogTitle>
            <DialogDescription>
              {deleteTarget?.label} wirklich unwiderruflich löschen?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!deleteTarget) return;
                remove.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }}
              disabled={remove.isPending}
            >
              Endgültig löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={declineTarget !== null} onOpenChange={(o) => !o && setDeclineTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Angebot ablehnen</DialogTitle>
            <DialogDescription>
              {declineTarget?.label}: Grund der Ablehnung für das Archiv festhalten (optional).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="decline-reason">Ablehnungsgrund</Label>
            <Input
              id="decline-reason"
              value={declineReason}
              placeholder="z. B. Preis zu hoch, anderer Anbieter"
              onChange={(e) => setDeclineReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineTarget(null)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => {
                if (!declineTarget) return;
                decline.mutate({ docId: declineTarget.id, reason: declineReason });
              }}
              disabled={decline.isPending}
            >
              Als abgelehnt archivieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
