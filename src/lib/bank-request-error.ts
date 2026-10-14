import { BANK_RENEWAL_MESSAGE } from "../../supabase/functions/enable-banking/consent";

/** Decode known consent errors without displaying raw upstream banking payloads. */
export async function bankRequestError(error: { message?: string; context?: unknown }): Promise<Error> {
  if (error.context instanceof Response) {
    try {
      const payload = await error.context.clone().json() as {
        error?: string; reauthorization_required?: boolean; details?: { error?: string };
      };
      if (payload.reauthorization_required || ["CLOSED_SESSION", "EXPIRED_SESSION"].includes(payload.details?.error ?? "")) {
        return new Error(BANK_RENEWAL_MESSAGE);
      }
      if (typeof payload.error === "string" && payload.error) return new Error(payload.error);
    } catch { /* Keep the transport error if the response is not JSON. */ }
  }
  return new Error(error.message || "Bankdaten konnten nicht geladen werden.");
}
