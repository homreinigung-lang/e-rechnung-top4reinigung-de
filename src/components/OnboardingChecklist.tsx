import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type ChecklistItem = {
  label: string;
  done: boolean;
  href: string;
};

export function OnboardingChecklist() {
  const { data, isLoading } = useQuery({
    queryKey: ["onboarding-checklist"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return null;

      const [
        company,
        bank,
        customers,
        quotes,
        employees,
        projects,
        times,
        invoices,
      ] = await Promise.all([
        supabase
          .from("company_settings")
          .select("company_name,address_line,postal_code,city,email,phone,iban")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("bank_connections")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        supabase
          .from("customers")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .is("deleted_at", null),
        supabase
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("type", "quote")
          .is("deleted_at", null),
        supabase.from("employees").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("projects").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("time_entries").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("type", "invoice")
          .is("deleted_at", null),
      ]);

      const settings = company.data;
      const companyComplete = Boolean(
        settings?.company_name?.trim() &&
          settings.address_line?.trim() &&
          settings.postal_code?.trim() &&
          settings.city?.trim() &&
          settings.email?.trim(),
      );

      return {
        companyComplete,
        bankComplete: Boolean(settings?.iban?.trim()) || (bank.count ?? 0) > 0,
        customerComplete: (customers.count ?? 0) > 0,
        quoteComplete: (quotes.count ?? 0) > 0,
        employeeOrProjectComplete: (employees.count ?? 0) > 0 || (projects.count ?? 0) > 0,
        timeComplete: (times.count ?? 0) > 0,
        invoiceComplete: (invoices.count ?? 0) > 0,
      };
    },
  });

  if (isLoading || !data) return null;

  const items: ChecklistItem[] = [
    { label: "Firmendaten vervollständigen", done: data.companyComplete, href: "/einstellungen" },
    { label: "Bankverbindung hinterlegen", done: data.bankComplete, href: "/bankverbindung" },
    { label: "Ersten Kunden anlegen", done: data.customerComplete, href: "/kunden" },
    { label: "Erstes Angebot erstellen", done: data.quoteComplete, href: "/dokumente?tab=quote" },
    {
      label: "Ersten Mitarbeiter oder ein Objekt anlegen",
      done: data.employeeOrProjectComplete,
      href: "/team?tab=personal",
    },
    { label: "Erste Arbeitszeit erfassen", done: data.timeComplete, href: "/team?tab=zeiten" },
    {
      label: "Erste Rechnung / E-Rechnung erstellen",
      done: data.invoiceComplete,
      href: "/dokumente?tab=invoice",
    },
  ];

  const completed = items.filter((item) => item.done).length;
  if (completed === items.length) return null;

  return (
    <section className="surface p-5" aria-label="Erste Schritte">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Erste Schritte</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Die wichtigsten Punkte für einen schnellen Start.
          </p>
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          {completed}/{items.length} erledigt
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <a
            key={item.label}
            href={item.href}
            className="flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-muted"
          >
            {item.done ? (
              <CheckCircle2 className="size-4 shrink-0 text-primary" />
            ) : (
              <Circle className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className={item.done ? "text-muted-foreground line-through" : ""}>{item.label}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
