import {
  cleanItems,
  extractDocument,
  fileToBase64,
  itemsFromRows,
  itemsFromText,
} from "@/lib/lv-form/import";
import {
  analyseLvDocument,
  analyseLvScan,
  type LvAnalyseResponse,
} from "@/lib/lv-analyse.functions";
import { classifyDocument, isGaebFile, isSupportedFile, shouldParseAsGaeb } from "./classify";
import { parseGaeb } from "./gaeb";
import {
  dedupeItems,
  extractTotals,
  normalizeItem,
  pageIndexForText,
  toNumberOrNull,
} from "./normalize";
import { newAnalysisId, stampAnalysis } from "./calculation";
import { validateItems } from "./validate";
import type { LvAnalysisResult, LvNormalizedItem, LvProcessStep, LvTotalLine } from "./types";

type ServerCaller<TIn, TOut> = (args: { data: TIn }) => Promise<TOut>;

export type ReadDocument = (file: File) => Promise<{
  text: string;
  rows: string[][];
  hasTextLayer: boolean;
  pageCount?: number;
}>;

export type AnalyseDeps = {
  /** Ersetzbarer Datei-Leser (Tests / alternative Parser). */
  readDocument?: ReadDocument;
  analyseText?: ServerCaller<{ text: string }, LvAnalyseResponse>;
  analyseScan?: ServerCaller<
    { fileName: string; mimeType: string; base64: string },
    LvAnalyseResponse
  >;
  onStep?: (step: LvProcessStep) => void;
};

/**
 * Vollständiger Verarbeitungsweg: Datei lesen → Typ erkennen → Positionen extrahieren →
 * normalisieren → prüfen. Liefert immer ein Ergebnis mit Status und Handlungsempfehlung.
 */
export async function analyseLvFile(file: File, deps: AnalyseDeps = {}): Promise<LvAnalysisResult> {
  const analyseText = deps.analyseText ?? ((args) => analyseLvDocument(args));
  const analyseScan = deps.analyseScan ?? ((args) => analyseLvScan(args));
  const readDocument: ReadDocument = deps.readDocument ?? ((f) => extractDocument(f));
  const steps: LvProcessStep[] = [];
  // Teilfehler (KI, OCR, GAEB) – sie werden dem Nutzer sichtbar gemeldet.
  const failures: string[] = [];
  const push = (step: LvProcessStep) => {
    steps.push(step);
    deps.onStep?.(step);
  };

  // Jeder Upload erhält eine neue Analyse-ID; nichts wird aus früheren Analysen übernommen.
  const analysisId = newAnalysisId();

  const base = {
    analysisId,
    fileName: file.name,
    fileSize: file.size,
    uploadedAt: new Date().toISOString(),
    pageCount: 0,
    rawText: "",
    totals: [] as LvTotalLine[],
    issues: [],
    items: [] as LvNormalizedItem[],
  };

  if (!isSupportedFile(file.name)) {
    push({ state: "error", label: "Dateiformat wird nicht unterstützt" });
    return {
      ...base,
      kind: "unsupported",
      kindReason: `„${file.name}" hat ein nicht unterstütztes Format.`,
      status: "error",
      statusMessage: "Das Dateiformat kann nicht verarbeitet werden.",
      recommendedAction:
        "Bitte laden Sie die Ausschreibung als PDF, XLSX, CSV oder GAEB (X8x/D8x) hoch.",
      steps,
    };
  }

  let text = "";
  let rows: string[][] = [];
  let hasTextLayer = false;
  let pageCount = 0;

  try {
    const isXml = /\.xml$/i.test(file.name);
    const rawContent = isGaebFile(file.name) || isXml ? await file.text() : "";
    if (shouldParseAsGaeb(file.name, rawContent)) {
      push({ state: "ok", label: "GAEB-Datei wird gelesen" });
      const gaeb = parseGaeb(rawContent);
      text = gaeb.text;
      rows = gaeb.rows;
      hasTextLayer = gaeb.text.trim().length > 0;
      pageCount = 1;
      push({
        state: gaeb.itemCount ? "ok" : "warn",
        label: `GAEB gelesen: ${gaeb.itemCount} Datensätze`,
      });
      for (const warning of gaeb.warnings) {
        push({ state: "warn", label: warning });
        failures.push(warning);
      }
    } else if (isXml) {
      push({ state: "warn", label: "XML ohne GAEB-Struktur – Inhalt wird als Text ausgewertet" });
      text = rawContent.replace(/<[^>]+>/g, " ").replace(/[ \t]{2,}/g, " ");
      rows = [];
      hasTextLayer = text.trim().length > 0;
      pageCount = 1;
    } else {
      push({ state: "ok", label: "Datei wird gelesen" });
      const doc = await readDocument(file);
      text = doc.text;
      rows = doc.rows;
      hasTextLayer = doc.hasTextLayer;
      pageCount = doc.pageCount ?? (doc.rows.length ? 1 : 0);
      push({
        state: hasTextLayer ? "ok" : "warn",
        label: hasTextLayer
          ? `Inhalt gelesen (${text.length.toLocaleString("de-DE")} Zeichen${pageCount ? `, ${pageCount} Seiten` : ""})`
          : "Keine Textebene gefunden – OCR wird benötigt",
      });
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    push({ state: "error", label: `Datei konnte nicht gelesen werden: ${reason}` });
    return {
      ...base,
      kind: "unsupported",
      kindReason: reason,
      status: "error",
      statusMessage: `Die Datei konnte nicht gelesen werden: ${reason}`,
      recommendedAction:
        "Bitte prüfen Sie, ob die Datei beschädigt oder passwortgeschützt ist, und laden Sie sie erneut hoch.",
      steps,
    };
  }

  const candidates: LvNormalizedItem[] = [];
  let totals: LvTotalLine[] = extractTotals(text);
  let aiKind = "";

  // 1) Tabellenspalten (CSV/Excel/GAEB) – ohne KI.
  if (rows.length > 1) {
    // Keine pauschale Sicherheit/Seite mehr: die Erkennungsqualität ergibt sich
    // aus den tatsächlich gelesenen Feldern (Beschreibung, Menge, Einheit, Preis).
    const tableItems = cleanItems(itemsFromRows(rows)).map((i) =>
      normalizeItem({ ...i, source_page: null, confidence_score: null }, "tabelle"),
    );
    candidates.push(...tableItems);
    push({
      state: tableItems.length ? "ok" : "warn",
      label: `Tabellenerkennung: ${tableItems.length} Positionen`,
    });
  }

  // 2) KI-Analyse der Textebene.
  if (hasTextLayer && text.trim().length >= 40) {
    try {
      const ai = await analyseText({ data: { text } });
      aiKind = ai.document_kind;
      const aiItems = ai.items.map((i) =>
        normalizeItem(
          { ...i, source_page: i.source_page || pageIndexForText(text, i.description) || null },
          "ki",
        ),
      );
      candidates.push(...aiItems);
      if (ai.totals.length) {
        totals = [
          ...totals,
          ...ai.totals.map((t) => ({
            label: t.label,
            amount: t.amount,
            source_page: t.source_page || null,
          })),
        ];
      }
      push({
        state: aiItems.length ? "ok" : "warn",
        label: `KI-Analyse: ${aiItems.length} Positionen`,
      });
      for (const warning of ai.warnings ?? []) {
        push({ state: "warn", label: warning });
        failures.push(warning);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      push({ state: "error", label: `KI-Analyse fehlgeschlagen: ${reason}` });
      failures.push(`KI-Analyse fehlgeschlagen: ${reason}`);
    }

    // 3) Regelbasierte Zweitmeinung.
    const ruleItems = cleanItems(itemsFromText(text)).map((i) =>
      normalizeItem({ ...i, source_page: pageIndexForText(text, i.description) }, "regel"),
    );
    candidates.push(...ruleItems);
    push({
      state: ruleItems.length ? "ok" : "warn",
      label: `Regelbasierte Erkennung: ${ruleItems.length} Positionen`,
    });
  }

  let items = dedupeItems(candidates);

  // 4) OCR nur, wenn bisher nichts erkannt wurde.
  if (items.length === 0 && /\.pdf$/i.test(file.name)) {
    push({ state: "warn", label: "Keine Positionen aus der Textebene – OCR wird gestartet" });
    try {
      const ocr = await analyseScan({
        data: {
          fileName: file.name,
          mimeType: file.type || "application/pdf",
          base64: await fileToBase64(file),
        },
      });
      aiKind = aiKind || ocr.document_kind;
      items = dedupeItems(ocr.items.map((i) => normalizeItem(i, "ocr")));
      if (ocr.totals.length) {
        totals = [
          ...totals,
          ...ocr.totals.map((t) => ({
            label: t.label,
            amount: t.amount,
            source_page: t.source_page || null,
          })),
        ];
      }
      hasTextLayer = hasTextLayer || items.length > 0 || ocr.totals.length > 0;
      push({ state: items.length ? "ok" : "warn", label: `OCR: ${items.length} Positionen` });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      push({ state: "error", label: `OCR fehlgeschlagen: ${reason}` });
      failures.push(`OCR fehlgeschlagen: ${reason}`);
    }
  }

  totals = dedupeTotals(totals);

  const classification = classifyDocument({
    fileName: file.name,
    text,
    rows,
    hasTextLayer,
    itemCount: items.length,
    totalCount: totals.length,
    structuredItemCount: items.filter((i) => i.quantity !== null && i.quantity > 0 && i.unit.trim())
      .length,
  });

  // Die KI-Einstufung darf die Heuristik überstimmen, wenn sie plausibel ist.
  let kind = classification.kind;
  let kindReason = classification.reason;
  if (
    aiKind &&
    ["detailed_lv", "pricing_form", "cleaning_spec", "unsupported"].includes(aiKind) &&
    !(kind === "scanned_pdf")
  ) {
    const structured = items.filter(
      (i) => i.quantity !== null && i.quantity > 0 && i.unit.trim(),
    ).length;
    if (aiKind === "detailed_lv" && structured < 3) {
      // KI meldet LV, es fehlt aber die vollständige LV-Struktur: Heuristik behalten.
    } else if (aiKind === "unsupported" && items.length > 0) {
      // Es wurden bereits Positionen extrahiert – eine KI-Einstufung „unsupported“
      // darf das Ergebnis nicht verwerfen.
      kindReason = `${classification.reason} Hinweis: Die KI stufte das Dokument als nicht verwertbar ein, es wurden jedoch ${items.length} Positionen erkannt.`;
    } else if (aiKind !== kind) {
      kind = aiKind as typeof kind;
      kindReason = `${classification.reason} KI-Einstufung: ${aiKind}.`;
    }
  }
  if (items.length === 0 && totals.length > 0 && kind !== "scanned_pdf") {
    kind = "pricing_form";
    kindReason = `Das Dokument enthält ausschließlich Summenwerte (${totals.length} Beträge) und wurde als Preisblatt eingestuft.`;
  }

  // Kalkulationsfelder bleiben leer, keine Freigabe, feste Bindung an diese Analyse-ID.
  items = stampAnalysis(items, analysisId);

  const issues = validateItems(items);
  const { status, statusMessage, recommendedAction } = describeStatus(
    kind,
    items.length,
    totals.length,
    issues.length,
  );
  push({
    state: status === "error" ? "error" : status === "success" ? "ok" : "warn",
    label: statusMessage,
  });

  return {
    analysisId,
    fileName: file.name,
    fileSize: file.size,
    uploadedAt: base.uploadedAt,
    kind,
    kindReason,
    status,
    statusMessage,
    recommendedAction,
    items,
    totals,
    issues,
    steps,
    pageCount,
    rawText: text,
    failures,
  };
}

function dedupeTotals(totals: LvTotalLine[]): LvTotalLine[] {
  const map = new Map<string, LvTotalLine>();
  for (const total of totals) {
    const key = `${total.label.toLowerCase().replace(/\s+/g, " ")}|${total.amount}`;
    if (!map.has(key)) map.set(key, total);
  }
  return [...map.values()];
}

function describeStatus(
  kind: LvAnalysisResult["kind"],
  itemCount: number,
  totalCount: number,
  issueCount: number,
): Pick<LvAnalysisResult, "status" | "statusMessage" | "recommendedAction"> {
  if (kind === "unsupported") {
    return {
      status: "error",
      statusMessage: "Dokument nicht verwertbar.",
      recommendedAction:
        "Bitte ein Leistungsverzeichnis oder Preisblatt als PDF, XLSX, CSV oder GAEB hochladen.",
    };
  }
  if (kind === "pricing_form" && itemCount === 0) {
    return {
      status: totalCount > 0 ? "partial" : "empty",
      statusMessage:
        totalCount > 0
          ? `Preisblatt erkannt: ${totalCount} Summenwerte übernommen, keine Einzelpositionen enthalten.`
          : "Preisblatt erkannt, es konnten jedoch keine Beträge gelesen werden.",
      recommendedAction:
        totalCount > 0
          ? "Die Summen finden Sie im Reiter „Kostenanalyse“. Positionen bei Bedarf manuell ergänzen."
          : "Bitte Beträge manuell erfassen oder eine besser lesbare Fassung hochladen.",
    };
  }
  if (kind === "cleaning_spec" && itemCount === 0) {
    return {
      status: "partial",
      statusMessage:
        "Reinigungs-Leistungsbeschreibung erkannt – keine kalkulierbaren Positionen enthalten.",
      recommendedAction:
        "Positionen aus der Beschreibung manuell anlegen oder das zugehörige Preisblatt/LV zusätzlich hochladen.",
    };
  }
  if (itemCount === 0) {
    return {
      status: "empty",
      statusMessage: "Es konnten keine Positionen extrahiert werden.",
      recommendedAction:
        "Analyse erneut starten, eine textbasierte Fassung (kein Foto-Scan) verwenden oder Positionen manuell erfassen.",
    };
  }
  if (kind === "pricing_form" && itemCount > 0) {
    return {
      status: "partial",
      statusMessage: `${itemCount} Positionen extrahiert – ${issueCount} Hinweise zur Prüfung.`,
      recommendedAction:
        "Das Dokument enthält keine vollständige LV-Struktur. Preise, Intervalle und fehlende Felder müssen vor der Freigabe geprüft werden.",
    };
  }
  if (issueCount > 0) {
    return {
      status: "partial",
      statusMessage: `${itemCount} Positionen extrahiert – ${issueCount} Hinweise zur Prüfung.`,
      recommendedAction:
        "Reiter „Fehlende Daten“ öffnen und die markierten Felder ergänzen, dann Positionen freigeben.",
    };
  }
  return {
    status: "success",
    statusMessage: `${itemCount} Positionen vollständig extrahiert.`,
    recommendedAction: "Positionen prüfen und freigeben, anschließend Preisempfehlung übernehmen.",
  };
}

export { toNumberOrNull };
