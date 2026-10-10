import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import {
  convertQuoteToOrder,
  convertQuoteToInvoice,
  convertOrderToInvoice,
  setQuoteDecision,
} from "@/lib/workflow";

import { ensureCustomerForAcceptedQuote } from "@/lib/prospect-customer";

import type { useDocumentDetailForm } from "./useDocumentDetailForm";
import type { useDocumentDetailPersistence } from "./useDocumentDetailPersistence";

export function useDocumentDetailWorkflow(input: {
  data: ReturnType<typeof useDocumentDetailForm>["data"];
  form: ReturnType<typeof useDocumentDetailForm>["form"];
  id: ReturnType<typeof useDocumentDetailForm>["id"];
  navigate: ReturnType<typeof useDocumentDetailForm>["navigate"];
  queryClient: ReturnType<typeof useDocumentDetailForm>["queryClient"];
  save: ReturnType<typeof useDocumentDetailPersistence>["save"];
  setForm: ReturnType<typeof useDocumentDetailForm>["setForm"];
}) {
  const { data, form, id, navigate, queryClient, save, setForm } = input;
  const decide = useMutation({
    mutationFn: async (decision: "accepted" | "declined") => {
      await save.mutateAsync();
      const converted =
        decision === "accepted" && !form["customer_id"]
          ? await ensureCustomerForAcceptedQuote(id)
          : null;
      await setQuoteDecision(id, decision);
      return { decision, converted };
    },
    onSuccess: ({ decision, converted }) => {
      // Lokalen Status und ggf. neu verknüpften Kunden mitziehen, damit Autosave
      // nicht wieder den Interessenten-Zustand überschreibt.
      setForm((f) => ({
        ...f,
        status: decision,
        ...(converted ? { customer_id: converted.customerId } : {}),
      }));
      toast.success(
        converted?.created
          ? "Angebot angenommen – Interessent wurde als Kunde angelegt."
          : converted
            ? "Angebot angenommen – mit vorhandenem Kunden verknüpft."
            : "Angebotsstatus aktualisiert",
      );
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const preparePlanning = useMutation({
    mutationFn: async () => {
      if (String(form["status"] ?? "") !== "accepted") {
        throw new Error("Bitte das Angebot zuerst als angenommen markieren.");
      }

      const hours = Number(form["planned_hours_month"] ?? 0);
      const visits = Number(form["planned_visits_month"] ?? 0);
      if (!(hours > 0) || !(visits > 0)) {
        throw new Error(
          "In diesem Angebot fehlen Soll-Stunden oder Einsätze pro Monat. Bitte eine neue Kalkulation übernehmen oder die Planung manuell im Dienstplan anlegen.",
        );
      }

      let customerId = String(form["customer_id"] ?? "").trim();
      if (!customerId) {
        const linked = await ensureCustomerForAcceptedQuote(id);
        customerId = linked?.customerId ?? "";
      }
      if (!customerId) throw new Error("Kein Kunde mit dem angenommenen Angebot verknüpft.");

      let projectId = String(form["project_id"] ?? "").trim();
      let created = false;

      if (!projectId) {
        const { data: customer, error: customerError } = await supabase
          .from("customers")
          .select(
            "id,name,company,email,phone,service_address_line,service_postal_code,service_city,address_line,postal_code,city",
          )
          .eq("id", customerId)
          .single();
        if (customerError) throw customerError;

        const { data: auth } = await supabase.auth.getUser();
        const userId = auth.user?.id;
        if (!userId) throw new Error("Nicht angemeldet");

        const objectName = `${customer.company || customer.name || "Kunde"} – Objekt`;
        const addressLine = customer.service_address_line || customer.address_line || "";
        const postalCode = customer.service_postal_code || customer.postal_code || "";
        const city = customer.service_city || customer.city || "";

        const { data: project, error: projectError } = await supabase
          .from("projects")
          .insert({
            user_id: userId,
            name: objectName,
            mode: "floorplan",
            customer_id: customer.id,
            customer_name: customer.company || customer.name || "",
            contact_email: customer.email || "",
            contact_phone: customer.phone || "",
            address_line: addressLine,
            postal_code: postalCode,
            city,
          })
          .select("id")
          .single();
        if (projectError) throw projectError;

        projectId = project.id;
        created = true;

        const { error: linkError } = await supabase
          .from("documents")
          .update({ project_id: projectId } as never)
          .eq("id", id);
        if (linkError) throw linkError;
      }

      return { projectId, hours, visits, created };
    },
    onSuccess: ({ projectId, hours, visits, created }) => {
      setForm((current) => ({ ...current, project_id: projectId }));
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      if (created) toast.success("Objekt angelegt – Einsatzplanung wird vorbereitet.");
      navigate({
        to: "/team",
        search: {
          tab: "dienstplan",
          projekt: projectId,
          stunden: hours,
          einsaetze: visits,
        },
      });
    },
    onError: (e: Error) => toast.error(e.message, { duration: 9000 }),
  });

  const convert = useMutation({
    mutationFn: (): Promise<string> =>
      data?.doc.type === "order" ? convertOrderToInvoice(id) : convertQuoteToOrder(id),
    onSuccess: (newId: string) => {
      toast.success(
        data?.doc.type === "order"
          ? "Rechnung aus Auftragsbestätigung erstellt"
          : "Auftragsbestätigung aus Angebot erstellt",
      );
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      navigate({ to: "/dokumente/$id", params: { id: newId }, search: { bearbeiten: true } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Angebot direkt abrechnen (einmalige Dienstleistung, ohne Auftragsbestätigung).
  const quoteToInvoice = useMutation({
    mutationFn: (): Promise<string> => convertQuoteToInvoice(id),
    onSuccess: (newId: string) => {
      toast.success("Rechnung aus Angebot erstellt");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      navigate({ to: "/dokumente/$id", params: { id: newId }, search: { bearbeiten: true } });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return { convert, decide, preparePlanning, quoteToInvoice };
}
