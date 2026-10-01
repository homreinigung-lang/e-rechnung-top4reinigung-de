import { supabase } from "@/integrations/supabase/client";

export type DocumentItem = {
  id: string;
  position: number;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  is_optional?: boolean;
};

export async function fetchDocumentDetail(id: string) {
  const [doc, items, settings, customers, projects] = await Promise.all([
    supabase.from("documents").select("*").eq("id", id).single(),
    supabase
      .from("document_items")
      .select("*")
      .eq("document_id", id)
      .order("position", { ascending: true }),
    supabase.from("company_settings").select("*").maybeSingle(),
    supabase.from("customers").select("*").order("company", { ascending: true }),
    supabase
      .from("projects")
      .select("id,name,city,customer_id,status")
      .order("name", { ascending: true }),
  ]);
  if (doc.error) throw doc.error;

  const rec = doc.data as unknown as Record<string, unknown>;
  const relatedId =
    (rec["cancelled_by_document_id"] as string | null) ??
    (rec["cancels_document_id"] as string | null) ??
    null;
  const related = relatedId
    ? (
        await supabase
          .from("documents")
          .select("id, number, storno_reason, is_storno")
          .eq("id", relatedId)
          .maybeSingle()
      ).data
    : null;

  const followUpId = (rec["converted_document_id"] as string | null) ?? null;
  const [followUpRes, sourceRes] = await Promise.all([
    followUpId
      ? supabase
          .from("documents")
          .select("id, number, type, issue_date")
          .eq("id", followUpId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("documents")
      .select("id, number, type, issue_date")
      .eq("converted_document_id", id)
      .maybeSingle(),
  ]);

  return {
    doc: doc.data,
    related,
    followUp: followUpRes.data ?? null,
    source: sourceRes.data ?? null,
    items: (items.data ?? []) as DocumentItem[],
    settings: settings.data,
    customers: customers.data ?? [],
    projects: projects.data ?? [],
  };
}
