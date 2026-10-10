import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { today } from "@/lib/format";

import { isEmptyDraft } from "@/lib/empty-draft";

import { draftPlaceholderNumber, ensureOfficialNumber } from "@/lib/doc-number";
import { describeGobdError, isLockedDocument } from "@/lib/gobd-guard";

import { formatPeriod, periodForIssueDate, syncMonthInText } from "@/lib/invoice-period";

import type { useDocumentDetailForm } from "./useDocumentDetailForm";

export function useDocumentDetailPersistence(input: {
  baselineFormRef: ReturnType<typeof useDocumentDetailForm>["baselineFormRef"];
  bearbeiten: ReturnType<typeof useDocumentDetailForm>["bearbeiten"];
  data: ReturnType<typeof useDocumentDetailForm>["data"];
  editMode: ReturnType<typeof useDocumentDetailForm>["editMode"];
  form: ReturnType<typeof useDocumentDetailForm>["form"];
  id: ReturnType<typeof useDocumentDetailForm>["id"];
  items: ReturnType<typeof useDocumentDetailForm>["items"];
  navigate: ReturnType<typeof useDocumentDetailForm>["navigate"];
  persistDocument: ReturnType<typeof useDocumentDetailForm>["persistDocument"];
  persistRef: ReturnType<typeof useDocumentDetailForm>["persistRef"];
  queryClient: ReturnType<typeof useDocumentDetailForm>["queryClient"];
  savedSnapshotRef: ReturnType<typeof useDocumentDetailForm>["savedSnapshotRef"];
  setAutoSavedAt: ReturnType<typeof useDocumentDetailForm>["setAutoSavedAt"];
  setEditMode: ReturnType<typeof useDocumentDetailForm>["setEditMode"];
}) {
  const {
    baselineFormRef,
    bearbeiten,
    data,
    editMode,
    form,
    id,
    items,
    navigate,
    persistDocument,
    persistRef,
    queryClient,
    savedSnapshotRef,
    setAutoSavedAt,
    setEditMode,
  } = input;
  const save = useMutation({
    mutationFn: () => persistDocument(),
    onSuccess: () => {
      toast.success("Gespeichert");
      // Verlässt der Beleg den Entwurfsstatus, wird die offizielle Nummer vergeben.
      void (async () => {
        if (String(form["status"] ?? "draft") !== "draft") {
          try {
            await ensureOfficialNumber(id);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Nummernvergabe fehlgeschlagen");
          }
        }
        await queryClient.invalidateQueries({ queryKey: ["document", id] });
        await queryClient.invalidateQueries({ queryKey: ["documents"] });
      })();
    },
    onError: (e: Error) =>
      toast.error(describeGobdError(e, data?.doc as unknown as Record<string, unknown>), {
        duration: 9000,
      }),
  });

  // Entwurf automatisch sichern – schonend: erst nach einer Schreibpause (Debounce)
  // oder geräuschlos beim Verlassen der Seite. Kein Speichern mitten beim Tippen.
  const AUTOSAVE_DELAY_MS = 4000;
  // Zugriff auf die jeweils aktuellen Server-Daten, ohne sie als Dependency
  // in den Debounce-Effect zu ziehen (kein Timer-Neustart durch Refetches).
  const dataRef = useRef(data);
  dataRef.current = data;
  // Verweis auf den aktuellen Flush, damit die Unload-Listener nur einmal
  // gemountet werden müssen und trotzdem stets die neueste Fassung sichern.
  const flushRef = useRef<() => void>(() => {});
  // Leere Entwürfe (nur Standardwerte) werden weder gespeichert noch behalten.
  const blankDraft = isEmptyDraft(form, items, baselineFormRef.current);
  const blankDraftRef = useRef(blankDraft);
  blankDraftRef.current = blankDraft;

  useEffect(() => {
    const serverData = dataRef.current;
    if (!serverData) return;
    const current = serverData.doc as unknown as Record<string, unknown>;
    if (isLockedDocument(current)) return;
    if (Object.keys(form).length === 0) return;
    if (isEmptyDraft(form, items, baselineFormRef.current)) {
      // Nichts eingegeben – kein Autosave, damit keine leere Karteileiche entsteht.
      flushRef.current = () => {};
      return;
    }
    const snapshot = JSON.stringify({ form, items });
    if (!savedSnapshotRef.current) {
      savedSnapshotRef.current = snapshot;
      return;
    }
    if (savedSnapshotRef.current === snapshot) return;

    // Vollkommen geräuschlose Hintergrund-Speicherung: kein Ladezustand,
    // kein Overlay, kein erneutes Befüllen der Eingabefelder.
    const flush = () => {
      if (savedSnapshotRef.current === snapshot) return;
      void persistRef
        .current()
        .then(() => {
          savedSnapshotRef.current = snapshot;
          setAutoSavedAt(
            new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
          );
        })
        .catch(() => {
          /* Fehler zeigt der manuelle Speichern-Button */
        });
    };
    flushRef.current = flush;
    const timer = setTimeout(flush, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [form, items]);

  // Unload-Listener genau einmal pro Beleg registrieren (Mount/Unmount) –
  // sie greifen über flushRef immer auf den neuesten Flush zu.
  useEffect(() => {
    const onPageHide = () => flushRef.current();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushRef.current();
    };
    const onBeforeUnload = () => flushRef.current();
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Beim Verlassen der Seite einen komplett leeren Entwurf wieder entfernen.
  useEffect(() => {
    return () => {
      if (!blankDraftRef.current) return;
      const current = dataRef.current?.doc as Record<string, unknown> | undefined;
      if (!current) return;
      if (isLockedDocument(current)) return;
      if (String(current["status"] ?? "draft") !== "draft") return;
      void (async () => {
        await supabase.from("document_items").delete().eq("document_id", id);
        const { error } = await supabase.from("documents").delete().eq("id", id);
        if (!error) await queryClient.invalidateQueries({ queryKey: ["documents"] });
      })();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Bearbeitungsmodus merken, damit man an derselben Stelle weiterarbeitet.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `doc-edit:${id}`;
    if (bearbeiten) {
      window.localStorage.setItem(key, "1");
      return;
    }
    if (window.localStorage.getItem(key) === "1") setEditMode(true);
  }, [id, bearbeiten]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `doc-edit:${id}`;
    if (editMode) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  }, [id, editMode]);

  const duplicate = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const doc = data!.doc as Record<string, unknown>;
      // Entwurfsnummer (Platzhalter): die offizielle fortlaufende Nummer wird
      // erst beim Festschreiben vergeben – so entstehen keine Lücken (§ 14 UStG).
      const nextNr = draftPlaceholderNumber(String(doc["type"] ?? "invoice") as never);
      // Kopie startet mit aktuellem Datum und passendem Leistungsmonat.
      const issueDate = today();
      const period = periodForIssueDate(issueDate);
      const servicePeriod = period ? formatPeriod(period) : String(doc["service_period"] ?? "");
      const serviceDescription = period
        ? syncMonthInText(String(doc["service_description"] ?? ""), period.end)
        : String(doc["service_description"] ?? "");

      const {
        id: _id,
        created_at: _c,
        updated_at: _u,
        sent_at: _s,
        // GoBD-Felder dürfen niemals mitkopiert werden – die Kopie ist ein Entwurf.
        locked_at: _l,
        archived_at: _a,
        pdf_path: _p,
        pdf_sha256: _h,
        is_storno: _st,
        cancels_document_id: _cd,
        cancelled_by_document_id: _cb,
        storno_reason: _sr,
        converted_document_id: _cv,
        paid_at: _pa,
        reminder_level: _rl,
        last_reminder_at: _lr,
        retention_until: _ru,
        deleted_at: _dl,
        ...rest
      } = doc as unknown as Record<string, unknown>;

      const { data: created, error } = await supabase
        .from("documents")
        .insert({
          ...rest,
          user_id: userId,
          number: nextNr,
          status: "draft",
          issue_date: issueDate,
          due_date: null,
          service_period: servicePeriod,
          service_description: serviceDescription,
        } as never)
        .select("id")
        .single();
      if (error) throw error;

      if (items.length > 0) {
        await supabase.from("document_items").insert(
          items.map((i, index) => ({
            document_id: created.id,
            user_id: userId,
            position: index + 1,
            description: i.description,
            quantity: i.quantity,
            unit: i.unit,
            unit_price: i.unit_price,
            is_optional: Boolean(i.is_optional),
          })),
        );
      }
      return created.id as string;
    },
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Kopie erstellt");
      navigate({ to: "/dokumente/$id", params: { id: newId }, search: { bearbeiten: true } });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return { duplicate, save };
}
