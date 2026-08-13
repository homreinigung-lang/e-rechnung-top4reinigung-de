import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFileUrl } from "@/hooks/useFileUrl";
import { useMyEmployee } from "@/lib/employee";

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
  Calculator,
  Clock,
  FileText,
  FolderKanban,
  HardHat,
  Landmark,
  LayoutDashboard,
  LogOut,
  MoreVertical,
  Repeat,
  Settings,
  TrendingDown,
  UserCircle,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";


const nav = [
  { to: "/dashboard", label: "Übersicht", icon: LayoutDashboard },
  { to: "/dokumente", label: "Rechnungen & Angebote", icon: FileText },
  { to: "/kalkulation", label: "Kalkulation", icon: Calculator },
  { to: "/projekte", label: "Projekte", icon: FolderKanban },
  { to: "/personal", label: "Personal", icon: HardHat },
  { to: "/wiederkehrend", label: "Wiederkehrend", icon: Repeat },

  { to: "/kunden", label: "Kunden", icon: Users },
  { to: "/zeiterfassung", label: "Zeiterfassung", icon: Clock },
  { to: "/ausgaben", label: "Ausgaben", icon: TrendingDown },
  { to: "/bankverbindung", label: "Bankverbindung", icon: Landmark },
  { to: "/steuerberater", label: "Steuerberater", icon: Calculator },
  { to: "/sicherheit", label: "Sicherheit & Backup", icon: ShieldCheck },
  { to: "/profil", label: "Mein Profil", icon: UserCircle },
  { to: "/einstellungen", label: "Einstellungen", icon: Settings },

] as const;


// Menü für Mitarbeiterkonten (nur eigene Zeiten)
const employeeNav = [
  { to: "/meine-zeiten", label: "Meine Zeiten", icon: Clock },
  { to: "/profil", label: "Mein Profil", icon: UserCircle },
] as const;


export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: myEmployee } = useMyEmployee();
  const menu = myEmployee ? employeeNav : nav;


  const { data: settings } = useQuery({
    queryKey: ["company_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const logoSrc = useFileUrl((settings as { logo_url?: string } | null)?.logo_url);
  const companyName =
    (settings as { company_name?: string } | null)?.company_name || "HomR";

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="no-print sticky top-0 z-30 border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <Link to={menu[0].to} className="flex items-center gap-2">
            {logoSrc ? (
              <img
                src={logoSrc}
                alt={`Logo ${companyName}`}
                className="h-8 w-auto max-w-28 object-contain"
              />
            ) : (
              <img
                src="/app-icon-192.png"
                alt="HomR Logo"
                width={32}
                height={32}
                className="size-8 rounded-lg"
              />
            )}
            <span className="font-display text-sm font-semibold">{companyName}</span>
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Menü öffnen">
                  <MoreVertical className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Menü</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {menu.map((item) => {
                  const active = pathname.startsWith(item.to);
                  return (
                    <DropdownMenuItem key={item.to} asChild>
                      <Link
                        to={item.to}
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

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>

      <footer className="no-print border-t py-6">
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
