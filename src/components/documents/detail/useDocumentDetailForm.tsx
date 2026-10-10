import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { taxNoteForTaxMode, today, vatRateForTaxMode } from "@/lib/format";
import { computeDocumentTotals, hasDiscountPosition } from "@/lib/document-totals";
import { useCanReverseCharge } from "@/lib/subscriptions";

import { type DocumentConfirmDialogState } from "@/components/documents/DocumentConfirmDialog";

import { buildInitialDocumentForm } from "@/lib/document-initial-form";

import { fetchDocumentDetail, type DocumentItem as Item } from "@/lib/document-detail-query";
import { useFileUrl } from "@/hooks/useFileUrl";

import { editBlockedMessage, isLockedDocument } from "@/lib/gobd-guard";

import { checkInvoiceDates } from "@/lib/invoice-period";
import { findDuplicateInvoice } from "@/lib/invoice-duplicate";

import { getRouteApi } from "@tanstack/react-router";
const routeApi = getRouteApi("/_authenticated/dokumente/$id");

export function useDocumentDetailForm() {
  const { id } = routeApi.useParams();
  const { bearbeiten } = routeApi.useSearch();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Standard ist die saubere Vorschau; Bearbeiten wird bewusst geöffnet.
  const [editMode, setEditMode] = useState(Boolean(bearbeiten));
  const [quoteRecipientMode, setQuoteRecipientMode] = useState<"interessent" | "kunde">(
    "interessent",
  );

  const { data, isLoading } = useQuery({
    queryKey: ["document", id],
    queryFn: () => fetchDocumentDetail(id),
  });

  const [form, setForm] = useState<Record<string, string | boolean | null>>({});
  const [items, setItems] = useState<Item[]>([]);
  const [mailOpen, setMailOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<DocumentConfirmDialogState | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [stornoOpen, setStornoOpen] = useState(false);
  const [stornoReason, setStornoReason] = useState("");

  const [payDate, setPayDate] = useState<string>("");
  // Autosave: letzte gespeicherte Fassung als Vergleichs-Fingerabdruck.
  const savedSnapshotRef = useRef<string>("");
  const [autoSavedAt, setAutoSavedAt] = useState<string>("");

  // Schutz gegen Überschreiben: die Eingabefelder gehören allein dem lokalen
  // State. Server-Daten werden nur beim ersten Laden dieses Belegs übernommen –
  // Refetches nach Autosave/Hintergrund-Mutationen füllen die Felder nie nach.
  const initializedIdRef = useRef<string>("");
  // Formularstand direkt nach dem Laden – Referenz für „unberührter Entwurf“.
  const baselineFormRef = useRef<Record<string, string | boolean | null> | null>(null);
  useEffect(() => {
    if (!data) return;
    if (initializedIdRef.current === id) return;
    initializedIdRef.current = id;
    const initialForm = buildInitialDocumentForm(data);
    baselineFormRef.current = initialForm;
    setForm(initialForm);
    setQuoteRecipientMode(initialForm["customer_id"] ? "kunde" : "interessent");

    setItems(
      data.items.map((i) => ({
        ...i,
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
        is_optional: Boolean((i as unknown as Record<string, unknown>)["is_optional"]),
      })),
    );
    savedSnapshotRef.current = "";
  }, [data, id]);

  const { canReverseCharge, isLoading: planLoading } = useCanReverseCharge();
  const isSmallBusiness = Boolean(
    (data?.settings as Record<string, unknown> | null | undefined)?.["small_business"],
  );
  // Kundentyp: Privatkunden ohne Firmen-/Steuerfelder.
  const isPrivat = String(form["customer_type"] ?? "firma") === "privat";
  // Bestandsschutz: Belege, die bereits als Reverse-Charge gespeichert wurden,
  // dürfen nie automatisch auf 19 % Inland umgestellt werden.
  const storedTaxMode = String(
    (data?.doc as Record<string, unknown> | undefined)?.["tax_mode"] ?? "",
  );
  const reverseChargeAllowed =
    canReverseCharge || planLoading || storedTaxMode === "eu_reverse_charge";
  const rawTaxMode = String(form["tax_mode"] ?? "domestic");
  // Kleinunternehmer § 19 UStG: nie Umsatzsteuer ausweisen.
  // Feature-Gate: Reverse-Charge nur ab Pro – neue Belege von Basis-Konten rechnen mit 19 % ab.
  const taxMode = isSmallBusiness
    ? "kleinunternehmer"
    : rawTaxMode === "eu_reverse_charge" && !reverseChargeAllowed
      ? "domestic"
      : rawTaxMode;
  const vatRate = vatRateForTaxMode(taxMode);
  const taxNote = taxNoteForTaxMode(taxMode);

  const logoSrc = useFileUrl(
    data?.settings && (data.settings as Record<string, unknown>)["logo_url"]
      ? String((data.settings as Record<string, unknown>)["logo_url"])
      : "",
  );

  const hasOptionalItems = useMemo(() => items.some((i) => i.is_optional), [items]);
  const regularTotal = useMemo(
    () =>
      items
        .filter((i) => !i.is_optional)
        .reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_price), 0),
    [items],
  );
  /**
   * Enthält der Beleg bereits eine aus der Kalkulation übertragene
   * Rabattposition (negativer Einzelpreis), darf kein zweiter Belegrabatt
   * greifen – sonst würde derselbe Nachlass doppelt abgezogen.
   */
  const discountItemPresent = useMemo(() => hasDiscountPosition(items), [items]);
  const enteredDiscountPercent = Math.min(
    100,
    Math.max(0, Number(String(form["discount_percent"] ?? "0").replace(",", ".")) || 0),
  );
  const discountPercent = discountItemPresent ? 0 : enteredDiscountPercent;
  const discountReason = String(form["discount_reason"] ?? "");
  const { itemsTotal, discountAmount, netTotal, vatAmount, grossTotal } = computeDocumentTotals(
    items,
    discountPercent,
    vatRate,
  );

  /** Schreibt Kopf und Positionen des Belegs in die Datenbank (Speichern + Autosave). */
  const persistDocument = useCallback(async () => {
    const current = data?.doc as unknown as Record<string, unknown> | undefined;
    // Schutz: echte Belege (versendet/festgeschrieben) dürfen nie überschrieben werden.
    if (isLockedDocument(current)) throw new Error(editBlockedMessage(current));
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error("Nicht angemeldet");
    // Nummern werden automatisch/fortlaufend vergeben und nie aus dem Formular übernommen.
    const number = String((data?.doc as { number?: string } | undefined)?.number ?? "").trim();
    if (!number) throw new Error("Beleg konnte nicht geladen werden.");

    const selectedProjectId = String(form["project_id"] ?? "").trim();
    if (selectedProjectId) {
      const selectedProject = data?.projects.find((p) => p.id === selectedProjectId);
      const selectedCustomerId = String(form["customer_id"] ?? "").trim();
      if (
        !selectedProject ||
        !selectedCustomerId ||
        selectedProject.customer_id !== selectedCustomerId
      ) {
        throw new Error(
          "Das gewählte Objekt gehört nicht zu diesem Kunden. Bitte Kunde und Objekt korrekt zuordnen.",
        );
      }
    }

    if (String(current?.["type"] ?? "") === "invoice") {
      // 1. Rechnungsdatum darf nicht vor dem Leistungszeitraum liegen.
      const check = checkInvoiceDates(
        String(form["issue_date"] ?? ""),
        String(form["service_period"] ?? ""),
      );
      if (check.level === "error") throw new Error(check.message);

      // 2. Keine zweite Rechnung für denselben Kunden und Leistungsmonat.
      if (String(form["status"] ?? "draft") !== "draft") {
        const dup = await findDuplicateInvoice({
          currentId: id,
          customerId: (form["customer_id"] as string | null) || null,
          servicePeriod: String(form["service_period"] ?? ""),
        });
        if (dup)
          throw new Error(
            `Für diesen Kunden existiert bereits die Rechnung ${dup.number} für den Leistungszeitraum ${dup.period}. Doppelte Abrechnung wurde verhindert.`,
          );
      }
    }

    const payload = {
      ...form,
      number,
      due_date: form["due_date"] ? form["due_date"] : null,
      paid_at: form["status"] === "paid" ? form["paid_at"] || today() : null,
      customer_id: form["customer_id"] || null,
      tax_mode: taxMode,
      vat_rate: vatRate,
      reverse_charge: taxMode === "eu_reverse_charge",
      discount_percent: discountPercent,
      discount_amount: discountAmount,
      discount_reason: discountReason,
      net_total: netTotal,
      vat_amount: vatAmount,
      total: grossTotal,
    };

    const { error: docError } = await supabase
      .from("documents")
      .update(payload as never)
      .eq("id", id);
    if (docError) throw docError;

    const { error: delError } = await supabase
      .from("document_items")
      .delete()
      .eq("document_id", id);
    if (delError) throw delError;

    if (items.length > 0) {
      const { error: insError } = await supabase.from("document_items").insert(
        items.map((i, index) => ({
          document_id: id,
          user_id: userId,
          position: index + 1,
          description: i.description,
          quantity: i.quantity,
          unit: i.unit,
          unit_price: i.unit_price,
          is_optional: Boolean(i.is_optional),
        })),
      );
      if (insError) throw insError;
    }
  }, [
    data,
    form,
    items,
    id,
    taxMode,
    vatRate,
    discountPercent,
    discountAmount,
    discountReason,
    netTotal,
    vatAmount,
    grossTotal,
  ]);

  // Autosave greift auf die jeweils aktuellste Fassung zu, ohne den Timer neu zu starten.
  const persistRef = useRef(persistDocument);
  persistRef.current = persistDocument;
  return {
    autoSavedAt,
    baselineFormRef,
    bearbeiten,
    confirmDialog,
    data,
    discountAmount,
    discountItemPresent,
    discountPercent,
    discountReason,
    editMode,
    form,
    grossTotal,
    hasOptionalItems,
    id,
    isLoading,
    isPrivat,
    isSmallBusiness,
    items,
    itemsTotal,
    logoSrc,
    mailOpen,
    navigate,
    netTotal,
    payDate,
    payOpen,
    persistDocument,
    persistRef,
    queryClient,
    quoteRecipientMode,
    regularTotal,
    reverseChargeAllowed,
    savedSnapshotRef,
    setAutoSavedAt,
    setConfirmDialog,
    setEditMode,
    setForm,
    setItems,
    setMailOpen,
    setPayDate,
    setPayOpen,
    setQuoteRecipientMode,
    setStornoOpen,
    setStornoReason,
    stornoOpen,
    stornoReason,
    taxMode,
    taxNote,
    vatAmount,
    vatRate,
  };
}
