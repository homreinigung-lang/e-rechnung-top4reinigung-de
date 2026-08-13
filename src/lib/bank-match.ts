// Pure Matching-Logik: Bankumsatz <-> offene Rechnung

export type MatchTx = {
  id: string;
  amount: number;
  booking_date: string;
  counterparty_name: string;
  remittance_info: string;
};

export type MatchDoc = {
  id: string;
  number: string;
  total: number;
  customer_name: string;
  customer_company: string;
  issue_date: string;
};

export type MatchResult = {
  transactionId: string;
  documentId: string;
  score: number;
  reason: string;
};

const STOPWORDS = new Set([
  "gmbh",
  "ug",
  "ag",
  "kg",
  "ohg",
  "mbh",
  "co",
  "und",
  "der",
  "die",
  "das",
  "gbr",
  "e",
  "k",
  "se",
]);

export function normalize(value: string): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[äÄ]/g, "ae")
    .replace(/[öÖ]/g, "oe")
    .replace(/[üÜ]/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/** 0..1 – Anteil der Namens-Tokens der Rechnung, die im Bankumsatz vorkommen. */
export function nameSimilarity(docName: string, bankText: string): number {
  const a = tokens(docName);
  if (a.length === 0) return 0;
  const b = normalize(bankText);
  const hits = a.filter((t) => b.includes(t)).length;
  return hits / a.length;
}

/** Rechnungsnummer im Verwendungszweck gefunden? */
export function hasInvoiceNumber(docNumber: string, bankText: string): boolean {
  const num = normalize(docNumber).replace(/\s+/g, "");
  if (num.length < 3) return false;
  const text = normalize(bankText).replace(/\s+/g, "");
  return text.includes(num);
}

export function scoreMatch(tx: MatchTx, doc: MatchDoc) {
  const bankText = `${tx.counterparty_name} ${tx.remittance_info}`;
  const amountDiff = Math.abs(Number(doc.total) - Number(tx.amount));
  const amountExact = amountDiff < 0.01;
  const amountClose = amountDiff <= Math.max(0.05, Number(doc.total) * 0.001);

  let score = 0;
  const reasons: string[] = [];

  if (amountExact) {
    score += 0.5;
    reasons.push("Betrag exakt");
  } else if (amountClose) {
    score += 0.35;
    reasons.push("Betrag nahezu exakt");
  }

  if (hasInvoiceNumber(doc.number, bankText)) {
    score += 0.5;
    reasons.push("Rechnungsnummer im Verwendungszweck");
  }

  const nameScore = Math.max(
    nameSimilarity(doc.customer_name, bankText),
    nameSimilarity(doc.customer_company, bankText),
  );
  if (nameScore >= 0.5) {
    score += 0.3 * nameScore;
    reasons.push("Kundenname stimmt überein");
  }

  // Zahlung sollte nicht vor Rechnungsdatum liegen
  if (doc.issue_date && tx.booking_date && tx.booking_date < doc.issue_date) {
    score -= 0.3;
    reasons.push("Zahlung vor Rechnungsdatum");
  }

  return { score: Math.max(0, Math.min(1, score)), reason: reasons.join(" · ") };
}

export const AUTO_MATCH_THRESHOLD = 0.8;

/**
 * Ordnet Zahlungseingänge offenen Rechnungen zu.
 * Jede Rechnung und jeder Umsatz wird höchstens einmal verwendet.
 */
export function matchTransactions(
  transactions: MatchTx[],
  documents: MatchDoc[],
  threshold = AUTO_MATCH_THRESHOLD,
): MatchResult[] {
  const candidates: MatchResult[] = [];

  for (const tx of transactions) {
    if (Number(tx.amount) <= 0) continue; // nur Zahlungseingänge
    for (const doc of documents) {
      const { score, reason } = scoreMatch(tx, doc);
      if (score >= threshold) {
        candidates.push({ transactionId: tx.id, documentId: doc.id, score, reason });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const usedTx = new Set<string>();
  const usedDoc = new Set<string>();
  const result: MatchResult[] = [];
  for (const c of candidates) {
    if (usedTx.has(c.transactionId) || usedDoc.has(c.documentId)) continue;
    usedTx.add(c.transactionId);
    usedDoc.add(c.documentId);
    result.push(c);
  }
  return result;
}
