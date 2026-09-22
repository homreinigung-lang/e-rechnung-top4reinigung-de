import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Mail, Paperclip } from "lucide-react";
import { mergePdfs } from "@/lib/pdf";
import { useServerFn } from "@tanstack/react-start";
import { sendInvoiceEmail } from "@/lib/email.functions";
import { buildEmailHtml } from "@/lib/signature";

export type SendEmailDefaults = {
  to: string;
  subject: string;
  body: string;
  signatureText?: string;
  signatureHtml?: string;
  fileBaseName: string;
  /** Firmenname und Firmen-E-Mail der angemeldeten Firma (dynamisch, nie fest). */
  companyName?: string;
  companyEmail?: string;
};

export function SendEmailDialog({
  open,
  onOpenChange,
  defaults,
  buildPdfBytes,
  beforeSend,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults: SendEmailDefaults;
  /**
   * Einzige PDF-Quelle: identische Erzeugung wie Vorschau und Download
   * (pdf-lib, A4, feste Ränder, gleiche Seitenumbruch-Regeln).
   * Es gibt bewusst KEINEN zweiten Render-Pfad für den E-Mail-Versand.
   */
  buildPdfBytes: () => Promise<Uint8Array>;
  /** Archive/verify the final invoice PDF before a remote email request. */
  beforeSend?: (originalPdf: Uint8Array) => Promise<Uint8Array>;
  onSent?: () => void | Promise<void>;
}) {
  const [to, setTo] = useState(defaults.to);
  const [subject, setSubject] = useState(defaults.subject);
  const [body, setBody] = useState(defaults.body);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [merge, setMerge] = useState(true);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const attempt = useRef<{ payload: string; requestId: string } | null>(null);
  const sendEmail = useServerFn(sendInvoiceEmail);

  useEffect(() => {
    if (!open) return;
    setTo(defaults.to);
    setSubject(defaults.subject);
    setBody(defaults.body);
  }, [open]);

  async function buildPdf() {
    // The exact invoice bytes are verified/archived BEFORE any email request.
    const generated: Uint8Array = await buildPdfBytes();
    const invoice = beforeSend ? await beforeSend(generated) : generated;
    if (attachment && merge) {
      const extra = new Uint8Array(await attachment.arrayBuffer());
      return mergePdfs([invoice, extra]);
    }
    return invoice;
  }

  function toBase64(bytes: Uint8Array) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  async function handleSend() {
    if (sending.current) return;
    if (!to.trim()) {
      toast.error("Bitte eine Empfänger-Adresse angeben.");
      return;
    }
    sending.current = true;
    setBusy(true);
    try {
      const bytes = await buildPdf();
      const pdfBase64 = toBase64(bytes);
      const payload = JSON.stringify([to.trim(), subject, body, defaults, pdfBase64]);
      if (attempt.current?.payload !== payload) {
        attempt.current = { payload, requestId: crypto.randomUUID() };
      }
      await sendEmail({
        data: {
          to: to.trim(),
          subject,
          body: [body, defaults.signatureText].filter(Boolean).join("\n"),
          html: buildEmailHtml(body, defaults.signatureHtml ?? ""),
          filename: `${defaults.fileBaseName}.pdf`,
          pdfBase64,
          requestId: attempt.current.requestId,
          ...(defaults.companyName ? { companyName: defaults.companyName } : {}),
          ...(defaults.companyEmail ? { companyEmail: defaults.companyEmail } : {}),
        },
      });
      try {
        await onSent?.();
      } catch (e) {
        toast.error(
          e instanceof Error
            ? e.message
            : "E-Mail versendet, aber der Versandstatus ist ungeklärt. Bitte vor erneutem Senden prüfen.",
          { duration: 12000 },
        );
        onOpenChange(false);
        return;
      }
      toast.success(`Die E-Mail wurde erfolgreich an ${to.trim()} gesendet.`, {
        description: `${defaults.companyEmail ? `Kopie an ${defaults.companyEmail} · ` : ""}PDF${
          attachment && merge ? " inkl. Anlage" : ""
        } angehängt · Status: Versendet`,
        duration: 8000,
      });
      onOpenChange(false);
      attempt.current = null;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "E-Mail konnte nicht gesendet werden");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>E-Mail senden</DialogTitle>
          <DialogDescription>
            Text prüfen, optional eine Anlage anhängen – die E-Mail wird direkt mit PDF versendet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mail-to">Empfänger</Label>
            <Input id="mail-to" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mail-subject">Betreff</Label>
            <Input id="mail-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mail-body">Nachricht</Label>
            <Textarea
              id="mail-body"
              rows={10}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Ihre Signatur inkl. Logo wird automatisch unter die Nachricht gesetzt.
            </p>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <Label>Anlage (PDF, z. B. Stundennachweis oder Lieferschein)</Label>
            <Input
              type="file"
              accept="application/pdf"
              onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
            />
            {attachment && (
              <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Paperclip className="size-3" /> {attachment.name}
              </p>
            )}
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={merge} onCheckedChange={(v) => setMerge(v === true)} />
              <span>Anlage in dieselbe PDF-Datei integrieren (z. B. für SGS)</span>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSend} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
            E-Mail direkt senden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
