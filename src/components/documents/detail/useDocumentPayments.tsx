import { useMutation } from "@tanstack/react-query";

import { toast } from "sonner";
import { formatDate } from "@/lib/format";

import {
  mahnLabel,
  markInvoicePaid,
  unmarkInvoicePaid,
  sendReminder,
  type ReminderKind,
} from "@/lib/workflow";

import type { useDocumentDetailForm } from "./useDocumentDetailForm";

export function useDocumentPayments(input: {
  id: ReturnType<typeof useDocumentDetailForm>["id"];
  queryClient: ReturnType<typeof useDocumentDetailForm>["queryClient"];
  setForm: ReturnType<typeof useDocumentDetailForm>["setForm"];
}) {
  const { id, queryClient, setForm } = input;
  const markPaid = useMutation({
    mutationFn: (date: string) => markInvoicePaid(id, date),
    onSuccess: (paid) => {
      setForm((f) => ({ ...f, status: "paid", paid_at: paid }));
      toast.success(`Als bezahlt markiert (${formatDate(paid)})`);
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });

  // Zahlungsstatus ist bewusst von der GoBD-Sperre ausgenommen:
  // Der Zahlungseingang ändert keinen steuerlichen Rechnungsinhalt.
  const unmarkPaid = useMutation({
    mutationFn: () => unmarkInvoicePaid(id),
    onSuccess: () => {
      setForm((f) => ({ ...f, status: "sent", paid_at: null }));
      toast.success("Zahlung zurückgenommen – Rechnung gilt wieder als offen");
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });

  const reminder = useMutation({
    mutationFn: (kind: ReminderKind) => sendReminder(id, kind),
    onSuccess: (level) => {
      toast.success(`${mahnLabel(level)} erfasst`);
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return { markPaid, reminder, unmarkPaid };
}
