import { fetchAllRows } from "@/lib/fetch-all-rows";
import { createServerFn } from "@tanstack/react-start";

import { type AccountantDatevSettings } from "./report.functions";

export const saveAccountantDatevSettings = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      token: string;
      code: string;
      chart: string;
      datev_beraternummer: string;
      datev_mandantennummer: string;
    }) => data,
  )
  .handler(async ({ data }): Promise<AccountantDatevSettings> => {
    // Validate before any privileged database write; accept only the three visible DATEV fields.
    if (data.chart !== "SKR03" && data.chart !== "SKR04") {
      throw new Error("Bitte SKR03 oder SKR04 auswählen.");
    }
    const beraternummer = String(data.datev_beraternummer ?? "").trim();
    const mandantennummer = String(data.datev_mandantennummer ?? "").trim();
    if (!/^\d{1,7}$/.test(beraternummer) || !/^\d{1,5}$/.test(mandantennummer)) {
      throw new Error("Beraternummer (1–7 Ziffern) und Mandantennummer (1–5 Ziffern) prüfen.");
    }
    const { verifyAccountantAccess } = await import("@/lib/accountant-access.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildAutomaticExpenseMappings } = await import("@/lib/datev-account-mapping");
    const accountingDb = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
    const access = await verifyAccountantAccess(data.token, data.code ?? "");
    const { data: existing, error: readError } = await accountingDb
      .from("company_accounting_settings")
      .select("user_id,fiscal_year")
      .eq("user_id", access.user_id)
      .maybeSingle();
    if (readError) throw new Error("DATEV-Einstellungen konnten nicht geprüft werden.");

    const values: Pick<
      AccountantDatevSettings,
      "chart" | "datev_beraternummer" | "datev_mandantennummer"
    > & { chart: "SKR03" | "SKR04" } = {
      chart: data.chart,
      datev_beraternummer: beraternummer,
      datev_mandantennummer: mandantennummer,
    };

    let fiscal_year: number;
    if (existing) {
      fiscal_year = existing.fiscal_year;
      const { error } = await accountingDb
        .from("company_accounting_settings")
        .update(values)
        .eq("user_id", access.user_id);
      if (error) throw new Error("DATEV-Einstellungen konnten nicht gespeichert werden.");
    } else {
      const { data: company, error: companyError } = await supabaseAdmin
        .from("company_settings")
        .select("user_id")
        .eq("user_id", access.user_id)
        .maybeSingle();
      if (companyError || !company) throw new Error("Mandant nicht gefunden.");
      fiscal_year = new Date().getUTCFullYear();
      const { error } = await accountingDb
        .from("company_accounting_settings")
        .insert({ ...values, user_id: access.user_id, fiscal_year });
      if (error) throw new Error("DATEV-Einstellungen konnten nicht gespeichert werden.");
    }

    // Account mapping stays invisible in the portal: selecting SKR03/SKR04 creates/updates it automatically.
    const expenseCategories = await fetchAllRows(() =>
      supabaseAdmin
        .from("expenses")
        .select("id,category")
        .eq("user_id", access.user_id)
        .is("deleted_at", null),
    );

    const categories = [
      ...new Set((expenseCategories ?? []).map((row) => String(row.category ?? ""))),
    ];
    const automaticMappings = buildAutomaticExpenseMappings(categories, data.chart);
    if (categories.length > 0) {
      const { error: mappingError } = await accountingDb.from("company_account_mappings").upsert(
        categories.map((category) => ({
          user_id: access.user_id,
          mapping_key: "expense:" + category,
          chart: data.chart,
          fiscal_year,
          account_number: automaticMappings[category],
        })),
        { onConflict: "user_id,mapping_key" },
      );
      if (mappingError) throw new Error("DATEV-Kontenzuordnung konnte nicht gespeichert werden.");
    }

    return { ...values, fiscal_year };
  });

export type AccountantDatevExport = {
  filename: string;
  base64: string;
};

export const getAccountantDatevExport = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; code: string; from: string; to: string }) => data)
  .handler(async ({ data }): Promise<AccountantDatevExport> => {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(data.from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data.to) ||
      data.from > data.to
    ) {
      throw new Error("Ungültiger DATEV-Zeitraum.");
    }

    const { verifyAccountantAccess } = await import("@/lib/accountant-access.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildDatevExtf } = await import("@/lib/datev-extf");
    const { buildAutomaticExpenseMappings } = await import("@/lib/datev-account-mapping");
    const accountingDb = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
    const access = await verifyAccountantAccess(data.token, data.code ?? "");

    const { data: settings, error: settingsError } = await accountingDb
      .from("company_accounting_settings")
      .select("chart,fiscal_year,datev_beraternummer,datev_mandantennummer")
      .eq("user_id", access.user_id)
      .maybeSingle();
    if (settingsError) throw new Error("DATEV-Einstellungen konnten nicht geladen werden.");
    if (!settings || (settings.chart !== "SKR03" && settings.chart !== "SKR04")) {
      throw new Error("DATEV-Einstellungen zuerst speichern.");
    }

    const [documents, expenses, accounts, mappings] = await Promise.all([
      fetchAllRows(() =>
        supabaseAdmin
          .from("documents")
          .select(
            "id,issue_date,number,total,net_total,vat_amount,tax_mode,customer_company,customer_name,status,cancels_document_id",
          )
          .eq("user_id", access.user_id)
          .eq("type", "invoice")
          .is("deleted_at", null)
          .in("status", ["sent", "paid", "cancelled"])
          .gte("issue_date", data.from)
          .lte("issue_date", data.to)
          .order("issue_date"),
      ),
      fetchAllRows(() =>
        supabaseAdmin
          .from("expenses")
          .select(
            "id,expense_date,document_number,supplier,gross_amount,category,net_amount,vat_amount",
          )
          .eq("user_id", access.user_id)
          .is("deleted_at", null)
          .gte("expense_date", data.from)
          .lte("expense_date", data.to)
          .order("expense_date"),
      ),
      fetchAllRows(() =>
        accountingDb
          .from("accounting_chart_accounts")
          .select("id,chart,fiscal_year,account_number,category,account_name")
          .eq("chart", settings.chart)
          .eq("fiscal_year", settings.fiscal_year)
          .eq("is_active", true),
      ),
      fetchAllRows(() =>
        accountingDb
          .from("company_account_mappings")
          .select("id,mapping_key,chart,fiscal_year,account_number")
          .eq("user_id", access.user_id)
          .eq("chart", settings.chart)
          .eq("fiscal_year", settings.fiscal_year),
      ),
    ]);

    const categories = [...new Set(expenses.map((row) => String(row.category ?? "")))];
    const expenseAccounts = buildAutomaticExpenseMappings(categories, settings.chart);
    for (const mapping of mappings) {
      const key = String(mapping.mapping_key ?? "");
      if (!key.startsWith("expense:")) continue;
      const category = key.slice("expense:".length);
      if (!category) continue;
      expenseAccounts[category] = String(mapping.account_number ?? "");
    }
    const bytes = buildDatevExtf(
      documents as unknown as Parameters<typeof buildDatevExtf>[0],
      expenses as unknown as Parameters<typeof buildDatevExtf>[1],
      {
        chart: settings.chart,
        fiscalYear: settings.fiscal_year,
        beraternummer: settings.datev_beraternummer ?? "",
        mandantennummer: settings.datev_mandantennummer ?? "",
        expenseAccounts,
        from: data.from,
        to: data.to,
        accounts: accounts as unknown as Parameters<typeof buildDatevExtf>[2]["accounts"],
      },
    );

    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return {
      filename: `EXTF_Buchungsstapel_${data.from}_${data.to}.csv`,
      base64: btoa(binary),
    };
  });
