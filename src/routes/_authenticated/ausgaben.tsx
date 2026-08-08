import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatDate, formatMoney, today } from "@/lib/format";
import { FileUploadButton } from "@/components/FileUploadButton";
import { useFileUrl } from "@/hooks/useFileUrl";
import { scanReceipt } from "@/lib/receipt-scan.functions";
import { Loader2, Paperclip, Plus, Sparkles, Trash2 } from "lucide-react";


export const Route = createFileRoute("/_authenticated/ausgaben")({
  head: () => ({
    meta: [
      { title: "Ausgaben & Eingangsrechnungen erfassen" },
      {
        name: "description",
        content: "Eingangsrechnungen und Betriebsausgaben erfassen und Einnahmen-Überschuss sehen.",
      },
      { property: "og:title", content: "Ausgaben & Eingangsrechnungen" },
      { property: "og:description", content: "Einnahmen und Ausgaben gegenüberstellen." },
    ],
  }),
  component: Ausgaben,
});

const CATEGORIES = [
  "Material",
  "Reinigungsmittel",
  "Fahrzeug",
  "Löhne",
  "Miete",
  "Versicherung",
  "Sonstiges",
];

type Form = {
  supplier: string;
  expense_date: string;
  category: string;
  document_number: string;
  net_amount: string;
  vat_amount: string;
  notes: string;
  receipt_url: string;
};

const empty: Form = {
  supplier: "",
  expense_date: today(),
  category: "Sonstiges",
  document_number: "",
  net_amount: "",
  vat_amount: "",
  notes: "",
  receipt_url: "",
};

function Ausgaben() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>(empty);

  const { data: rows = [] } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const net = Number(form.net_amount || 0);
      const vat = Number(form.vat_amount || 0);
      const { error } = await supabase.from("expenses").insert({
        user_id: userId,
        supplier: form.supplier,
        expense_date: form.expense_date,
        category: form.category,
        document_number: form.document_number,
        net_amount: net,
        vat_amount: vat,
        gross_amount: net + vat,
        notes: form.notes,
        receipt_url: form.receipt_url,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ausgabe erfasst");
      setForm({ ...empty, expense_date: today(), receipt_url: "" });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalNet = rows.reduce((s, r) => s + Number(r.net_amount), 0);
  const totalGross = rows.reduce((s, r) => s + Number(r.gross_amount), 0);
  const totalVat = rows.reduce((s, r) => s + Number(r.vat_amount), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Ausgaben & Eingangsrechnungen</h1>
        <p className="mt-1 text-muted-foreground">
          Betriebsausgaben erfassen und Vorsteuer sowie Ergebnis auswerten.
        </p>
      </div>

      <div className="surface space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="supplier">Lieferant</Label>
            <Input
              id="supplier"
              value={form.supplier}
              onChange={(e) => setForm({ ...form, supplier: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="expense_date">Belegdatum</Label>
            <Input
              id="expense_date"
              type="date"
              value={form.expense_date}
              onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">Kategorie</Label>
            <select
              id="category"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="document_number">Belegnummer</Label>
            <Input
              id="document_number"
              value={form.document_number}
              onChange={(e) => setForm({ ...form, document_number: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="net_amount">Netto €</Label>
            <Input
              id="net_amount"
              type="number"
              step="0.01"
              value={form.net_amount}
              onChange={(e) => setForm({ ...form, net_amount: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vat_amount">Umsatzsteuer €</Label>
            <Input
              id="vat_amount"
              type="number"
              step="0.01"
              value={form.vat_amount}
              onChange={(e) => setForm({ ...form, vat_amount: e.target.value })}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <FileUploadButton
            folder="belege"
            accept="image/*,application/pdf"
            label="Beleg hochladen & automatisch auslesen"
            onUploaded={(path, file) => {
              setForm((f) => ({ ...f, receipt_url: path }));
              void analyze(file);
            }}
          />
          {scanning && (
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Beleg wird ausgelesen…
            </span>
          )}
          {!scanning && form.receipt_url && (
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <Paperclip className="size-4" /> Beleg angehängt & mit der Ausgabe verknüpft
            </span>
          )}
          {!scanning && scanned && (
            <span className="inline-flex items-center gap-1 text-sm text-primary">
              <Sparkles className="size-4" /> Daten automatisch übernommen – bitte prüfen
            </span>
          )}
        </div>

        <Button onClick={() => add.mutate()} disabled={add.isPending}>
          <Plus className="size-4" /> Ausgabe speichern
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Ausgaben netto", value: totalNet },
          { label: "Vorsteuer", value: totalVat },
          { label: "Ausgaben brutto", value: totalGross },
        ].map((s) => (
          <div key={s.label} className="surface p-5">
            <div className="text-sm text-muted-foreground">{s.label}</div>
            <div className="mt-2 font-display text-2xl font-semibold">{formatMoney(s.value)}</div>
          </div>
        ))}
      </div>

      <div className="surface overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            Noch keine Ausgaben erfasst.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <ExpenseRow key={r.id} row={r as never} onDelete={() => remove.mutate(r.id)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type ExpenseRowData = {
  id: string;
  supplier: string;
  expense_date: string;
  category: string;
  document_number: string;
  gross_amount: number;
  net_amount: number;
  receipt_url: string;
};

function ExpenseRow({ row: r, onDelete }: { row: ExpenseRowData; onDelete: () => void }) {
  const receipt = useFileUrl(r.receipt_url);
  return (
    <li className="flex items-center gap-3 px-5 py-4">
                <div className="flex-1">
                  <div className="font-medium">{r.supplier || "Ohne Lieferant"}</div>
                  <div className="text-sm text-muted-foreground">
                    {formatDate(r.expense_date)} · {r.category}
                    {r.document_number ? ` · ${r.document_number}` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{formatMoney(Number(r.gross_amount))}</div>
                  <div className="text-xs text-muted-foreground">
                    netto {formatMoney(Number(r.net_amount))}
                  </div>
                </div>
                {receipt && (
                  <a
                    href={receipt}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted"
                    title="Beleg öffnen"
                  >
                    <Paperclip className="size-4" />
                  </a>
                )}
                <Button variant="ghost" size="icon" onClick={onDelete}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
    </li>
  );
}
