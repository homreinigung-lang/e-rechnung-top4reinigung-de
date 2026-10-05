import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee, isEmployeeAllowedPath } from "@/lib/employee";
import { subscriptionAllowsPath, useIsAdmin, useMySubscriptionAccess } from "@/lib/subscriptions";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { AssignmentBell } from "@/components/AssignmentBell";
import { Vertretungswarnungen } from "@/components/Vertretungswarnungen";
import { BewertungDialog } from "@/components/BewertungDialog";
import { OnboardingGuide } from "@/components/OnboardingGuide";
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
  ArrowLeft,
  BadgeCheck,
  BarChart3,
  Calculator,
  Car,
  ClipboardCheck,
  Clock,
  FileSearch,
  FileText,
  FolderKanban,
  HardHat,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Map as MapIcon,
  MessageSquare,
  MoreHorizontal,
  Package,
  Repeat,
  Settings,
  ShieldCheck,
  Star,
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
  search?: Record<string, unknown>;
};
type NavGroup = { title: string; icon?: typeof LayoutDashboard; items: readonly NavItem[] };

const quickOwner: readonly NavItem[] = [
  { to: "/dashboard", label: "Startseite", icon: LayoutDashboard },
  { to: "/kunden", label: "Kunden", icon: Users },
  { to: "/projekte", label: "Objekte", icon: FolderKanban },
  { to: "/kalkulation", label: "Kalkulation", icon: Calculator },
  { to: "/dokumente", label: "Dokumente", icon: FileText },
];

const ownerMoreGroups: readonly NavGroup[] = [
  {
    title: "Arbeit",
    icon: HardHat,
    items: [
      { to: "/team", label: "Control Center", icon: HardHat },
      { to: "/karte", label: "Einsatzkarte", icon: MapIcon },
      { to: "/fahrtenbuch", label: "Fahrtenbuch", icon: Car },
      { to: "/team", label: "Materialien", icon: Package, search: { tab: "materialien" } },
      { to: "/qm-reklamationen", label: "QM / Reklamationen", icon: ClipboardCheck },
      { to: "/nachrichten", label: "Interner Chat", icon: MessageSquare },
    ],
  },
  {
    title: "Ausschreibungen",
    icon: FileSearch,
    items: [{ to: "/lv-analyse", label: "LV-Analyse", icon: FileSearch }],
  },
  {
    title: "Buchhaltung",
    icon: BarChart3,
    items: [
      { to: "/dashboard", label: "Übersicht", icon: BarChart3 },
      { to: "/wiederkehrend", label: "Wiederkehrende Rechnung", icon: Repeat },
      { to: "/ausgaben", label: "Ausgaben", icon: TrendingDown },
      { to: "/steuerberater", label: "Steuerberater", icon: Calculator },
      { to: "/bankverbindung", label: "Bankverbindung", icon: Landmark },
    ],
  },
  {
    title: "Verwaltung",
    icon: Settings,
    items: [
      { to: "/profil", label: "Mein Profil", icon: UserCircle },
      { to: "/einstellungen", label: "Einstellungen", icon: Settings },
      { to: "/sicherheit", label: "Sicherheit & Backup", icon: ShieldCheck },
      { to: "/papierkorb", label: "Papierkorb", icon: Trash2 },
      { to: "/mein-paket", label: "Mein Paket", icon: BadgeCheck },
      { to: "/hilfe", label: "Hilfe / Support", icon: LifeBuoy },
    ],
  },
];

const employeeGroups: readonly NavGroup[] = [
  {
    title: "Mein Bereich",
    items: [
      { to: "/mein-bereich", label: "Heute", icon: LayoutDashboard },
      { to: "/meine-zeiten", label: "Meine Zeiten", icon: Clock },
      { to: "/nachrichten", label: "Interner Chat", icon: MessageSquare },
      { to: "/profil", label: "Mein Profil", icon: UserCircle },
      { to: "/hilfe", label: "Hilfe / Support", icon: LifeBuoy },
    ],
  },
];

function isActive(pathname: string, item: NavItem) {
  if (item.to === "/dokumente") return pathname.startsWith("/dokumente");
  if (item.to === "/dashboard") return pathname === "/dashboard";
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: myEmployee, isLoading: employeeLoading } = useMyEmployee();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const { data: subscriptionAccess, isLoading: subscriptionLoading } = useMySubscriptionAccess();
  const [reviewOpen, setReviewOpen] = useState(false);

  useEffect(() => {
    if (myEmployee === undefined) return;
    try {
      localStorage.setItem("homr:role", myEmployee ? "employee" : "owner");
    } catch {
      /* noop */
    }
  }, [myEmployee]);

  useEffect(() => {
    if (!myEmployee || isEmployeeAllowedPath(pathname)) return;
    navigate({ to: "/mein-bereich", replace: true });
  }, [myEmployee, pathname, navigate]);

  const subscriptionAllowed =
    Boolean(isAdmin) || subscriptionAllowsPath(subscriptionAccess ?? null, pathname);

  useEffect(() => {
    if (
      subscriptionLoading ||
      employeeLoading ||
      adminLoading ||
      isAdmin ||
      myEmployee ||
      pathname.startsWith("/mein-paket")
    )
      return;
    if (!subscriptionAllowed) {
      navigate({ to: "/mein-paket", replace: true });
    }
  }, [
    subscriptionAllowed,
    subscriptionLoading,
    employeeLoading,
    adminLoading,
    isAdmin,
    myEmployee,
    pathname,
    navigate,
  ]);

  useRealtimeSync();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const employeeHome = "/mein-bereich";
  const homeTo = myEmployee ? employeeHome : "/dashboard";
  const showBack = pathname !== homeTo && pathname !== "/dashboard";

  const filterAllowedItems = (groups: readonly NavGroup[]): NavGroup[] =>
    groups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => Boolean(isAdmin) || subscriptionAllowsPath(subscriptionAccess ?? null, item.to),
        ),
      }))
      .filter((group) => group.items.length > 0);

  const ownerGroups = filterAllowedItems(ownerMoreGroups).map((group) =>
    isAdmin && group.title === "Verwaltung"
      ? {
          ...group,
          items: [
            ...group.items,
            { to: "/admin", label: "Plattform-Admin", icon: BadgeCheck },
          ],
        }
      : group,
  );
  const employeeMenuGroups = filterAllowedItems(employeeGroups);

  const allowedQuickOwner = quickOwner.filter(
    (item) => Boolean(isAdmin) || subscriptionAllowsPath(subscriptionAccess ?? null, item.to),
  );
  const mobileItems: readonly NavItem[] = myEmployee
    ? employeeMenuGroups[0]?.items.slice(0, 4) ?? []
    : allowedQuickOwner.slice(0, 4);

  const renderOwnerMoreMenu = () => (
    <>
      {ownerGroups.map((group, groupIndex) => {
        const GroupIcon = group.icon ?? Settings;
        return (
          <div key={group.title}>
            {groupIndex > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="flex items-center gap-2 px-2 py-1.5">
              <GroupIcon className="size-4 shrink-0" />
              <span>{group.title}</span>
            </DropdownMenuLabel>
            {group.items.map((item) => (
              <DropdownMenuItem key={`${item.to}-${item.label}`} asChild>
                <Link
                  to={item.to}
                  {...(item.hash ? { hash: item.hash } : {})}
                  {...(item.search ? { search: item.search } : {})}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2",
                    isActive(pathname, item) && "bg-secondary text-secondary-foreground",
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  <span className="min-w-0 truncate">{item.label}</span>
                </Link>
              </DropdownMenuItem>
            ))}
          </div>
        );
      })}
    </>
  );

  const renderEmployeeMoreMenu = () => (
    <>
      {employeeMenuGroups.map((group, gi) => (
        <div key={group.title}>
          {gi > 0 && <DropdownMenuSeparator />}
          <DropdownMenuLabel>{group.title}</DropdownMenuLabel>
          {group.items.map((item) => (
            <DropdownMenuItem key={`${item.to}-${item.label}`} asChild>
              <Link
                to={item.to}
                {...(item.hash ? { hash: item.hash } : {})}
                {...(item.search ? { search: item.search } : {})}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2",
                  isActive(pathname, item) && "bg-secondary text-secondary-foreground",
                )}
              >
                <item.icon className="size-4" />
                <span>{item.label}</span>
              </Link>
            </DropdownMenuItem>
          ))}
        </div>
      ))}
    </>
  );

  const renderSidebarItem = (item: NavItem) => (
    <Link
      key={`${item.to}-${item.label}`}
      to={item.to}
      {...(item.hash ? { hash: item.hash } : {})}
      {...(item.search ? { search: item.search } : {})}
      className={cn(
        "flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted",
        isActive(pathname, item)
          ? "bg-secondary font-medium text-secondary-foreground"
          : "text-muted-foreground",
      )}
    >
      <item.icon className="size-4 shrink-0" />
      <span className="min-w-0 truncate">{item.label}</span>
    </Link>
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-background pb-16 md:pb-0">
      <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-card md:flex">
        <div className="border-b px-4 py-4">
          <Link to={homeTo} className="flex items-center gap-3">
            <img
              src="/app-icon-192.png?v=5"
              alt="GebCalc Logo"
              width={36}
              height={36}
              className="size-9 rounded-lg"
            />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="font-display text-sm font-semibold">GebCalc</span>
              <span className="text-[11px] text-muted-foreground">Reinigung & Büro</span>
            </span>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          {!myEmployee ? (
            <>
              <nav className="space-y-1">{allowedQuickOwner.map(renderSidebarItem)}</nav>
              <div className="my-4 border-t" />
              <div className="space-y-5">
                {ownerGroups.map((group) => {
                  const GroupIcon = group.icon ?? Settings;
                  return (
                    <section key={group.title}>
                      <div className="mb-1.5 flex items-center gap-2 px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                        <GroupIcon className="size-3.5" />
                        <span>{group.title}</span>
                      </div>
                      <nav className="space-y-1">{group.items.map(renderSidebarItem)}</nav>
                    </section>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="space-y-5">
              {employeeMenuGroups.map((group) => (
                <section key={group.title}>
                  <div className="mb-1.5 px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {group.title}
                  </div>
                  <nav className="space-y-1">{group.items.map(renderSidebarItem)}</nav>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="border-t p-3">
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4" />
            <span>Abmelden</span>
          </button>
        </div>
      </aside>

      <div className="md:pl-64">
        <header
          className="no-print sticky top-0 z-30 border-b bg-card/90 backdrop-blur"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2 sm:px-4">
            <Link to={homeTo} className="flex shrink-0 items-center gap-2 md:hidden">
              <img
                src="/app-icon-192.png?v=5"
                alt="GebCalc Logo"
                width={32}
                height={32}
                className="size-8 rounded-lg"
              />
              <span className="flex flex-col leading-tight">
                <span className="font-display text-sm font-semibold">GebCalc</span>
                <span className="text-[11px] text-muted-foreground">Reinigung & Büro</span>
              </span>
            </Link>

            <div className="ml-auto flex items-center gap-1">
              {!myEmployee ? <Vertretungswarnungen /> : null}
              <AssignmentBell />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
          {showBack ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="no-print mb-3 -ml-2 gap-1.5 text-muted-foreground"
              onClick={() => {
                if (typeof window !== "undefined" && window.history.length > 1)
                  window.history.back();
                else navigate({ to: homeTo });
              }}
            >
              <ArrowLeft className="size-4" /> Zurück
            </Button>
          ) : null}
          {(subscriptionLoading || employeeLoading || adminLoading) && !isAdmin ? (
            <div className="surface p-6 text-sm text-muted-foreground">
              Kontozugriff wird geprüft …
            </div>
          ) : !isAdmin && !subscriptionAllowed && !pathname.startsWith("/mein-paket") ? (
            <div className="surface p-6 text-sm text-muted-foreground">
              Dieser Bereich ist mit dem aktuellen Paket oder nach Ablauf der Testphase nicht
              verfügbar.
            </div>
          ) : myEmployee && !isEmployeeAllowedPath(pathname) ? (
            <div className="surface p-6 text-sm text-muted-foreground">
              Dieser Bereich ist dem Unternehmenskonto vorbehalten.
            </div>
          ) : (
            children
          )}
        </main>

        <footer
          className="no-print border-t py-5"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
        >
          <div className="mx-auto flex max-w-7xl flex-wrap gap-x-4 gap-y-2 px-4 text-sm text-muted-foreground">
            <Link to="/rechtliches/impressum" className="hover:underline">
              Impressum
            </Link>
            <Link to="/rechtliches/agb" className="hover:underline">
              AGB
            </Link>
            <Link to="/rechtliches/datenschutz" className="hover:underline">
              Datenschutz
            </Link>
          </div>
        </footer>
      </div>

      <nav
        className="no-print fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {mobileItems.map((item) => (
            <Link
              key={`${item.to}-${item.label}`}
              to={item.to}
              {...(item.search ? { search: item.search } : {})}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[11px] text-muted-foreground",
                isActive(pathname, item) && "text-primary",
              )}
            >
              <item.icon className="size-5" />
              <span className="truncate">{item.label}</span>
            </Link>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                data-onboarding="mehr"
                type="button"
                className="flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[11px] text-muted-foreground"
              >
                <MoreHorizontal className="size-5" />
                <span>Mehr</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" sideOffset={8} className="max-h-[70vh] w-[min(20rem,calc(100vw-1rem))] overflow-y-auto">
              {myEmployee ? renderEmployeeMoreMenu() : renderOwnerMoreMenu()}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void signOut()}>
                <LogOut className="size-4" />
                <span>Abmelden</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>

      <div
        className="no-print fixed right-4 z-30 hidden flex-col items-end gap-2 md:flex"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
      >
        {!myEmployee ? (
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border bg-card/90 px-3.5 py-2.5 text-sm shadow-lg"
          >
            <Star className="size-4" /> Bewertung
          </button>
        ) : null}
        <Link
          to="/hilfe"
          className="inline-flex items-center gap-2 rounded-full border bg-card/90 px-3.5 py-2.5 text-sm shadow-lg"
        >
          <LifeBuoy className="size-4" /> Hilfe
        </Link>
      </div>
      {!myEmployee ? <BewertungDialog open={reviewOpen} onOpenChange={setReviewOpen} /> : null}
      <OnboardingGuide />
    </div>
  );
}
