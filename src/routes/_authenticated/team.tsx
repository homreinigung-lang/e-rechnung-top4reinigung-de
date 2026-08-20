import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarRange, Clock, HardHat } from "lucide-react";
import { Personal } from "@/components/PersonalPanel";
import { Arbeitsplanung } from "@/components/ArbeitsplanungPanel";
import { Zeiterfassung } from "@/components/ZeiterfassungPanel";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Control Center – Team, Planung & Zeiten" },
      {
        name: "description",
        content:
          "Ein zentrales Dashboard für Mitarbeiter, Einsatzplanung und Zeiterfassung: Schichten planen, bestätigen und Stunden auswerten.",
      },
      { property: "og:title", content: "Control Center – Team, Planung & Zeiten" },
      {
        property: "og:description",
        content:
          "Mitarbeiter anlegen, Schichten planen und Arbeitszeiten bestätigen – alles in einer Ansicht.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ControlCenter,
});

const TAB_KEY = "homr:teamTab";

function ControlCenter() {
  const [tab, setTab] = React.useState("kalender");

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
          Mitarbeiter, Einsatzplanung und Zeiterfassung in einer Oberfläche.
        </p>
      </div>

      <Tabs value={tab} onValueChange={change} className="space-y-4">
        <TabsList className="flex w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="kalender" className="gap-2">
            <HardHat className="size-4" /> Team &amp; Kalender
          </TabsTrigger>
          <TabsTrigger value="planung" className="gap-2">
            <CalendarRange className="size-4" /> Wochenplanung
          </TabsTrigger>
          <TabsTrigger value="zeiten" className="gap-2">
            <Clock className="size-4" /> Zeiterfassung
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kalender" className="mt-0">
          <Personal />
        </TabsContent>
        <TabsContent value="planung" className="mt-0">
          <Arbeitsplanung />
        </TabsContent>
        <TabsContent value="zeiten" className="mt-0">
          <Zeiterfassung />
        </TabsContent>
      </Tabs>
    </div>
  );
}
