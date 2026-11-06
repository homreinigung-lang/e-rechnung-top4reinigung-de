import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getRouteApi } from "@tanstack/react-router";
import {
  getAccountantFahrtenbuchMonth,
  getOwnerFahrtenbuchMonth,
} from "@/lib/accountant/fahrtenbuch.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { saveFile } from "@/lib/download";
const route = getRouteApi("/stb/$token");

export function AccountantFahrtenbuchExport({ code }: { code: string }) {
  const { token } = route.useParams();
  const load = useServerFn(getAccountantFahrtenbuchMonth);
  return <MonthlyFahrtenbuchExport loadMonth={(month) => load({ data: { token, code, month } })} />;
}
export function OwnerFahrtenbuchExport() {
  const load = useServerFn(getOwnerFahrtenbuchMonth);
  return <MonthlyFahrtenbuchExport loadMonth={(month) => load({ data: { month } })} />;
}
function MonthlyFahrtenbuchExport({
  loadMonth,
}: {
  loadMonth: (month: string) => ReturnType<typeof getAccountantFahrtenbuchMonth>;
}) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const report = await loadMonth(month);
      const { buildFahrtenbuchPdfWithCompany } = await import("@/lib/fahrtenbuch-branded-pdf");
      await saveFile(
        await buildFahrtenbuchPdfWithCompany(
          report.rows,
          report.from,
          report.to,
          report.companyName,
          report.logoUrl,
          report.summaries,
        ),
        `Fahrtenbuch_${month}.pdf`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Monats-PDF konnte nicht erstellt werden.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor="accountant-fahrtenbuch-month">Fahrtenbuch-Monat</Label>
        <Input
          id="accountant-fahrtenbuch-month"
          type="month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
        />
      </div>
      <Button variant="outline" disabled={busy || !month} onClick={() => void download()}>
        {busy ? "Wird erstellt…" : "Monats-PDF herunterladen"}
      </Button>
    </div>
  );
}
