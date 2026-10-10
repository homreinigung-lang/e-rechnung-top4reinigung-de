import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { FileText, Loader2, Plus, Upload, X } from "lucide-react";

import { MODES } from "./shared";

import type { ProjekteIndexState } from "./useProjekteIndexState";
export function ProjekteIndexProjekte({ state }: { state: ProjekteIndexState }) {
  const {
    create,
    customerId,
    customers,
    dragging,
    file,
    inputRef,
    mode,
    name,
    open,
    projectAddressLine,
    projectCity,
    projectPostalCode,
    setCustomerId,
    setDragging,
    setFile,
    setMode,
    setName,
    setOpen,
    setProjectAddressLine,
    setProjectCity,
    setProjectPostalCode,
    step,
  } = state;
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold">Projekte</h1>
        <p className="mt-1 text-muted-foreground">
          Grundrisse als Raumbuch oder Ausschreibungen als Leistungsverzeichnis strukturieren.
        </p>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="size-4" /> Neues Projekt
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neues Projekt</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="p-name">Projektname</Label>
              <Input
                id="p-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z. B. Bürogebäude Saarbrücken"
              />
            </div>
            <div className="space-y-2">
              <Label>Modus</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Kunde (optional)</Label>
              <Select
                value={customerId}
                onValueChange={(value) => {
                  setCustomerId(value);
                  const customer = customers.find((item) => item.id === value);
                  setProjectAddressLine(customer?.service_address_line ?? "");
                  setProjectPostalCode(customer?.service_postal_code ?? "");
                  setProjectCity(customer?.service_city ?? "");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kunde wählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kein Kunde</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.company || c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border p-3">
              <p className="mb-3 text-sm font-semibold">Einsatzort dieses Projekts / Objekts</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="p-address">Straße und Hausnummer</Label>
                  <Input
                    id="p-address"
                    value={projectAddressLine}
                    onChange={(e) => setProjectAddressLine(e.target.value)}
                    placeholder="z. B. Saarstahl Völklingen Tor 1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-postal">PLZ</Label>
                  <Input
                    id="p-postal"
                    value={projectPostalCode}
                    onChange={(e) => setProjectPostalCode(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-city">Ort</Label>
                  <Input
                    id="p-city"
                    value={projectCity}
                    onChange={(e) => setProjectCity(e.target.value)}
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Der Einsatzort wird pro Projekt gespeichert. So können z. B. bei einer
                Hausverwaltung mehrere Häuser mit unterschiedlichen Adressen angelegt werden.
              </p>
            </div>

            <div className="space-y-2">
              <Label>
                {mode === "tender" ? "Ausschreibung (PDF)" : "Grundriss (PDF oder Foto)"}
              </Label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const dropped = e.dataTransfer.files?.[0];
                  if (dropped) setFile(dropped);
                }}
                onClick={() => inputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm transition ${
                  dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
                }`}
              >
                {file ? (
                  <>
                    <FileText className="size-5 text-muted-foreground" />
                    <span className="font-medium">{file.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                    >
                      <X className="size-4" /> Entfernen
                    </Button>
                  </>
                ) : (
                  <>
                    <Upload className="size-5 text-muted-foreground" />
                    <span>Datei hierher ziehen oder klicken zum Auswählen</span>
                    <span className="text-xs text-muted-foreground">
                      PDF, JPG oder PNG – die Analyse startet automatisch nach dem Anlegen.
                    </span>
                  </>
                )}
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  if (selected) setFile(selected);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
          <DialogFooter className="items-center gap-3 sm:justify-between">
            {step ? (
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> {step}
              </span>
            ) : (
              <span />
            )}
            <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
              Projekt anlegen{file ? " & analysieren" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
