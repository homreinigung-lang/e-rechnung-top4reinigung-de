import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  api,
  getToken,
  hasGocardlessCredentials,
  normalizeTransaction,
  type Institution,
  type RawTransaction,
} from "@/lib/gocardless.server";
import { matchTransactions, type MatchDoc, type MatchTx } from "@/lib/bank-match";

/** Prüft, ob die Bank-Schnittstelle einsatzbereit ist. */
export const getBankStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({ configured: hasGocardlessCredentials() }));

/** Liste aller verfügbaren Banken eines Landes (Standard: Deutschland). */
export const listInstitutions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { country?: string }) => ({
    country: (data?.country ?? "DE").toUpperCase(),
  }))
  .handler(async ({ data }) => {
    const token = await getToken();
    const list = await api<Institution[]>(
      token,
      `/institutions/?country=${encodeURIComponent(data.country)}`,
    );
    return list
      .map((i) => ({ id: i.id, name: i.name, bic: i.bic ?? "", logo: i.logo ?? "" }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  });

/** Startet die Bank-Anbindung und liefert den Link zur Bank-Anmeldung. */
export const startBankLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { institutionId: string; institutionName: string; redirectUrl: string }) => {
    if (!data?.institutionId) throw new Error("Bitte eine Bank auswählen.");
    if (!data?.redirectUrl) throw new Error("Rücksprung-Adresse fehlt.");
    return {
      institutionId: data.institutionId,
      institutionName: data.institutionName ?? "",
      redirectUrl: data.redirectUrl,
    };
  })
  .handler(async ({ data, context }) => {
    const token = await getToken();

    const agreement = await api<{ id: string }>(token, "/agreements/enduser/", {
      method: "POST",
      body: JSON.stringify({
        institution_id: data.institutionId,
        max_historical_days: 90,
        access_valid_for_days: 180,
        access_scope: ["balances", "details", "transactions"],
      }),
    });

    const requisition = await api<{ id: string; link: string }>(token, "/requisitions/", {
      method: "POST",
      body: JSON.stringify({
        redirect: data.redirectUrl,
        institution_id: data.institutionId,
        agreement: agreement.id,
        user_language: "DE",
      }),
    });

    const { error } = await context.supabase.from("bank_connections").insert({
      user_id: context.userId,
      provider: "gocardless",
      institution_id: data.institutionId,
      institution_name: data.institutionName,
      requisition_id: requisition.id,
      agreement_id: agreement.id,
      account_ids: [],
      status: "pending",
    });
    if (error) throw new Error(error.message);

    return { link: requisition.link, requisitionId: requisition.id };
  });

/** Schließt die Anbindung nach Rückkehr von der Bank ab (Konten übernehmen). */
export const finishBankLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { requisitionId: string }) => {
    if (!data?.requisitionId) throw new Error("Referenz fehlt.");
    return { requisitionId: data.requisitionId };
  })
  .handler(async ({ data, context }) => {
    const token = await getToken();
    const req = await api<{ id: string; status: string; accounts: string[] }>(
      token,
      `/requisitions/${data.requisitionId}/`,
    );

    const { error } = await context.supabase
      .from("bank_connections")
      .update({
        account_ids: req.accounts ?? [],
        status: (req.accounts?.length ?? 0) > 0 ? "linked" : req.status.toLowerCase(),
      })
      .eq("requisition_id", data.requisitionId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);

    return { accounts: req.accounts ?? [], status: req.status };
  });

/** Verbindung entfernen. */
export const removeBankConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => ({ id: data.id }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("bank_connections")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Holt Umsätze aller verbundenen Konten und ordnet sie offenen Rechnungen zu. */
export const syncBankTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: connections, error: connError } = await context.supabase
      .from("bank_connections")
      .select("*")
      .eq("user_id", context.userId);
    if (connError) throw new Error(connError.message);
    if (!connections || connections.length === 0) {
      throw new Error("Keine Bankverbindung vorhanden.");
    }

    const token = await getToken();
    let imported = 0;

    for (const conn of connections) {
      for (const accountId of conn.account_ids ?? []) {
        const res = await api<{ transactions?: { booked?: RawTransaction[] } }>(
          token,
          `/accounts/${accountId}/transactions/`,
        );
        const rows = (res.transactions?.booked ?? [])
          .map((t) => normalizeTransaction(t, accountId))
          .filter((t): t is NonNullable<typeof t> => Boolean(t))
          .map((t) => ({
            user_id: context.userId,
            connection_id: conn.id,
            account_id: accountId,
            external_id: t.external_id,
            booking_date: t.booking_date,
            amount: t.amount,
            currency: t.currency,
            counterparty_name: t.counterparty_name,
            remittance_info: t.remittance_info,
            raw: t.raw as never,
          }));
        if (rows.length === 0) continue;
        const { error } = await context.supabase
          .from("bank_transactions")
          .upsert(rows, { onConflict: "user_id,external_id", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
        imported += rows.length;
      }
      await context.supabase
        .from("bank_connections")
        .update({ last_sync_at: new Date().toISOString(), status: "linked" })
        .eq("id", conn.id);
    }

    const { data: txs } = await context.supabase
      .from("bank_transactions")
      .select("id, amount, booking_date, counterparty_name, remittance_info")
      .eq("user_id", context.userId)
      .is("matched_document_id", null)
      .eq("ignored", false);

    const { data: docs } = await context.supabase
      .from("documents")
      .select("id, number, total, customer_name, customer_company, issue_date")
      .eq("user_id", context.userId)
      .eq("type", "invoice")
      .eq("status", "sent");

    const matches = matchTransactions(
      (txs ?? []) as MatchTx[],
      (docs ?? []) as MatchDoc[],
    );

    for (const m of matches) {
      await context.supabase
        .from("bank_transactions")
        .update({
          matched_document_id: m.documentId,
          matched_at: new Date().toISOString(),
          match_score: m.score,
        })
        .eq("id", m.transactionId)
        .eq("user_id", context.userId);
    }

    return { imported, matched: matches.length };
  });

/** Zahlung bestätigen: Umsatz einer Rechnung zuordnen und diese als bezahlt markieren. */
export const confirmBankMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { transactionId: string; documentId: string; bookingDate: string }) => data)
  .handler(async ({ data, context }) => {
    const { error: txError } = await context.supabase
      .from("bank_transactions")
      .update({
        matched_document_id: data.documentId,
        matched_at: new Date().toISOString(),
      })
      .eq("id", data.transactionId)
      .eq("user_id", context.userId);
    if (txError) throw new Error(txError.message);

    const { error: docError } = await context.supabase
      .from("documents")
      .update({ status: "paid", paid_at: data.bookingDate })
      .eq("id", data.documentId)
      .eq("user_id", context.userId);
    if (docError) throw new Error(docError.message);

    return { ok: true };
  });

/** Umsatz ignorieren (z. B. private Buchung). */
export const ignoreBankTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; ignored: boolean }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("bank_transactions")
      .update({ ignored: data.ignored })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
