import { toast } from "sonner";

import { saveFile } from "@/lib/download";
import { buildCsvBlob, type DateRange } from "@/lib/table-summary";

export const SMTP_FIELDS = [
  { key: "smtp_host", label: "SMTP-Server" },
  { key: "smtp_port", label: "Port" },
  { key: "smtp_user", label: "Benutzername" },
  { key: "smtp_from", label: "Absenderadresse" },
] as const;

export function downloadCsv(name: string, rows: Record<string, unknown>[], range?: DateRange) {
  // Strikte Datumsfilterung + Endsummen oben + UTF-8-BOM/Semikolon (Excel-tauglich).
  const blob = buildCsvBlob(rows, { title: name.replace(/\.csv$/i, ""), range });
  if (!blob) {
    toast.error("Keine Daten im gewählten Zeitraum.");
    return;
  }
  void saveFile(blob, name);
}
