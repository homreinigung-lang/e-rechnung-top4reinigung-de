import { supabase } from "@/integrations/supabase/client";
import { FILES_BUCKET } from "@/lib/storage";
import { formatDate, formatMoney } from "@/lib/format";
import { buildXRechnungXml } from "@/lib/erechnung";

/** SHA-256-Prüfsumme (Hex) der archivierten PDF-Datei – GoBD: Revisionssicherheit. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.slice().buffer as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error("Nicht angemeldet");
  return uid;
}

/** Schreibt einen Eintrag in das unveränderbare Prüfprotokoll. */
export async function logAudit(
  action: string,
  doc: { id?: string | null; number?: string | null },
  details: Record<string, unknown> = {},
) {
  const userId = await currentUserId();
  await supabase.from("document_audit_log").insert({
    user_id: userId,
    document_id: doc.id ?? null,
    document_number: doc.number ?? "",
    action,
    details: details as never,
  });
}

/** Beleg festschreiben: vergibt eine lückenlose Nummer und sperrt den Beleg dauerhaft. */
export async function finalizeDocument(id: string) {
  const { data, error } = await supabase.rpc("finalize_document", { _id: id });
  if (error) throw error;
  return data as unknown as { id: string; number: string };
}

/** Erstellt eine Stornorechnung mit eigener fortlaufender Nummer und Stornogrund. */
export async function createStorno(id: string, reason: string): Promise<string> {
  const grund = reason.trim();
  if (grund.length < 3) throw new Error("Bitte geben Sie einen Stornogrund an.");
  const { data, error } = await supabase.rpc("create_storno", {
    _id: id,
    _reason: grund,
  } as never);
  if (error) throw error;
  return data as unknown as string;
}

/** Archiviert das finale PDF revisionssicher im privaten Speicher inkl. Prüfsumme. */
export async function archiveDocumentPdf(
  doc: { id: string; number: string },
  bytes: Uint8Array,
): Promise<{ path: string; hash: string }> {
  const userId = await currentUserId();
  const hash = await sha256Hex(bytes);
  const path = `${userId}/gobd/${doc.number.replace(/[^\w.-]+/g, "_")}.pdf`;
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" });

  const { error } = await supabase.storage
    .from(FILES_BUCKET)
    .upload(path, blob, { upsert: true, contentType: "application/pdf" });
  if (error) throw error;

  const { error: updateError } = await supabase
    .from("documents")
    .update({ pdf_path: path, pdf_sha256: hash, archived_at: new Date().toISOString() } as never)
    .eq("id", doc.id);
  if (updateError) throw updateError;

  await logAudit("archived", doc, { path, sha256: hash, bytes: bytes.length });
  return { path, hash };
}

type Row = Record<string, string>;

function csv(rows: Row[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(";"), ...rows.map((r) => headers.map((h) => esc(r[h])).join(";"))].join(
    "\r\n",
  );
}

function de(v: unknown) {
  return (Number(v ?? 0) || 0).toFixed(2).replace(".", ",");
}

/**
 * GoBD-/Prüfexport: alle Belege eines Zeitraums als CSV (Belege, Positionen,
 * Prüfprotokoll) plus die archivierten PDF-Dateien in einem ZIP-Archiv.
 */
export async function buildGobdExport(from: string, to: string): Promise<Blob> {
  const [{ default: JSZip }] = await Promise.all([import("jszip")]);

  const [docsRes, auditRes] = await Promise.all([
    supabase
      .from("documents")
      .select("*")
      .gte("issue_date", from)
      .lte("issue_date", to)
      .order("number"),
    supabase
      .from("document_audit_log")
      .select("*")
      .gte("created_at", `${from}T00:00:00Z`)
      .lte("created_at", `${to}T23:59:59Z`)
      .order("created_at"),
  ]);
  if (docsRes.error) throw docsRes.error;
  if (auditRes.error) throw auditRes.error;

  const documents = docsRes.data ?? [];
  if (documents.length === 0) throw new Error("Keine Belege im gewählten Zeitraum.");

  const ids = documents.map((d) => d.id);
  const { data: itemsData } = await supabase
    .from("document_items")
    .select("*")
    .in("document_id", ids)
    .order("position");

  const byId = new Map(documents.map((d) => [d.id, d]));

  const docRows: Row[] = documents.map((d) => {
    const r = d as unknown as Record<string, unknown>;
    return {
      Belegart: d.type === "invoice" ? (r["is_storno"] ? "Stornorechnung" : "Rechnung") : "Angebot",
      Belegnummer: d.number,
      Belegdatum: formatDate(d.issue_date),
      Faelligkeit: formatDate(d.due_date),
      Leistungszeitraum: String(r["service_period"] ?? ""),
      Kunde: d.customer_company || d.customer_name,
      "USt-IdNr": String(r["customer_vat_id"] ?? ""),
      Bestellnummer: String(r["order_number"] ?? ""),
      Steuerart: r["tax_mode"] === "domestic" ? "19% Inland" : "Reverse-Charge § 13b UStG",
      Netto: de(r["net_total"] ?? d.total),
      Umsatzsteuer: de(r["vat_amount"]),
      Brutto: de(d.total),
      Status: String(d.status),
      Festgeschrieben: r["locked_at"] ? formatDate(String(r["locked_at"])) : "nein",
      "Storniert durch": r["cancelled_by_document_id"]
        ? (byId.get(String(r["cancelled_by_document_id"]))?.number ?? "")
        : "",
      "Storno zu": r["cancels_document_id"]
        ? (byId.get(String(r["cancels_document_id"]))?.number ?? "")
        : "",
      "PDF-Datei": r["pdf_path"] ? `pdf/${d.number}.pdf` : "",
      "SHA-256": String(r["pdf_sha256"] ?? ""),
      Erstellt: new Date(d.created_at).toISOString(),
    };
  });

  const itemRows: Row[] = (itemsData ?? []).map((i) => ({
    Belegnummer: byId.get(i.document_id)?.number ?? "",
    Position: String(i.position),
    Bezeichnung: i.description,
    Menge: de(i.quantity),
    Einheit: i.unit,
    Einzelpreis: de(i.unit_price),
    Gesamtpreis: de(Number(i.quantity) * Number(i.unit_price)),
  }));

  const auditRows: Row[] = (auditRes.data ?? []).map((a) => ({
    Zeitstempel: new Date(a.created_at).toISOString(),
    Belegnummer: a.document_number,
    Vorgang: a.action,
    Details: JSON.stringify(a.details),
  }));

  const zip = new JSZip();
  zip.file("belege.csv", "\uFEFF" + csv(docRows));
  zip.file("positionen.csv", "\uFEFF" + csv(itemRows));
  zip.file("pruefprotokoll.csv", "\uFEFF" + csv(auditRows));

  const totals = documents.reduce(
    (acc, d) => {
      const r = d as unknown as Record<string, unknown>;
      if (d.type !== "invoice") return acc;
      acc.net += Number(r["net_total"] ?? d.total) || 0;
      acc.vat += Number(r["vat_amount"]) || 0;
      acc.gross += Number(d.total) || 0;
      return acc;
    },
    { net: 0, vat: 0, gross: 0 },
  );

  zip.file(
    "index.txt",
    [
      "GoBD-Prüfexport",
      `Zeitraum: ${formatDate(from)} – ${formatDate(to)}`,
      `Erstellt am: ${new Date().toLocaleString("de-DE-u-ca-gregory-nu-latn")}`,
      `Belege gesamt: ${documents.length}`,
      `Summe netto: ${formatMoney(totals.net)}`,
      `Summe Umsatzsteuer: ${formatMoney(totals.vat)}`,
      `Summe brutto: ${formatMoney(totals.gross)}`,
      "",
      "Inhalt:",
      "- belege.csv          Belegdaten inkl. Festschreibung und Prüfsummen",
      "- positionen.csv      Einzelpositionen je Beleg",
      "- pruefprotokoll.csv  Unveränderbares Audit-Log (GoBD)",
      "- pdf/                Archivierte Original-PDF-Dateien",
      "- xrechnung/          XRechnung-XML je Rechnung (EN 16931 / UBL)",
    ].join("\r\n"),
  );

  const pdfFolder = zip.folder("pdf");
  for (const d of documents) {
    const path = String((d as unknown as Record<string, unknown>)["pdf_path"] ?? "");
    if (!path || !pdfFolder) continue;
    const { data: file } = await supabase.storage.from(FILES_BUCKET).download(path);
    if (file) pdfFolder.file(`${d.number}.pdf`, await file.arrayBuffer());
  }

  // E-Rechnung: für jede Rechnung zusätzlich die XRechnung-XML (EN 16931) beilegen.
  const { data: settings } = await supabase.from("company_settings").select("*").maybeSingle();
  const xmlFolder = zip.folder("xrechnung");
  const itemsByDoc = new Map<string, typeof itemsData>();
  for (const i of itemsData ?? []) {
    const list = itemsByDoc.get(i.document_id) ?? [];
    list.push(i);
    itemsByDoc.set(i.document_id, list);
  }
  for (const d of documents) {
    if (d.type !== "invoice" || !xmlFolder) continue;
    const r = d as unknown as Record<string, unknown>;
    const docItems = (itemsByDoc.get(d.id) ?? []).map((i) => ({
      position: i.position,
      description: i.description,
      quantity: Number(i.quantity),
      unit: i.unit,
      unit_price: Number(i.unit_price),
    }));
    const xml = buildXRechnungXml({
      doc: r,
      items: docItems,
      settings: settings as Record<string, unknown> | null,
      netTotal: Number(r["net_total"] ?? d.total) || 0,
      vatAmount: Number(r["vat_amount"]) || 0,
      grossTotal: Number(d.total) || 0,
      vatRate: Number(r["vat_rate"]) || 0,
      number: d.number,
    });
    xmlFolder.file(`${d.number}.xml`, "\uFEFF" + xml);
  }

  await logAudit("gobd_export", { number: `${from}_${to}` }, { from, to, count: documents.length });

  return zip.generateAsync({ type: "blob" });
}

export async function downloadBlob(blob: Blob, filename: string) {
  const { saveFile } = await import("@/lib/download");
  return saveFile(blob, filename);
}
