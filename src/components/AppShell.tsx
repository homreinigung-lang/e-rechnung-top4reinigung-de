import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee, isEmployeeAllowedPath } from "@/lib/employee";
import { useIsAdmin } from "@/lib/subscriptions";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { AssignmentBell } from "@/components/AssignmentBell";
import { BewertungDialog } from "@/components/BewertungDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, BadgeCheck, BarChart3, Calculator, Car, Clock, FileSearch,
  FileSignature, FileText, FolderKanban, HardHat, Landmark, LayoutDashboard,
  LifeBuoy, LogOut, Map as MapIcon, MessageSquare, MoreHorizontal, MoreVertical,
  Repeat, Settings, ShieldCheck, Star, Trash2, TrendingDown, UserCircle, Users,
} from "lucide-react";
import type { ReactNode } from "react";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; hash?: string; search?: Record<string, unknown> };
type NavGroup = { title: string; items: readonly NavItem[] };

const quickOwner: readonly NavItem[] = [
  { to: "/dashboard", label: "Startseite", icon: LayoutDashboard },
  { to: "/kunden", label: "Kunden", icon: Users },
  { to: "/dokumente", label: "Angebot", icon: FileSignature, search: { tab: "quote" } },
  { to: "/kalkulation", label: "Kalkulation", icon: Calculator },
  { to: "/dokumente", label: "Rechnungen", icon: FileText, search: { tab: "invoice" } },
];

const ownerMoreGroups: readonly NavGroup[] = [
  { title: "Arbeit", items: [
    { to: "/team", label: "Control Center", icon: HardHat },
    { to: "/karte", label: "Einsatzkarte", icon: MapIcon },
    { to: "/nachrichten", label: "Interner Chat", icon: MessageSquare },
  ]},
  { title: "Projekte & Ausschreibungen", items: [
    { to: "/projekte", label: "Projekte", icon: FolderKanban },
    { to: "/lv-analyse", label: "LV-Analyse", icon: FileSearch },
  ]},
  { title: "Buchhaltung", items: [
    { to: "/dokumente", label: "Rechnungen", icon: FileText, search: { tab: "invoice" } },
    { to: "/wiederkehrend", label: "Wiederkehrende Rechnung", icon: Repeat },
    { to: "/dashboard", label: "EÜR", icon: BarChart3, hash: "euer" },
    { to: "/ausgaben", label: "Ausgaben", icon: TrendingDown },
    { to: "/steuerberater", label: "Steuerberater", icon: Calculator },
  ]},
  { title: "Verwaltung", items: [
    { to: "/bankverbindung", label: "Bankverbindung", icon: Landmark },
    { to: "/sicherheit", label: "Sicherheit & Backup", icon: ShieldCheck },
    { to: "/papierkorb", label: "Papierkorb", icon: Trash2 },
  ]},
  { title: "Konto", items: [
    { to: "/profil", label: "Mein Profil", icon: UserCircle },
    { to: "/einstellungen", label: "Einstellungen", icon: Settings },
    { to: "/mein-paket", label: "Mein Paket", icon: BadgeCheck },
    { to: "/hilfe", label: "Hilfe / Support", icon: LifeBuoy },
  ]},
];

const employeeGroups: readonly NavGroup[] = [{ title: "Mein Bereich", items: [
  { to: "/meine-zeiten", label: "Meine Zeiten", icon: Clock },
  { to: "/nachrichten", label: "Interner Chat", icon: MessageSquare },
  { to: "/profil", label: "Mein Profil", icon: UserCircle },
  { to: "/hilfe", label: "Hilfe / Support", icon: LifeBuoy },
]}];

function isActive(pathname: string, item: NavItem) {
  if (item.to === "/dokumente") return pathname.startsWith("/dokumente");
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: myEmployee } = useMyEmployee();
  const { data: isAdmin } = useIsAdmin();
  const [reviewOpen, setReviewOpen] = useState(false);

  useEffect(() => {
    if (myEmployee === undefined) return;
    try { localStorage.setItem("homr:role", myEmployee ? "employee" : "owner"); } catch { /* noop */ }
  }, [myEmployee]);

  useEffect(() => {
    if (!myEmployee || isEmployeeAllowedPath(pathname)) return;
    navigate({ to: "/meine-zeiten", replace: true });
  }, [myEmployee, pathname, navigate]);

  useRealtimeSync();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const employeeHome = "/meine-zeiten";
  const homeTo = myEmployee ? employeeHome : "/dashboard";
  const showBack = pathname !== homeTo && pathname !== "/dashboard";
  const moreGroups: readonly NavGroup[] = myEmployee
    ? employeeGroups
    : isAdmin
      ? [...ownerMoreGroups, { title: "Administration", items: [{ to: "/admin", label: "Plattform-Admin", icon: BadgeCheck }] }]
      : ownerMoreGroups;

  const mobileItems: readonly NavItem[] = myEmployee
    ? employeeGroups[0]!.items.slice(0, 3)
    : quickOwner.slice(0, 4);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background pb-16 md:pb-0">
      <header className="no-print sticky top-0 z-30 border-b bg-card/90 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2 sm:px-4">
          <Link to={homeTo} className="flex shrink-0 items-center gap-2">
            <img src="/app-icon-192.png?v=5" alt="GebCalc Logo" width={32} height={32} className="size-8 rounded-lg" />
            <span className="hidden flex-col leading-tight sm:flex">
              <span className="font-display text-sm font-semibold">GebCalc</span>
              <span className="text-[11px] text-muted-foreground">Reinigung & Büro</span>
            </span>
          </Link>

          {!myEmployee ? (
            <nav className="ml-3 hidden items-center gap-1 md:flex">
              {quickOwner.map((item) => (
                <Link key={`${item.to}-${item.label}`} to={item.to} {...(item.search ? { search: item.search } : {})}
                  className={cn("rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted", isActive(pathname, item) && "bg-secondary text-secondary-foreground")}
                >{item.label}</Link>
              ))}
            </nav>
          ) : null}

          <div className="ml-auto flex items-center gap-1">
            <AssignmentBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Mehr"><MoreVertical className="size-5" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-[82vh] w-72 overflow-y-auto">
                {moreGroups.map((group, gi) => (
                  <div key={group.title}>
                    {gi > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel>{group.title}</DropdownMenuLabel>
                    {group.items.map((item) => (
                      <DropdownMenuItem key={`${item.to}-${item.label}`} asChild>
                        <Link to={item.to} {...(item.hash ? { hash: item.hash } : {})} {...(item.search ? { search: item.search } : {})}
                          className={cn("flex w-full cursor-pointer items-center gap-2", isActive(pathname, item) && "bg-secondary text-secondary-foreground")}
                        ><item.icon className="size-4" /><span>{item.label}</span></Link>
                      </DropdownMenuItem>
                    ))}
                  </div>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void signOut()}><LogOut className="size-4" /><span>Abmelden</span></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
        {showBack ? (
          <Button type="button" variant="ghost" size="sm" className="no-print mb-3 -ml-2 gap-1.5 text-muted-foreground" onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) window.history.back();
            else navigate({ to: homeTo });
          }}><ArrowLeft className="size-4" />Zurück</Button>
        ) : null}
        {myEmployee && !isEmployeeAllowedPath(pathname) ? (
          <div className="surface p-6 text-sm text-muted-foreground">Dieser Bereich ist dem Unternehmenskonto vorbehalten.</div>
        ) : children}
      </main>

      <footer className="no-print border-t py-5" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}>
        <div className="mx-auto flex max-w-7xl flex-wrap gap-x-4 gap-y-2 px-4 text-sm text-muted-foreground">
          <Link to="/rechtliches/impressum" className="hover:underline">Impressum</Link>
          <Link to="/rechtliches/agb" className="hover:underline">AGB</Link>
          <Link to="/rechtliches/datenschutz" className="hover:underline">Datenschutz</Link>
        </div>
      </footer>

      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {mobileItems.map((item) => (
            <Link key={`${item.to}-${item.label}`} to={item.to} {...(item.search ? { search: item.search } : {})}
              className={cn("flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[11px] text-muted-foreground", isActive(pathname, item) && "text-primary")}
            ><item.icon className="size-5" /><span className="truncate">{item.label}</span></Link>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" className="flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[11px] text-muted-foreground"><MoreHorizontal className="size-5" /><span>Mehr</span></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="max-h-[70vh] w-72 overflow-y-auto">
              {moreGroups.map((group, gi) => (
                <div key={group.title}>{gi > 0 && <DropdownMenuSeparator />}<DropdownMenuLabel>{group.title}</DropdownMenuLabel>{group.items.map((item) => (
                  <DropdownMenuItem key={`${item.to}-${item.label}`} asChild><Link to={item.to} {...(item.hash ? { hash: item.hash } : {})} {...(item.search ? { search: item.search } : {})} className="flex items-center gap-2"><item.icon className="size-4" />{item.label}</Link></DropdownMenuItem>
                ))}</div>
              ))}
              <DropdownMenuSeparator /><DropdownMenuItem onSelect={() => void signOut()}><LogOut className="size-4" />Abmelden</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>

      <div className="no-print fixed right-4 z-30 hidden flex-col items-end gap-2 md:flex" style={{ bottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}>
        {!myEmployee ? <button type="button" onClick={() => setReviewOpen(true)} className="inline-flex items-center gap-2 rounded-full border bg-card/90 px-3.5 py-2.5 text-sm shadow-lg"><Star className="size-4" />Bewertung</button> : null}
        <Link to="/hilfe" className="inline-flex items-center gap-2 rounded-full border bg-card/90 px-3.5 py-2.5 text-sm shadow-lg"><LifeBuoy className="size-4" />Hilfe</Link>
      </div>
      {!myEmployee ? <BewertungDialog open={reviewOpen} onOpenChange={setReviewOpen} /> : null}
    </div>
  );
}
