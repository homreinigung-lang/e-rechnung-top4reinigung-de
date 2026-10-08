export type QuoteDecisionDocument = {
  type: string;
  status: string;
  is_storno?: boolean | null;
};

/** Only undecided, non-cancelled quotes can be accepted or declined. */
export function assertQuoteDecisionAllowed(doc: QuoteDecisionDocument): void {
  if (doc.type !== "quote") {
    throw new Error("Diese Aktion ist nur für Angebote möglich.");
  }
  if (doc.is_storno || !["draft", "sent"].includes(doc.status)) {
    throw new Error("Nur offene Angebote können angenommen oder abgelehnt werden.");
  }
}
