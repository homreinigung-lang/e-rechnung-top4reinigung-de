import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

import { FileUploadButton } from "@/components/FileUploadButton";

import { permanentFileUrl } from "@/lib/storage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ImagePlus } from "lucide-react";
import { buildSignatureHtml } from "@/lib/signature";

import { SMTP_FIELDS } from "./shared";

import type { EinstellungenState } from "./useEinstellungenState";
export function EinstellungenEMailSMTPSignatur({ state }: { state: EinstellungenState }) {
  const { appendSignatureImage, form, insertSignatureImage, save, setForm, signatureImageInput } =
    state;
  return (
    <div className="surface space-y-4 p-6">
      <h2 className="font-display text-lg font-semibold">E-Mail (SMTP) & Signatur</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {SMTP_FIELDS.map((f) => (
          <div key={f.key} className="space-y-2">
            <Label htmlFor={f.key}>{f.label}</Label>
            <Input
              id={f.key}
              value={form[f.key] ?? ""}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
            />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <Label htmlFor="email_signature">E-Mail-Signatur (Text)</Label>
        <Textarea
          id="email_signature"
          rows={5}
          value={form["email_signature"] ?? ""}
          onChange={(e) => setForm({ ...form, email_signature: e.target.value })}
          placeholder={"Mit freundlichen Grüßen\nIhr Firmenname\nStraße, PLZ Ort"}
        />
        <p className="text-xs text-muted-foreground">
          Die Signatur wird automatisch unter jede Rechnungs- und Angebots-E-Mail gesetzt.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <div className="space-y-1">
          <h3 className="font-medium">Firmenlogo in der Signatur</h3>
          <p className="text-xs text-muted-foreground">
            Logo hochladen oder eine Bild-Adresse (URL) einfügen – es erscheint oben in der Signatur
            jeder Rechnungs- und Angebots-E-Mail.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <FileUploadButton
            folder="signatur"
            accept="image/*"
            label="Logo hochladen"
            onUploaded={async (path) => {
              try {
                const url = await permanentFileUrl(path);
                setForm((prev) => ({ ...prev, email_signature_logo_url: url }));
              } catch (e) {
                toast.error(
                  e instanceof Error ? e.message : "Bild-Adresse konnte nicht erstellt werden",
                );
              }
            }}
          />
          {form["email_signature_logo_url"] && (
            <Button
              variant="ghost"
              onClick={() => setForm({ ...form, email_signature_logo_url: "" })}
            >
              Logo entfernen
            </Button>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email_signature_logo_url">Bild-Adresse (URL)</Label>
          <Input
            id="email_signature_logo_url"
            placeholder="https://…/logo.png"
            value={form["email_signature_logo_url"] ?? ""}
            onChange={(e) => setForm({ ...form, email_signature_logo_url: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <div className="space-y-1">
          <h3 className="font-medium">HTML-Signatur (optional)</h3>
          <p className="text-xs text-muted-foreground">
            Hier können Sie eigenen HTML-Code mit Bildern, Links und Formatierung einsetzen. Wenn
            ausgefüllt, ersetzt dieser Block die Text-Signatur. Skripte werden aus
            Sicherheitsgründen entfernt.
          </p>
        </div>
        <Textarea
          id="email_signature_html"
          rows={8}
          className="font-mono text-xs"
          value={form["email_signature_html"] ?? ""}
          onChange={(e) => setForm({ ...form, email_signature_html: e.target.value })}
          placeholder={
            '<p><strong>Ihr Firmenname</strong><br />Straße, PLZ Ort</p>\n<img src="https://…/banner.png" alt="Logo" style="max-height:70px" />'
          }
        />
        <div className="flex flex-wrap gap-2">
          <input
            ref={signatureImageInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void insertSignatureImage(file);
            }}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <ImagePlus className="size-4" /> Bild-Optionen
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuItem onSelect={() => signatureImageInput.current?.click()}>
                Bild hochladen &amp; einfügen
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  const url = window.prompt("Bild-Adresse (URL) eingeben:", "https://");
                  if (!url || !/^https?:\/\//i.test(url)) return;
                  appendSignatureImage(url);
                }}
              >
                Bild per URL einfügen
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => appendSignatureImage("BILD-URL-HIER")}>
                Platzhalter einfügen
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  setForm((prev) => ({
                    ...prev,
                    email_signature_html: String(prev["email_signature_html"] ?? "").replace(
                      /\n?<img[^>]*>/gi,
                      "",
                    ),
                  }))
                }
              >
                Alle Bilder entfernen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="space-y-2">
          <Label>Vorschau</Label>
          <div
            className="rounded-md border bg-white p-4 text-sm text-black"
            // Vorschau der bereinigten Signatur
            dangerouslySetInnerHTML={{
              __html: buildSignatureHtml(form) || "<em>Keine Signatur hinterlegt</em>",
            }}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="website_url">Website (Link in der Signatur)</Label>
          <Input
            id="website_url"
            placeholder="https://www.hom-reinigung.de"
            value={form["website_url"] ?? ""}
            onChange={(e) => setForm({ ...form, website_url: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="facebook_url">Facebook / Social Media</Label>
          <Input
            id="facebook_url"
            placeholder="https://www.facebook.com/ihre-firma"
            value={form["facebook_url"] ?? ""}
            onChange={(e) => setForm({ ...form, facebook_url: e.target.value })}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Beide Adressen erscheinen in der E-Mail als blaue, anklickbare Links – wie eine
        professionelle Gmail-Signatur.
      </p>

      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        Speichern
      </Button>
    </div>
  );
}
