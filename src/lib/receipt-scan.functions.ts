import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ScannedReceipt } from "@/lib/receipt-scan.server";

export type { ScannedReceipt };

/** Liest Rechnungsnummer, Datum, Beträge und Lieferant aus einem hochgeladenen Beleg. */
export const scanReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { dataUrl: string; mimeType: string }) => {
    if (!data?.dataUrl?.startsWith("data:")) throw new Error("Ungültige Datei.");
    if (data.dataUrl.length > 14_000_000) throw new Error("Datei ist zu groß (max. ca. 10 MB).");
    return { dataUrl: data.dataUrl, mimeType: data.mimeType || "application/pdf" };
  })
  .handler(async ({ data }): Promise<ScannedReceipt> => {
    const { extractReceipt } = await import("@/lib/receipt-scan.server");
    return extractReceipt(data.dataUrl, data.mimeType);
  });
