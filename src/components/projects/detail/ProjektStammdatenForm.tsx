import { Link } from "@tanstack/react-router";

import { openStoredFile } from "@/lib/storage";
import { FileUploadButton } from "@/components/FileUploadButton";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Calculator, FileText, Loader2, UserRound, Users } from "lucide-react";

import { modeLabel } from "@/routes/_authenticated/projekte.index";

import type { ProjektDetailState } from "./useProjektDetailState";
export function ProjektStammdatenForm({ state }: { state: ProjektDetailState }) {
  const {
    analyzing,
    effectiveProjectAddress,
    handleUploaded,
    isTender,
    items,
    linkedCustomerEmail,
    linkedCustomerName,
    linkedCustomerPhone,
    patchProject,
    project,
    topCover,
    totalSqm,
  } = state;
  return (
    <section className="surface space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{project.name || "Ohne Namen"}</h1>
          <p className="text-sm text-muted-foreground">{modeLabel(project.mode)}</p>
        </div>
        <div className="flex items-center gap-2">
          <FileUploadButton
            folder="projekte"
            accept="application/pdf,image/*"
            label={isTender ? "Ausschreibung hochladen" : "Grundriss hochladen"}
            onUploaded={(path, file) => void handleUploaded(path, file)}
          />
          {analyzing && (
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> KI-Analyse läuft …
            </span>
          )}
          {!analyzing && isTender && project.source_file_name && (
            <span className="text-sm text-emerald-700">
              ✓ Datei geladen{items.length > 0 ? ` · ${items.length} Positionen erkannt` : ""}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/20 p-3">
        {project.customer_id ? (
          <Button asChild size="sm" variant="outline">
            <Link to="/kunden/$id" params={{ id: project.customer_id }}>
              <UserRound className="size-4" /> Kunde
            </Link>
          </Button>
        ) : null}
        <Button asChild size="sm" variant="outline">
          <Link
            to="/kalkulation"
            search={{
              area: Math.round(totalSqm * 100) / 100,
              objekt: project.name || "",
              belag: topCover[0]?.[0] ?? "",
              projekt: project.id,
            }}
          >
            <Calculator className="size-4" /> Kalkulation
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href="#objekt-controlling">Nachkalkulation</a>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href="#objekt-team">
            <Users className="size-4" /> Mitarbeiter
          </a>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/dokumente">
            <FileText className="size-4" /> Dokumente
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="h-name">Projektname / Objekt</Label>
          <Input
            id="h-name"
            defaultValue={project.name ?? ""}
            onBlur={(e) => patchProject.mutate({ name: e.target.value })}
          />
        </div>

        {project.customer_id ? (
          <div className="rounded-lg border p-3 sm:col-span-1 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs text-muted-foreground">Kunde · Stammdaten</div>
                <div className="font-semibold">{linkedCustomerName}</div>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link to="/kunden/$id" params={{ id: project.customer_id }}>
                  Stammdaten öffnen
                </Link>
              </Button>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {[linkedCustomerEmail, linkedCustomerPhone].filter(Boolean).join(" · ") ||
                "Keine Kontaktdaten hinterlegt"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Kundendaten werden zentral in der Kundenakte gepflegt und hier nur angezeigt.
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="h-customer_name">Kunde</Label>
              <Input
                id="h-customer_name"
                defaultValue={project.customer_name ?? ""}
                onBlur={(e) => patchProject.mutate({ customer_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="h-contact_email">E-Mail</Label>
              <Input
                id="h-contact_email"
                defaultValue={project.contact_email ?? ""}
                onBlur={(e) => patchProject.mutate({ contact_email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="h-contact_phone">Telefon</Label>
              <Input
                id="h-contact_phone"
                defaultValue={project.contact_phone ?? ""}
                onBlur={(e) => patchProject.mutate({ contact_phone: e.target.value })}
              />
            </div>
          </>
        )}

        {(
          [
            ["address_line", "Einsatzort – Straße und Hausnummer"],
            ["postal_code", "Einsatzort – PLZ"],
            ["city", "Einsatzort – Ort"],
          ] as const
        ).map(([key, label]) => {
          const addressValue =
            key === "address_line"
              ? effectiveProjectAddress.address_line
              : key === "postal_code"
                ? effectiveProjectAddress.postal_code
                : effectiveProjectAddress.city;
          return (
            <div key={key} className="space-y-2">
              <Label htmlFor={`h-${key}`}>{label}</Label>
              <Input
                id={`h-${key}`}
                key={`${key}-${addressValue}`}
                defaultValue={String(addressValue ?? "")}
                onBlur={(e) => patchProject.mutate({ [key]: e.target.value })}
              />
            </div>
          );
        })}
      </div>

      {project.source_file_name && (
        <p className="text-sm text-muted-foreground">
          Datei:{" "}
          {project.source_file_path ? (
            <button
              type="button"
              className="underline"
              onClick={() =>
                void openStoredFile(project.source_file_path, project.source_file_name)
              }
            >
              {project.source_file_name}
            </button>
          ) : (
            project.source_file_name
          )}
        </p>
      )}
    </section>
  );
}
