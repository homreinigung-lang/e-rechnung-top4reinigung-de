import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BadgeEuro,
  Boxes,
  CalendarDays,
  CalendarRange,
  Clock,
  HardHat,
  WalletCards,
} from "lucide-react";
const EinsatzMeldungen = React.lazy(() => import("@/components/EinsatzMeldungen").then((module) => ({ default: module.EinsatzMeldungen })));
const PersonalStammdatenPanel = React.lazy(() => import("@/components/PersonalStammdatenPanel").then((module) => ({ default: module.PersonalStammdatenPanel })));
const Urlaubsantraege = React.lazy(() => import("@/components/Urlaubsantraege").then((module) => ({ default: module.Urlaubsantraege })));
const MitarbeiterEinladung = React.lazy(() => import("@/components/MitarbeiterEinladung").then((module) => ({ default: module.MitarbeiterEinladung })));
const Arbeitsplanung = React.lazy(() => import("@/components/ArbeitsplanungPanel").then((module) => ({ default: module.Arbeitsplanung })));
const Zeiterfassung = React.lazy(() => import("@/components/ZeiterfassungPanel").then((module) => ({ default: module.Zeiterfassung })));
const TeamKalenderPanel = React.lazy(() => import("@/components/TeamKalenderPanel").then((module) => ({ default: module.TeamKalenderPanel })));
const LohnartenPanel = React.lazy(() => import("@/components/LohnartenPanel").then((module) => ({ default: module.LohnartenPanel })));
const LohnvorbereitungPanel = React.lazy(() => import("@/components/LohnvorbereitungPanel").then((module) => ({ default: module.LohnvorbereitungPanel })));
const Materialverwaltung = React.lazy(() => import("@/components/Materialverwaltung").then((module) => ({ default: module.Materialverwaltung })));

type TeamTab =
  | "dienstplan"
  | "kalender"
  | "personal"
  | "zeiten"
  | "lohnarten"
  | "lohnvorbereitung"
  | "materialien"
  | "meldungen";

type TeamSearch = {
  tab?: TeamTab;
  projekt?: string;
  stunden?: number;
  einsaetze?: number;
};

export const Route = createFileRoute("/_authenticated/team")({
  validateSearch: (search: Record<string, unknown>): TeamSearch => {
    const tab = [
      "dienstplan",
      "kalender",
      "personal",
      "zeiten",
      "lohnarten",
      "lohnvorbereitung",
      "materialien",
      "meldungen",
    ].includes(String(search["tab"]))
      ? (String(search["tab"]) as TeamSearch["tab"])
      : undefined;
    const stunden = Number(search["stunden"]);
    const einsaetze = Number(search["einsaetze"]);
    return {
      ...(tab ? { tab } : {}),
      ...(search["projekt"] ? { projekt: String(search["projekt"]) } : {}),
      ...(Number.isFinite(stunden) && stunden > 0 ? { stunden } : {}),
      ...(Number.isFinite(einsaetze) && einsaetze > 0 ? { einsaetze } : {}),
    };
  },
  head: () => ({
    meta: [
      { title: "Control Center – Team, Planung & Zeiten" },
      {
        name: "description",
        content:
          "Dienstplan, Kalender, Mitarbeiter und Zeiterfassung in einem Control Center – alle Einsätze aus derselben Datenquelle.",
      },
      { property: "og:title", content: "Control Center – Team, Planung & Zeiten" },
      {
        property: "og:description",
        content:
          "Dienstplan erstellen, Verteilung im Kalender prüfen, Personal verwalten und Arbeitszeiten bestätigen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ControlCenter,
});

const TAB_KEY = "homr:teamTab";

function ControlCenter() {
  const search = Route.useSearch();
  const [tab, setTab] = React.useState(search.tab ?? "dienstplan");

  React.useEffect(() => {
    if (search.tab) {
      setTab(search.tab);
      return;
    }
    try {
      const saved = localStorage.getItem(TAB_KEY);
      if (
        saved &&
        [
          "dienstplan",
          "kalender",
          "personal",
          "zeiten",
          "lohnarten",
          "lohnvorbereitung",
          "materialien",
          "meldungen",
        ].includes(saved)
      ) {
        setTab(saved as TeamTab);
      }
    } catch {
      /* Speicher nicht verfügbar – unkritisch */
    }
  }, [search.tab]);

  function change(value: string) {
    const next = value as TeamTab;
    setTab(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      /* unkritisch */
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Control Center</h1>
        <p className="text-sm text-muted-foreground">
          Dienstplan, Kalender, Personal und Zeiterfassung – ohne doppelte Planungsdaten.
        </p>
      </div>

      <Tabs value={tab} onValueChange={change} className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="dienstplan" className="min-h-11 gap-2">
            <CalendarRange className="size-4" /> Dienstplan
          </TabsTrigger>
          <TabsTrigger value="kalender" className="min-h-11 gap-2">
            <CalendarDays className="size-4" /> Kalender
          </TabsTrigger>
          <TabsTrigger value="personal" className="min-h-11 gap-2">
            <HardHat className="size-4" /> Personal
          </TabsTrigger>
          <TabsTrigger value="zeiten" className="min-h-11 gap-2">
            <Clock className="size-4" /> Zeiterfassung
          </TabsTrigger>
          <TabsTrigger value="lohnarten" className="min-h-11 gap-2">
            <BadgeEuro className="size-4" /> Lohnarten
          </TabsTrigger>
          <TabsTrigger value="lohnvorbereitung" className="min-h-11 gap-2">
            <WalletCards className="size-4" /> Lohnvorbereitung
          </TabsTrigger>
          <TabsTrigger value="meldungen" className="min-h-11 gap-2">
            <Boxes className="size-4" /> Meldungen
          </TabsTrigger>
          <TabsTrigger value="materialien" className="min-h-11 gap-2">
            <Boxes className="size-4" /> Materialien
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dienstplan" className="mt-0">
          <React.Suspense fallback={<p role="status" className="p-5 text-sm text-muted-foreground">Bereich wird geladen…</p>}>
          {search.projekt && search.stunden && search.einsaetze ? (
            <Arbeitsplanung
              initialPlan={{
                projectId: search.projekt,
                monthlyHours: search.stunden,
                visitsPerMonth: search.einsaetze,
              }}
            />
          ) : (
            <Arbeitsplanung />
          )}
          </React.Suspense>
        </TabsContent>
        <TabsContent value="kalender" className="mt-0">
          <React.Suspense fallback={<p role="status" className="p-5 text-sm text-muted-foreground">Bereich wird geladen…</p>}>
          <TeamKalenderPanel />
          </React.Suspense>
        </TabsContent>
        <TabsContent value="personal" className="mt-0">
          <React.Suspense fallback={<p role="status" className="p-5 text-sm text-muted-foreground">Bereich wird geladen…</p>}>
          <div className="space-y-4">
            <Urlaubsantraege />
            <PersonalStammdatenPanel />
            <MitarbeiterEinladung />
          </div>
          </React.Suspense>
        </TabsContent>
        <TabsContent value="zeiten" className="mt-0">
          <React.Suspense fallback={<p role="status" className="p-5 text-sm text-muted-foreground">Bereich wird geladen…</p>}>
          <Zeiterfassung />
          </React.Suspense>
        </TabsContent>
        <TabsContent value="lohnarten" className="mt-0">
          <React.Suspense fallback={<p role="status" className="p-5 text-sm text-muted-foreground">Bereich wird geladen…</p>}>
          <LohnartenPanel />
          </React.Suspense>
        </TabsContent>
        <TabsContent value="lohnvorbereitung" className="mt-0">
          <React.Suspense fallback={<p role="status" className="p-5 text-sm text-muted-foreground">Bereich wird geladen…</p>}>
          <LohnvorbereitungPanel />
          </React.Suspense>
        </TabsContent>
        <TabsContent value="meldungen" className="mt-0">
          <React.Suspense fallback={<p role="status" className="p-5 text-sm text-muted-foreground">Bereich wird geladen…</p>}>
          <div className="surface p-5">
            <EinsatzMeldungen />
          </div>
          </React.Suspense>
        </TabsContent>
        <TabsContent value="materialien" className="mt-0">
          <React.Suspense fallback={<p role="status" className="p-5 text-sm text-muted-foreground">Bereich wird geladen…</p>}>
          <Materialverwaltung />
          </React.Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
