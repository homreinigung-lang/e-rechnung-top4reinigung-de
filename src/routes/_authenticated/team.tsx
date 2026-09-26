import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, CalendarRange, Clock, HardHat } from "lucide-react";
import { Personal } from "@/components/PersonalPanel";
import { Arbeitsplanung } from "@/components/ArbeitsplanungPanel";
import { Zeiterfassung } from "@/components/ZeiterfassungPanel";
import { TeamKalenderPanel } from "@/components/TeamKalenderPanel";

export const Route = createFileRoute("/_authenticated/team")({
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
  const [tab, setTab] = React.useState("dienstplan");

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(TAB_KEY);
      if (saved) setTab(saved);
    } catch {
      /* Speicher nicht verfügbar – unkritisch */
    }
  }, []);

  function change(value: string) {
    setTab(value);
    try {
      localStorage.setItem(TAB_KEY, value);
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
        <TabsList className="flex w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="dienstplan" className="gap-2">
            <CalendarRange className="size-4" /> Dienstplan
          </TabsTrigger>
          <TabsTrigger value="kalender" className="gap-2">
            <CalendarDays className="size-4" /> Kalender
          </TabsTrigger>
          <TabsTrigger value="personal" className="gap-2">
            <HardHat className="size-4" /> Personal
          </TabsTrigger>
          <TabsTrigger value="zeiten" className="gap-2">
            <Clock className="size-4" /> Zeiterfassung
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dienstplan" className="mt-0">
          <Arbeitsplanung />
        </TabsContent>
        <TabsContent value="kalender" className="mt-0">
          <TeamKalenderPanel />
        </TabsContent>
        <TabsContent value="personal" className="mt-0">
          <Personal />
        </TabsContent>
        <TabsContent value="zeiten" className="mt-0">
          <Zeiterfassung />
        </TabsContent>
      </Tabs>
    </div>
  );
}
