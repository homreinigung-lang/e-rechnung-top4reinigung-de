import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  DOC_TYPE_LABEL,
  STATUS_LABEL,
  formatDate,
  formatMoney,
  nextNumber,
  today,
  addDays,
} from "@/lib/format";
import { Copy, FileText, Plus, Receipt, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dokumente/")({
  head: () => ({
    meta: [
      { title: "Rechnungen & Angebote verwalten" },
      {
        name: "description",
        content: "Alle Rechnungen und Angebote der Reinigungsfirma an einem Ort verwalten.",
      },
      { property: "og:title", content: "Rechnungen & Angebote verwalten" },
      { property: "og:description", content: "Dokumente erstellen, duplizieren, löschen und versenden." },
    ],
  }),
  component: DokumenteListe,
});

function DokumenteListe() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"invoice" | "quote">("invoice");

  const { data: documents = [] } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (type: "invoice" | "quote") => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");

      const { data: settings } = await supabase
        .from("company_settings")
        .select("payment_terms_days")
        .maybeSingle();

      const number = nextNumber(
        type,
        documents.filter((d) => d.type === type).map((d) => d.number),
      );
      const issue = today();
      const { data, error } = await supabase
        .from("documents")
        .insert({
          user_id: userId,
          type,
          number,
          issue_date: issue,
          due_date: type === "invoice" ? addDays(issue, settings?.payment_terms_days ?? 14) : null,
          reverse_charge: true,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      navigate({ to: "/dokumente/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicate = useMutation({
    mutationFn: async (docId: string) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const { data: src, error } = await supabase
        .from("documents")
        .select("*")
        .eq("id", docId)
        .single();
      if (error) throw error;
      const { data: srcItems } = await supabase
        .from("document_items")
        .select("*")
        .eq("document_id", docId)
        .order("position");

      const number = nextNumber(
        src.type as "invoice" | "quote",
        documents.filter((d) => d.type === src.type).map((d) => d.number),
      );
      const { id: _i, created_at: _c, updated_at: _u, sent_at: _s, ...rest } = src as Record<
        string,
        never
      >;
      const { data: created, error: insErr } = await supabase
        .from("documents")
        .insert({ ...rest, user_id: userId, number, status: "draft" } as never)
        .select("id")
        .single();
      if (insErr) throw insErr;

      if (srcItems && srcItems.length > 0) {
        await supabase.from("document_items").insert(
          srcItems.map((i, index) => ({
            document_id: created.id,
            user_id: userId,
            position: index + 1,
            description: i.description,
            quantity: i.quantity,
            unit: i.unit,
            unit_price: i.unit_price,
          })),
        );
      }
      return created.id as string;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Kopie erstellt");
      navigate({ to: "/dokumente/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (docId: string) => {
      await supabase.from("document_items").delete().eq("document_id", docId);
      const { error } = await supabase.from("documents").delete().eq("id", docId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dokument gelöscht");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = documents.filter((d) => d.type === tab);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Rechnungen & Angebote</h1>
          <p className="mt-1 text-muted-foreground">
            Fortlaufende Nummerierung gemäß § 14 UStG – Nummern bleiben frei änderbar.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => create.mutate("quote")}>
            <FileText className="size-4" /> Neues Angebot
          </Button>
          <Button onClick={() => create.mutate("invoice")}>
            <Plus className="size-4" /> Neue Rechnung
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "invoice" | "quote")}>
        <TabsList>
          <TabsTrigger value="invoice">
            <Receipt className="mr-2 size-4" /> Rechnungen
          </TabsTrigger>
          <TabsTrigger value="quote">
            <FileText className="mr-2 size-4" /> Angebote
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="surface overflow-hidden">
        {list.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            Noch keine {tab === "invoice" ? "Rechnungen" : "Angebote"} vorhanden.
          </p>
        ) : (
          <ul className="divide-y">
            {list.map((d) => (
              <li key={d.id} className="flex items-center gap-2 px-5 py-4 hover:bg-muted/60">
                <Link
                  to="/dokumente/$id"
                  params={{ id: d.id }}
                  className="flex flex-1 flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-medium">
                      {DOC_TYPE_LABEL[d.type]} {d.number}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {d.customer_company || d.customer_name || "Ohne Kunde"} ·{" "}
                      {formatDate(d.issue_date)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{formatMoney(Number(d.total))}</div>
                    <div className="text-xs text-muted-foreground">{STATUS_LABEL[d.status]}</div>
                  </div>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Duplizieren"
                  onClick={() => duplicate.mutate(d.id)}
                >
                  <Copy className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Löschen"
                  onClick={() => {
                    if (confirm(`${DOC_TYPE_LABEL[d.type]} ${d.number} wirklich löschen?`)) {
                      remove.mutate(d.id);
                    }
                  }}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
