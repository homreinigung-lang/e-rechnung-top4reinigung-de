import { supabase } from "@/integrations/supabase/client";
import { FILES_BUCKET } from "@/lib/storage";
import { formatDate, formatMoney } from "@/lib/format";
import { buildXRechnungXml } from "@/lib/erechnung";

/** SHA-256-Prüfsumme der unveränderten PDF-Bytes. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const uid = data.user?.id;
  if (!uid) throw new Error("Nicht angemeldet");
  return uid;
}

/** Fehlgeschlagene Audit-Einträge dürfen nicht als Erfolg behandelt werden. */
export async function logAudit(
  action: string,
  doc: { id?: string | null; number?: string | null },
  details: Record<string, unknown> = {},
) {
  const userId = await currentUserId();
  const { error } = await supabase.from("document_audit_log").insert({
    user_id: userId,
    document_id: doc.id ?? null,
    document_number: doc.number ?? "",
    action,
    details: details as never,
  });
  if (error) throw error;
}

/** Vergibt eine fortlaufende Nummer und sperrt den Beleg. */
export async function finalizeDocument(id: string) {
  const { data, error } = await supabase.rpc("finalize_document", { _id: id });
  if (error) throw error;
  return data as unknown as { id: string; number: string };
}

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

/** Verifies the actual stored bytes; a database path or hash alone is not proof of an archive. */
async function verifiedStoredPdf(path: string, expectedHash?: string): Promise<{ bytes: Uint8Array; hash: string }> {
  const { data, error } = await supabase.storage.from(FILES_BUCKET).download(path);
  if (error || !data) throw new Error(`GoBD: PDF im Archiv nicht abrufbar (${path}): ${error?.message ?? "Datei fehlt"}`);
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.length < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
    throw new Error(`GoBD: Archivdatei ist keine gültig erkennbare PDF-Datei (${path}).`);
  }
  const hash = await sha256Hex(bytes);
  if (expectedHash && expectedHash.toLowerCase() !== hash) {
    throw new Error(`GoBD: PDF-Prüfsumme stimmt nicht überein (${path}). Keine Datei wurde überschrieben.`);
  }
  return { bytes, hash };
}

/**
 * Archives exactly the provided invoice bytes without overwriting an existing PDF.
 * Checks the stored bytes before recording path/hash and the actual archive time.
 */
export async function archiveDocumentPdf(
  doc: { id: string; number: string },
  bytes: Uint8Array,
): Promise<{ path: string; hash: string }> {
  const userId = await currentUserId();
  const { data: record, error: readError } = await supabase
    .from("documents")
    .select("id,number,pdf_path,pdf_sha256,archived_at")
    .eq("id", doc.id)
    .single();
  if (readError || !record) throw readError ?? new Error("GoBD: Beleg nicht gefunden.");
  if (record.number !== doc.number) throw new Error("GoBD: Belegnummer hat sich geändert. Archivierung abgebrochen.");

  const hash = await sha256Hex(bytes);
  const path = record.pdf_path?.trim() || `${userId}/gobd/${doc.number.replace(/[^\w.-]+/g, "_")}.pdf`;
  if (!path.startsWith(`${userId}/`)) throw new Error("GoBD: Archivpfad gehört nicht zum angemeldeten Nutzer.");
  if (record.pdf_sha256 && record.pdf_sha256.toLowerCase() !== hash) {
    throw new Error("GoBD: Der Beleg hat bereits eine andere archivierte PDF-Prüfsumme. Kein Überschreiben.");
  }

  const slash = path.lastIndexOf("/");
  const folder = path.slice(0, slash);
  const name = path.slice(slash + 1);
  const { data: existingFiles, error: listError } = await supabase.storage
    .from(FILES_BUCKET)
    .list(folder, { search: name, limit: 100 });
  if (listError) throw listError;
  const exists = (existingFiles ?? []).some((entry) => entry.name === name);
  if (exists) {
    const stored = await verifiedStoredPdf(path, hash);
    if (stored.bytes.length !== bytes.length) throw new Error("GoBD: Archivdatei hat eine andere Größe.");
  } else {
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" });
    const { error: uploadError } = await supabase.storage
      .from(FILES_BUCKET)
      .upload(path, blob, { upsert: false, contentType: "application/pdf" });
    if (uploadError) {
      // Another request may have archived concurrently: accept only identical stored bytes.
      try { await verifiedStoredPdf(path, hash); }
      catch { throw uploadError; }
    }
    const stored = await verifiedStoredPdf(path, hash);
    if (stored.bytes.length !== bytes.length) throw new Error("GoBD: Archivdatei hat eine andere Größe.");
  }

  const { data: updated, error: updateError } = await supabase
    .from("documents")
    .update({
      pdf_path: path,
      pdf_sha256: hash,
      archived_at: record.archived_at || new Date().toISOString(),
    } as never)
    .eq("id", doc.id)
    .eq("number", doc.number)
    .select("id")
    .single();
  if (updateError || !updated) throw updateError ?? new Error("GoBD: Archivverknüpfung fehlgeschlagen.");

  await logAudit("archived", doc, { path, sha256: hash, bytes: bytes.length, already_present: exists });
  return { path, hash };
}

type Row = Record<string, string>;

function csv(rows: Row[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(";"), ...rows.map((r) => headers.map((h) => esc(r[h])).join(";"))].join("\r\n");
}

function de(v: unknown) {
  return (Number(v ?? 0) || 0).toFixed(2).replace(".", ",");
}

/** Export fails visibly if a finalized invoice is missing its verified original PDF. */
export async function buildGobdExport(from: string, to: string): Promise<Blob> {
  const [{ default: JSZip }] = await Promise.all([import("jszip")]);
  const [docsRes, auditRes] = await Promise.all([
    supabase.from("documents").select("*").gte("issue_date", from).lte("issue_date", to).order("number"),
    supabase.from("document_audit_log").select("*")
      .gte("created_at", `${from}T00:00:00Z`).lte("created_at", `${to}T23:59:59Z`).order("created_at"),
  ]);
  if (docsRes.error) throw docsRes.error;
  if (auditRes.error) throw auditRes.error;
  const documents = docsRes.data ?? [];
  if (documents.length === 0) throw new Error("Keine Belege im gewählten Zeitraum.");

  const ids = documents.map((d) => d.id);
  const { data: itemsData, error: itemsError } = await supabase
    .from("document_items").select("*").in("document_id", ids).order("position");
  if (itemsError) throw itemsError;
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
        ? (byId.get(String(r["cancelled_by_document_id"]))?.number ?? "") : "",
      "Storno zu": r["cancels_document_id"]
        ? (byId.get(String(r["cancels_document_id"]))?.number ?? "") : "",
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

  const totals = documents.reduce((acc, d) => {
    const r = d as unknown as Record<string, unknown>;
    if (d.type !== "invoice") return acc;
    acc.net += Number(r["net_total"] ?? d.total) || 0;
    acc.vat += Number(r["vat_amount"]) || 0;
    acc.gross += Number(d.total) || 0;
    return acc;
  }, { net: 0, vat: 0, gross: 0 });

  zip.file("index.txt", [
    "GoBD-Prüfexport",
    `Zeitraum: ${formatDate(from)} – ${formatDate(to)}`,
    `Erstellt am: ${new Date().toLocaleString("de-DE-u-ca-gregory-nu-latn")}`,
    `Belege gesamt: ${documents.length}`,
    `Summe netto: ${formatMoney(totals.net)}`,
    `Summe Umsatzsteuer: ${formatMoney(totals.vat)}`,
    `Summe brutto: ${formatMoney(totals.gross)}`,
    "", "Inhalt:",
    "- belege.csv          Belegdaten inkl. Festschreibung und Prüfsummen",
    "- positionen.csv      Einzelpositionen je Beleg",
    "- pruefprotokoll.csv  Unveränderbares Audit-Log (GoBD)",
    "- pdf/                Archivierte Original-PDF-Dateien",
    "- xrechnung/          XRechnung-XML je Rechnung (EN 16931 / UBL)",
  ].join("\r\n"));

  const pdfFolder = zip.folder("pdf");
  for (const d of documents) {
    const r = d as unknown as Record<string, unknown>;
    const path = String(r["pdf_path"] ?? "").trim();
    const hash = String(r["pdf_sha256"] ?? "").trim();
    const finalizedInvoice = d.type === "invoice" && (Boolean(r["locked_at"]) || d.status !== "draft");
    if (finalizedInvoice && (!path || !hash || !r["archived_at"])) {
      throw new Error(`GoBD-Export abgebrochen: Archivangaben für Rechnung ${d.number} fehlen. Original-PDF zuerst prüfen und nacharchivieren.`);
    }
    if (!path) continue;
    if (!pdfFolder) throw new Error("GoBD: PDF-Ordner konnte nicht erstellt werden.");
    const stored = await verifiedStoredPdf(path, hash || undefined);
    if (finalizedInvoice && !hash) throw new Error(`GoBD: Prüfsumme für ${d.number} fehlt.`);
    pdfFolder.file(`${d.number}.pdf`, stored.bytes);
  }

  const { data: settings, error: settingsError } = await supabase
    .from("company_settings").select("*").maybeSingle();
  if (settingsError) throw settingsError;
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
