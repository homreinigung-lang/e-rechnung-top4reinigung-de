import { fetchAllRows } from "@/lib/fetch-all-rows";
import { createServerFn } from "@tanstack/react-start";

export const getAccountantReceiptUrl = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; code: string; expenseId: string }) => data)
  .handler(async ({ data }): Promise<string> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyAccountantAccess } = await import("@/lib/accountant-access.server");

    const access = await verifyAccountantAccess(data.token, data.code ?? "");

    const { data: expense } = await supabaseAdmin
      .from("expenses")
      .select("receipt_url")
      .eq("id", data.expenseId)
      .eq("user_id", access.user_id)
      .maybeSingle();

    const path = expense?.receipt_url ?? "";
    if (!path) throw new Error("Zu dieser Ausgabe ist kein Beleg hinterlegt.");
    if (/^https?:/.test(path)) return path;

    const { data: signed, error } = await supabaseAdmin.storage
      .from("firmen-dateien")
      .createSignedUrl(path, 60 * 60);
    if (error || !signed?.signedUrl) throw new Error("Beleg konnte nicht geladen werden.");
    return signed.signedUrl;
  });

export type AccountantReceiptExportRow = {
  id: string;
  expense_date: string;
  supplier: string;
  category: string;
  document_number: string;
  net_amount: number;
  vat_amount: number;
  gross_amount: number;
  payment_method: string;
  receipt_url: string;
};

export const getAccountantReceiptExport = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; code: string; from: string; to: string }) => data)
  .handler(async ({ data }): Promise<AccountantReceiptExportRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyAccountantAccess } = await import("@/lib/accountant-access.server");

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(data.from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data.to) ||
      data.from > data.to
    ) {
      throw new Error("Ungültiger Belegzeitraum.");
    }

    const access = await verifyAccountantAccess(data.token, data.code ?? "");
    const expenses = await fetchAllRows(() =>
      supabaseAdmin
        .from("expenses")
        .select("*")
        .eq("user_id", access.user_id)
        .is("deleted_at", null)
        .gte("expense_date", data.from)
        .lte("expense_date", data.to)
        .order("expense_date", { ascending: true }),
    );

    const out: AccountantReceiptExportRow[] = [];
    for (const raw of expenses ?? []) {
      const e = raw as Record<string, unknown>;
      const path = String(e["receipt_url"] ?? "");
      let receiptUrl = "";
      if (path) {
        if (/^https?:/.test(path)) {
          receiptUrl = path;
        } else {
          const { data: signed, error: signedError } = await supabaseAdmin.storage
            .from("firmen-dateien")
            .createSignedUrl(path, 60 * 30);
          if (signedError || !signed?.signedUrl)
            throw new Error("Beleg konnte nicht geladen werden.");
          receiptUrl = signed.signedUrl;
        }
      }

      out.push({
        id: String(e["id"] ?? ""),
        expense_date: String(e["expense_date"] ?? ""),
        supplier: String(e["supplier"] ?? ""),
        category: String(e["category"] ?? ""),
        document_number: String(e["document_number"] ?? ""),
        net_amount: Number(e["net_amount"] ?? 0),
        vat_amount: Number(e["vat_amount"] ?? 0),
        gross_amount: Number(e["gross_amount"] ?? 0),
        payment_method: String(e["payment_method"] ?? ""),
        receipt_url: receiptUrl,
      });
    }
    return out;
  });

export const getAccountantMonthReceipts = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; code: string; month: string }) => data)
  .handler(async ({ data }): Promise<Array<{ name: string; url: string }>> => {
    if (!/^\d{4}-\d{2}$/.test(data.month)) throw new Error("Ungültiger Monat.");
    const [year, month] = data.month.split("-").map(Number);
    const from = `${data.month}-01`;
    const to = new Date(Date.UTC(year!, month!, 0)).toISOString().slice(0, 10);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyAccountantAccess } = await import("@/lib/accountant-access.server");
    const access = await verifyAccountantAccess(data.token, data.code ?? "");
    const expenses = await fetchAllRows(() =>
      supabaseAdmin
        .from("expenses")
        .select("id,expense_date,supplier,category,receipt_url")
        .eq("user_id", access.user_id)
        .is("deleted_at", null)
        .gte("expense_date", from)
        .lte("expense_date", to)
        .order("expense_date", { ascending: true }),
    );

    const out: Array<{ name: string; url: string }> = [];
    let index = 1;
    for (const e of expenses ?? []) {
      const storedPath = e.receipt_url ?? "";
      if (!storedPath) continue;
      const ext = String(storedPath).split("?")[0]?.split(".").pop()?.toLowerCase() || "pdf";
      const label = [
        String(index).padStart(2, "0"),
        e.expense_date,
        String(e.supplier || "Beleg")
          .replace(/[^\w\s-]+/g, "")
          .trim()
          .replace(/\s+/g, "-"),
        String(e.category || "").replace(/[^\w-]+/g, ""),
      ]
        .filter(Boolean)
        .join("_");
      if (/^https?:/.test(storedPath)) {
        out.push({ name: `${label}.${ext}`, url: storedPath });
      } else {
        const { data: signed, error: signedError } = await supabaseAdmin.storage
          .from("firmen-dateien")
          .createSignedUrl(storedPath, 60 * 30);
        if (signedError || !signed?.signedUrl)
          throw new Error("Beleg konnte nicht geladen werden.");
        out.push({ name: `${label}.${ext}`, url: signed.signedUrl });
      }
      index += 1;
    }
    return out;
  });
