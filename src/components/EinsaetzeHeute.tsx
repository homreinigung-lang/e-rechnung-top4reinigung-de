import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays, MapPin, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { today } from "@/lib/format";
import { mapsUrl, serviceAddress, serviceAddressOrBilling } from "@/lib/maps";
import { einsatzStatus, statusClasses, statusLabel } from "@/lib/einsatz-status";

type CustomerLite = {
  id: string;
  name: string | null;
  company: string | null;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  service_address_line: string | null;
  service_postal_code: string | null;
  service_city: string | null;
  service_note: string | null;
};

const hm = (v?: string | null) => (v ? String(v).slice(0, 5) : "");

/**
 * Tagesübersicht der geplanten Einsätze – liest ausschließlich vorhandene
 * Zeiterfassungs-/Planungsdaten (time_entries) und den Einsatzort des Kunden.
 */
export function EinsaetzeHeute() {
  const day = today();

  const { data, isPending } = useQuery({
    queryKey: ["einsaetze_heute", day],
    queryFn: async () => {
      const { data: entries, error } = await supabase
        .from("time_entries")
        .select(
          "id, work_date, start_time, end_time, hours, location, note, entry_type, absence_reason, approval_status, completed_at, employee_name, customer_id, project_id",
        )
        .eq("work_date", day)
        .order("start_time", { ascending: true, nullsFirst: false });
      if (error) throw error;

      const ids = [...new Set((entries ?? []).map((e) => e.customer_id).filter(Boolean))];
      let customers: CustomerLite[] = [];
      if (ids.length > 0) {
        const { data: cs, error: cErr } = await supabase
          .from("customers")
          .select(
            "id, name, company, address_line, postal_code, city, service_address_line, service_postal_code, service_city, service_note",
          )
          .in("id", ids as string[]);
        if (cErr) throw cErr;
        customers = (cs ?? []) as CustomerLite[];
      }
      return { entries: entries ?? [], customers };
    },
  });

  const entries = data?.entries ?? [];
  const byId = new Map((data?.customers ?? []).map((c) => [c.id, c]));

  const totalHours = entries.reduce((s, e) => s + Number(e.hours || 0), 0);

  return (
    <section aria-label="Einsätze heute" className="surface overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-primary" />
          <div>
            <h2 className="font-semibold">Einsätze heute</h2>
            <p className="text-xs text-muted-foreground">
              Geplante Einsätze, Kunden und Einsatzorte für den heutigen Tag.
            </p>
          </div>
        </div>
        <span className="text-sm text-muted-foreground">
          {entries.length} Einsätze · {totalHours.toFixed(2).replace(".", ",")} Std.
        </span>
      </div>

      {isPending ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">Wird geladen …</p>
      ) : entries.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
          Heute sind keine Einsätze geplant.
        </p>
      ) : (
        <ul className="divide-y">
          {entries.map((e) => {
            const c = e.customer_id ? byId.get(e.customer_id) : undefined;
            const site = serviceAddressOrBilling(c);
            const ownSite = Boolean(serviceAddress(c));
            const address = e.location || site;
            const status = einsatzStatus(e);
            return (
              <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {c?.company || c?.name || "Ohne Kunde"}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${statusClasses(status)}`}
                    >
                      {statusLabel(status)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Users className="size-3.5 shrink-0" />
                    <span className="truncate">{e.employee_name || "Ohne Mitarbeitende"}</span>
                  </div>
                  {address ? (
                    <div className="mt-1 flex items-start gap-1.5 text-sm">
                      <MapPin className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          {ownSite || e.location ? "Einsatzort" : "Verwaltungssitz"}
                        </span>
                        <a
                          href={mapsUrl(address)}
                          target="_blank"
                          rel="noreferrer"
                          className="block break-words hover:underline"
                        >
                          {address}
                        </a>
                        {c?.service_note ? (
                          <span className="block text-xs text-muted-foreground">
                            {c.service_note}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="text-right text-sm">
                  <div className="font-medium">
                    {hm(e.start_time) && hm(e.end_time)
                      ? `${hm(e.start_time)}–${hm(e.end_time)}`
                      : "ganztägig"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {Number(e.hours || 0)
                      .toFixed(2)
                      .replace(".", ",")}{" "}
                    Std.
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t px-5 py-3 text-sm">
        <Link to="/team" className="text-primary hover:underline">
          Zur Einsatzplanung
        </Link>
      </div>
    </section>
  );
}
