import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense, lazy, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { geocodeAddresses } from "@/lib/geo.functions";
import type { MapPoint } from "@/components/EinsatzKarte";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { MapPin, Users, FolderKanban, HardHat, Navigation } from "lucide-react";

const EinsatzKarte = lazy(() => import("@/components/EinsatzKarte"));

export const Route = createFileRoute("/_authenticated/karte")({
  head: () => ({
    meta: [
      { title: "Einsatzkarte – Kunden, Projekte & Teams" },
      {
        name: "description",
        content:
          "Interaktive Karte mit Kundenadressen, Projektstandorten und geplanten Mitarbeiter-Einsätzen für die Tourenplanung.",
      },
      { property: "og:title", content: "Einsatzkarte – HomR Office" },
      {
        property: "og:description",
        content: "Kunden, Projekte und Einsätze geografisch planen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KartePage,
});

type Filter = "customer" | "project" | "assignment" | "custom";

const FILTER_LABEL: Record<Filter, string> = {
  customer: "Kunden",
  project: "Projekte",
  assignment: "Einsätze",
  custom: "Eigene Orte",
};

const FILTER_ICON = {
  customer: Users,
  project: FolderKanban,
  assignment: HardHat,
  custom: MapPin,
} as const;

function buildAddress(parts: (string | null | undefined)[]) {
  const line = parts.map((p) => (p ?? "").trim()).filter(Boolean).join(", ");
  return line.length > 4 ? line : "";
}

function KartePage() {
  const [active, setActive] = useState<Record<Filter, boolean>>({
    customer: true,
    project: true,
    assignment: true,
    custom: true,
  });
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [form, setForm] = useState({
    label: "",
    address_line: "",
    postal_code: "",
    city: "",
    country: "Deutschland",
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const geocode = useServerFn(geocodeAddresses);
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ["karte-daten", day],
    queryFn: async () => {
      const [customers, projects, entries] = await Promise.all([
        supabase
          .from("customers")
          .select("id, name, company, address_line, postal_code, city")
          .order("name"),
        supabase
          .from("projects")
          .select("id, name, customer_name, status, address_line, postal_code, city"),
        supabase
          .from("time_entries")
          .select("id, employee_name, work_date, location, project_id, entry_type")
          .eq("work_date", day),
      ]);
      if (customers.error) throw customers.error;
      return {
        customers: customers.data ?? [],
        projects: projects.data ?? [],
        entries: entries.data ?? [],
      };
    },
  });

  // Rohpunkte (noch ohne Koordinaten)
  const raw = useMemo(() => {
    if (!data) return [] as Omit<MapPoint, "lat" | "lon">[];
    const projectById = new Map(data.projects.map((p) => [p.id, p]));
    const list: Omit<MapPoint, "lat" | "lon">[] = [];

    for (const c of data.customers) {
      const address = buildAddress([c.address_line, c.postal_code, c.city]);
      if (!address) continue;
      list.push({
        id: `c-${c.id}`,
        kind: "customer",
        title: c.company || c.name || "Kunde",
        subtitle: c.company && c.name ? c.name : "Kundenadresse",
        address,
      });
    }

    for (const p of data.projects) {
      const address = buildAddress([p.address_line, p.postal_code, p.city]);
      if (!address) continue;
      list.push({
        id: `p-${p.id}`,
        kind: "project",
        title: p.name || "Projekt",
        subtitle: [p.customer_name, p.status].filter(Boolean).join(" · ") || "Projekt",
        address,
      });
    }

    for (const e of data.entries) {
      if (e.entry_type && e.entry_type !== "work") continue;
      const project = e.project_id ? projectById.get(e.project_id) : undefined;
      const address = project
        ? buildAddress([project.address_line, project.postal_code, project.city])
        : buildAddress([e.location]);
      if (!address) continue;
      list.push({
        id: `e-${e.id}`,
        kind: "assignment",
        title: e.employee_name || "Mitarbeiter",
        subtitle: `${formatDate(String(e.work_date))} · ${project?.name || e.location}`,
        address,
      });
    }
    return list;
  }, [data]);

  const addresses = useMemo(
    () => Array.from(new Set(raw.map((r) => r.address))).slice(0, 60),
    [raw],
  );

  const { data: coords = {}, isFetching: geoLoading } = useQuery({
    queryKey: ["geocode", addresses],
    enabled: addresses.length > 0,
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      const out: Record<string, { lat: number; lon: number; label: string }> = {};
      for (let i = 0; i < addresses.length; i += 12) {
        const chunk = addresses.slice(i, i + 12);
        const res = await geocode({ data: { addresses: chunk } });
        Object.assign(out, res);
      }
      return out;
    },
  });

  const points: MapPoint[] = useMemo(
    () =>
      raw
        .filter((r) => active[r.kind])
        .flatMap((r) => {
          const hit = coords[r.address];
          return hit ? [{ ...r, lat: hit.lat, lon: hit.lon }] : [];
        }),
    [raw, coords, active],
  );

  const counts = {
    customer: raw.filter((r) => r.kind === "customer").length,
    project: raw.filter((r) => r.kind === "project").length,
    assignment: raw.filter((r) => r.kind === "assignment").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Einsatzkarte</h1>
          <p className="mt-1 text-muted-foreground">
            Kundenadressen, Projektstandorte und geplante Einsätze geografisch im Blick.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Einsatztag</span>
            <Input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="w-44"
            />
          </label>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
        <Navigation className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="font-medium">Direkte Navigation zum Einsatzort</p>
          <p className="text-muted-foreground">
            Mitarbeiter können auf jeden Marker oder Listeneintrag tippen und über die Schaltfläche
            „Navigieren" Google Maps mit der Routenführung zum ausgewählten Einsatzort öffnen. So
            spart das Team Zeit bei der Anfahrt und die Verwaltung sieht alle Standorte übersichtlich
            auf einen Blick.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(FILTER_LABEL) as Filter[]).map((k) => {
          const Icon = FILTER_ICON[k];
          return (
            <Button
              key={k}
              size="sm"
              variant={active[k] ? "default" : "secondary"}
              onClick={() => setActive((s) => ({ ...s, [k]: !s[k] }))}
            >
              <Icon className="size-4" /> {FILTER_LABEL[k]} ({counts[k]})
            </Button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="surface h-[520px] overflow-hidden">
          <ClientOnly fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Karte wird geladen …</div>}>
            <Suspense
              fallback={
                <div className="grid h-full place-items-center text-sm text-muted-foreground">
                  Karte wird geladen …
                </div>
              }
            >
              <EinsatzKarte points={points} />
            </Suspense>
          </ClientOnly>
        </div>

        <div className="surface flex max-h-[520px] flex-col overflow-hidden">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold">Standorte ({points.length})</h2>
            <p className="text-xs text-muted-foreground">
              {isPending || geoLoading
                ? "Adressen werden ermittelt …"
                : "Adressen werden über OpenStreetMap ermittelt."}
            </p>
          </div>
          <ul className="divide-y overflow-y-auto">
            {points.map((p) => (
              <li key={p.id} className="px-4 py-3">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.title}</div>
                    <div className="truncate text-sm text-muted-foreground">{p.subtitle}</div>
                    <div className="truncate text-xs text-muted-foreground">{p.address}</div>
                  </div>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0"
                  >
                    <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs">
                      <Navigation className="size-3.5" />
                      {p.kind === "assignment" ? "Navigieren" : "Route"}
                    </Button>
                  </a>
                </div>
              </li>
            ))}
            {points.length === 0 && !isPending && !geoLoading && (
              <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                Keine Adressen gefunden. Bitte Kunden- oder Projektadressen pflegen.
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
