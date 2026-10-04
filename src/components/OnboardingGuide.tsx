import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const steps = [
  {
    target: '[data-onboarding="kunden"]',
    title: "Kunden",
    text: "Hier legen Sie Ihren ersten Kunden an und verwalten den Kundenstamm.",
  },
  {
    target: '[data-onboarding="angebot"]',
    title: "Angebote",
    text: "Hier erstellen Sie Angebote und übernehmen vorhandene Daten direkt weiter.",
  },
  {
    target: '[data-onboarding="kalkulation"]',
    title: "Kalkulation",
    text: "Hier kalkulieren Sie Leistungen, Zeiten, Personalaufwand und Preise.",
  },
  {
    target: '[data-onboarding="mehr"]',
    title: "Mitarbeiter & Objekte",
    text: "Unter „Mehr“ finden Sie Control Center, Projekte, Einsatzplanung und weitere Bereiche.",
  },
  {
    target: '[data-onboarding="mehr"]',
    title: "Zeiterfassung",
    text: "Im Control Center erfassen und prüfen Sie Arbeitszeiten Ihrer Mitarbeiter.",
  },
  {
    target: '[data-onboarding="rechnungen"], [data-onboarding="mehr"]',
    title: "Rechnungen & E-Rechnung",
    text: "Hier erstellen Sie Rechnungen und E-Rechnungen aus Ihren vorhandenen Daten.",
  },
] as const;

type Rect = { top: number; left: number; width: number; height: number; bottom: number };

function visibleTarget(selector: string): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
  return (
    nodes.find((node) => {
      const r = node.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
    }) ?? null
  );
}

function localCompletionKey(userId: string) {
  return `homr:onboarding-tour-completed:${userId}`;
}

export function OnboardingGuide() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hash = useRouterState({ select: (s) => s.location.hash });
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const stateQuery = useQuery({
    queryKey: ["onboarding-tour-state"],
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id ?? null;
      if (!userId) return { userId: null, completed: true };

      try {
        if (typeof window !== "undefined" && localStorage.getItem(localCompletionKey(userId)) === "1") {
          return { userId, completed: true };
        }
      } catch {
        /* localStorage may be unavailable; fall back to database state */
      }

      const { data, error } = await supabase
        .from("onboarding_state")
        .select("tour_completed_at")
        .eq("user_id", userId)
        .maybeSingle();

      // Wenn der Datenbankstatus vorübergehend nicht gelesen werden kann,
      // darf die Einführung nicht bei jedem Öffnen der Startseite erneut erscheinen.
      // Wir geben deshalb trotzdem die userId zurück; der Auto-Start markiert die
      // Einführung anschließend sofort lokal als bereits gezeigt.
      if (error) {
        console.error("Einführungsstatus konnte nicht gelesen werden:", error);
        return { userId, completed: false };
      }

      const completed = Boolean(data?.tour_completed_at);
      if (completed) {
        try {
          if (typeof window !== "undefined") localStorage.setItem(localCompletionKey(userId), "1");
        } catch {
          /* noop */
        }
      }
      return { userId, completed };
    },
  });

  useEffect(() => {
    if (hash === "einfuehrung") {
      setStep(0);
      setOpen(true);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      return;
    }

    if (pathname === "/dashboard" && stateQuery.isFetched && !stateQuery.data?.completed) {
      const userId = stateQuery.data?.userId;

      // Die automatische Einführung darf nur ein einziges Mal erscheinen.
      // Sobald sie erstmals automatisch geöffnet wird, merken wir das lokal
      // und kontoweit in Supabase. Manuell kann sie über Hilfe weiterhin
      // jederzeit mit #einfuehrung gestartet werden.
      if (userId) {
        try {
          if (typeof window !== "undefined") localStorage.setItem(localCompletionKey(userId), "1");
        } catch {
          /* noop */
        }

        queryClient.setQueryData(["onboarding-tour-state"], { userId, completed: true });
        const now = new Date().toISOString();
        void supabase
          .from("onboarding_state")
          .upsert(
            { user_id: userId, tour_completed_at: now, updated_at: now },
            { onConflict: "user_id" },
          )
          .then(({ error }) => {
            if (error) console.error("Einführungsstatus konnte nicht gespeichert werden:", error);
          });
      }

      setStep(0);
      setOpen(true);
    }
  }, [hash, pathname, queryClient, stateQuery.isFetched, stateQuery.data?.completed, stateQuery.data?.userId]);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const currentStep = steps[step] ?? steps[0];
      const node = visibleTarget(currentStep.target);
      if (!node) {
        setRect(null);
        return;
      }
      node.scrollIntoView({ block: "nearest", inline: "nearest" });
      const r = node.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom });
    };
    const timer = window.setTimeout(update, 60);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, step]);

  const cardStyle = useMemo(() => {
    if (!rect || typeof window === "undefined") return undefined;
    const width = Math.min(360, window.innerWidth - 32);
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
    const below = rect.bottom + 14;
    const top = below + 230 < window.innerHeight ? below : Math.max(16, rect.top - 230);
    return { width, left, top };
  }, [rect]);

  async function complete() {
    let userId = stateQuery.data?.userId ?? null;

    // Falls die Statusabfrage vorher fehlgeschlagen ist, ermitteln wir die userId
    // hier noch einmal, damit „Später“ und „Verstanden“ zuverlässig gespeichert werden.
    if (!userId) {
      const { data: auth } = await supabase.auth.getUser();
      userId = auth.user?.id ?? null;
    }

    if (userId) {
      try {
        if (typeof window !== "undefined") localStorage.setItem(localCompletionKey(userId), "1");
      } catch {
        /* noop */
      }

      queryClient.setQueryData(["onboarding-tour-state"], { userId, completed: true });

      const now = new Date().toISOString();
      const { error } = await supabase.from("onboarding_state").upsert(
        { user_id: userId, tour_completed_at: now, updated_at: now },
        { onConflict: "user_id" },
      );
      if (!error) {
        await queryClient.invalidateQueries({ queryKey: ["onboarding-tour-state"] });
      }
    }

    setOpen(false);
  }

  if (!open) return null;

  const current = steps[step] ?? steps[0];

  return (
    <div className="no-print fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-black/20" aria-hidden="true" />
      {rect ? (
        <div
          className="pointer-events-none fixed rounded-lg border-2 border-primary bg-primary/5 shadow-[0_0_0_4px_hsl(var(--primary)/0.12)]"
          style={{
            top: Math.max(4, rect.top - 5),
            left: Math.max(4, rect.left - 5),
            width: rect.width + 10,
            height: rect.height + 10,
          }}
        />
      ) : null}
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Einführung"
        className={
          cardStyle
            ? "fixed rounded-xl border bg-card p-5 shadow-2xl"
            : "fixed bottom-20 left-1/2 w-[min(360px,calc(100vw-32px))] -translate-x-1/2 rounded-xl border bg-card p-5 shadow-2xl"
        }
        style={cardStyle}
      >
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="size-4" />
          <span className="text-xs font-semibold uppercase tracking-wide">
            Einführung · {step + 1}/{steps.length}
          </span>
        </div>
        <h2 className="mt-2 text-lg font-semibold">{current.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{current.text}</p>
        <div className="mt-5 flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => void complete()}>
            Später
          </Button>
          <div className="flex gap-2">
            {step > 0 ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setStep((s) => s - 1)}>
                <ChevronLeft className="size-4" /> Zurück
              </Button>
            ) : null}
            {step < steps.length - 1 ? (
              <Button type="button" size="sm" onClick={() => setStep((s) => Math.min(s + 1, steps.length - 1))}>
                Weiter <ChevronRight className="size-4" />
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={() => void complete()}>
                Verstanden
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
