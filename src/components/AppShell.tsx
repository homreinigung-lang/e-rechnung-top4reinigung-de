import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/employee";
import { useIsAdmin } from "@/lib/subscriptions";

import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { AssignmentBell } from "@/components/AssignmentBell";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  BadgeCheck,
  BarChart3,
  Calculator,
  Clock,
  FileSignature,
  FileText,
  FolderKanban,
  HardHat,
  Landmark,
  Map as MapIcon,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  MoreVertical,
  Repeat,
  Settings,
  ShieldCheck,
  Trash2,
  TrendingDown,
  UserCircle,
  Users,
} from "lucide-react";

import type { ReactNode } from "react";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  hash?: string;
};

type NavGroup = { title: string; items: readonly NavItem[] };

const navGroups: readonly NavGroup[] = [
  {
    title: "Allgemein",
    items: [
      { to: "/dashboard", label: "Startseite", icon: LayoutDashboard },
      { to: "/kunden", label: "Kunden", icon: Users },
      { to: "/nachrichten", label: "Interner Chat", icon: MessageSquare },
    ],
  },
  {
    title: "Buchhaltung",
    items: [
      { to: "/dokumente", label: "Rechnungen", icon: FileText },
      { to: "/wiederkehrend", label: "Wiederkehrende Rechnung", icon: Repeat },
      { to: "/dashboard", label: "EÜR", icon: BarChart3, hash: "euer" },
      { to: "/ausgaben", label: "Ausgaben", icon: TrendingDown },
    ],
  },
  {
    title: "Personal",
    items: [
      { to: "/team", label: "Control Center", icon: HardHat },
      { to: "/karte", label: "Einsatzkarte", icon: MapIcon },
    ],
  },
  {
    title: "Vertrieb & Projekte",
    items: [
      { to: "/dokumente", label: "Angebot", icon: FileSignature },
      { to: "/kalkulation", label: "Kalkulation", icon: Calculator },
      { to: "/projekte", label: "Projekte", icon: FolderKanban },
    ],
  },
  {
    title: "Verwaltung",
    items: [
      { to: "/bankverbindung", label: "Bankverbindung", icon: Landmark },
      { to: "/steuerberater", label: "Steuerberater", icon: Calculator },
      { to: "/sicherheit", label: "Sicherheit & Backup", icon: ShieldCheck },
      { to: "/papierkorb", label: "Papierkorb", icon: Trash2 },
      { to: "/mein-paket", label: "Mein Paket", icon: BadgeCheck },
      { to: "/profil", label: "Mein Profil", icon: UserCircle },
      { to: "/einstellungen", label: "Einstellungen", icon: Settings },
      { to: "/hilfe", label: "Hilfe / Support", icon: LifeBuoy },

  },
] as const;

// Menü für Mitarbeiterkonten (nur eigene Zeiten)
const employeeGroups: readonly NavGroup[] = [
  {
    title: "Mein Bereich",
    items: [
      { to: "/meine-zeiten", label: "Meine Zeiten", icon: Clock },
      { to: "/nachrichten", label: "Interner Chat", icon: MessageSquare },
      { to: "/profil", label: "Mein Profil", icon: UserCircle },
    ],
  },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: myEmployee } = useMyEmployee();
  const { data: isAdmin } = useIsAdmin();
  const baseGroups = myEmployee ? employeeGroups : navGroups;
  const groups: readonly NavGroup[] =
    !myEmployee && isAdmin
      ? [
          ...baseGroups,
          {
            title: "Administration",
            items: [{ to: "/admin", label: "Plattform-Admin", icon: BadgeCheck }],
          },
        ]
      : baseGroups;
  const homeTo = groups[0]!.items[0]!.to;

  // Rolle merken: eingeladene Mitarbeitende sehen die Startseite (Marketing) nicht mehr.
  useEffect(() => {
    if (myEmployee === undefined) return;
    try {
      localStorage.setItem("homr:role", myEmployee ? "employee" : "owner");
    } catch {
      /* Speicher nicht verfügbar – unkritisch */
    }
  }, [myEmployee]);

  // Echtzeit-Abgleich mit der Datenbank (Kunden, Rechnungen, Angebote)
  useRealtimeSync();

  // Produktname im Header ist fest – unabhängig von den Firmenstammdaten (Rechnungen etc.)
  const companyName = "GebCalc";

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <header
        className="no-print sticky top-0 z-30 border-b bg-card/80 backdrop-blur"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex max-w-6xl flex-nowrap items-center gap-3 px-3 py-2 sm:px-4 sm:py-3">
          <Link to={homeTo} className="flex items-center gap-2">
            <img
              src="/app-icon-192.png?v=5"
              alt="GebCalc Logo"
              width={32}
              height={32}
              className="size-8 rounded-lg"
            />
            <span className="flex flex-col leading-tight">
              <span className="font-display text-sm font-semibold">{companyName}</span>
              <span className="text-[11px] text-muted-foreground">Rechnungssystem</span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <AssignmentBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Menü öffnen">
                  <MoreVertical className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-[80vh] w-64 overflow-y-auto">
                {groups.map((group, gi) => (
                  <div key={group.title}>
                    {gi > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel>{group.title}</DropdownMenuLabel>
                    {group.items.map((item) => {
                      const active = pathname.startsWith(item.to);
                      return (
                        <DropdownMenuItem key={`${item.to}-${item.label}`} asChild>
                          <Link
                            to={item.to}
                            {...(item.hash ? { hash: item.hash } : {})}
                            className={cn(
                              "flex w-full cursor-pointer items-center gap-2",
                              active && "bg-secondary text-secondary-foreground",
                            )}
                          >
                            <item.icon className="size-4" />
                            <span>{item.label}</span>
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}
                  </div>
                ))}

                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void signOut()}>
                  <LogOut className="size-4" />
                  <span>Abmelden</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-3 py-5 sm:px-4 sm:py-8">{children}</main>

      <footer
        className="no-print border-t py-6"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 text-sm text-muted-foreground">
          <Link to="/rechtliches/impressum" className="hover:text-foreground hover:underline">
            Impressum
          </Link>
          <Link to="/rechtliches/agb" className="hover:text-foreground hover:underline">
            AGB
          </Link>
          <Link to="/rechtliches/datenschutz" className="hover:text-foreground hover:underline">
            Datenschutz
          </Link>
          <Link to="/rechtliches/bibliotheken" className="hover:text-foreground hover:underline">
            Bibliotheken
          </Link>
        </div>
      </footer>
    </div>
  );
}
