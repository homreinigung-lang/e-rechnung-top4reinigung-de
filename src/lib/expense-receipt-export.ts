import JSZip from "jszip";

export type ExpenseReceiptExportRow = {
  id?: string;
  expense_date?: string | null;
  supplier?: string | null;
  category?: string | null;
  document_number?: string | null;
  net_amount?: number | string | null;
  vat_amount?: number | string | null;
  gross_amount?: number | string | null;
  payment_method?: string | null;
  receipt_url?: string | null;
  receipt_name?: string | null;
};

function xmlEscape(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safePart(value: unknown, fallback = "Beleg") {
  const cleaned = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/[^\p{L}\p{N}._ -]+/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return cleaned || fallback;
}

function extensionFromPath(path: string | null | undefined) {
  const clean = String(path ?? "").split("?")[0] ?? "";
  const match = clean.match(/\.([a-z0-9]{1,8})$/i);
  return match?.[1]?.toLowerCase() || "pdf";
}

export function expenseReceiptFilename(
  row: ExpenseReceiptExportRow,
  index: number,
  used = new Set<string>(),
) {
  if (!row.receipt_url) return "";
  const ext = extensionFromPath(row.receipt_url);
  const date = safePart(row.expense_date || "ohne-datum", "ohne-datum");
  const supplier = safePart(row.supplier, "Beleg");
  const amount = Number(row.gross_amount ?? 0).toFixed(2).replace(".", ",");
  const base = `${date}_${supplier}_${amount}EUR`;
  let name = `${base}.${ext}`;
  let suffix = 2;
  while (used.has(name.toLowerCase())) {
    name = `${base}_${suffix}.${ext}`;
    suffix += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

function columnName(index: number) {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

function worksheetXml(rows: Array<Array<string | number>>) {
  const sheetRows = rows
    .map((row, rIndex) => {
      const cells = row
        .map((value, cIndex) => {
          const ref = `${columnName(cIndex)}${rIndex + 1}`;
          if (typeof value === "number" && Number.isFinite(value)) {
            return `<c r="${ref}"><v>${value}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rIndex + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRows}</sheetData>
</worksheet>`;
}

export async function buildExpenseOverviewXlsx(
  expenses: ExpenseReceiptExportRow[],
  receiptNames: Map<number, string>,
) {
  const rows: Array<Array<string | number>> = [
    [
      "Datum",
      "Lieferant / Empfänger",
      "Kategorie",
      "Belegnummer",
      "Netto",
      "MwSt.",
      "Brutto",
      "Zahlungsart",
      "Belegstatus",
      "Dateiname",
    ],
    ...expenses.map((row, index) => [
      String(row.expense_date ?? ""),
      String(row.supplier ?? ""),
      String(row.category ?? ""),
      String(row.document_number ?? ""),
      Number(row.net_amount ?? 0),
      Number(row.vat_amount ?? 0),
      Number(row.gross_amount ?? 0),
      String(row.payment_method ?? ""),
      row.receipt_url ? "Beleg vorhanden" : "Beleg fehlt",
      receiptNames.get(index) ?? "",
    ]),
  ];

  const xlsx = new JSZip();
  xlsx.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
  );
  xlsx.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  );
  xlsx.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Ausgabenübersicht" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
  );
  xlsx.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
  );
  xlsx.file("xl/worksheets/sheet1.xml", worksheetXml(rows));
  return xlsx.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export async function buildExpenseReceiptZip(options: {
  expenses: ExpenseReceiptExportRow[];
  loadReceipt: (row: ExpenseReceiptExportRow) => Promise<Blob>;
}) {
  const zip = new JSZip();
  const used = new Set<string>();
  const names = new Map<number, string>();
  let receiptCount = 0;

  for (let index = 0; index < options.expenses.length; index += 1) {
    const row = options.expenses[index]!;
    if (!row.receipt_url) continue;
    const name = row.receipt_name || expenseReceiptFilename(row, index, used);
    names.set(index, name);
    try {
      zip.file(name, await options.loadReceipt(row));
      receiptCount += 1;
    } catch {
      names.set(index, `${name} (Download fehlgeschlagen)`);
    }
  }

  zip.file("Ausgabenübersicht.xlsx", await buildExpenseOverviewXlsx(options.expenses, names));
  const blob = await zip.generateAsync({ type: "blob" });
  return {
    blob,
    receiptCount,
    expenseCount: options.expenses.length,
    missingCount: options.expenses.filter((row) => !row.receipt_url).length,
  };
}
