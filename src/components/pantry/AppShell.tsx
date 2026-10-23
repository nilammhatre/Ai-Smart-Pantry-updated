import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Boxes, ScanLine, BellRing, ChefHat, ShoppingCart, HeartPulse, History, BarChart3,
  MessageCircle, Settings, Leaf, Bell, Search, PanelLeftClose, PanelLeftOpen, Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePantry } from "@/lib/pantry-store";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

const nav = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/pantry", label: "My Pantry", icon: Boxes },
  { to: "/app/scan", label: "Scan Food", icon: ScanLine },
  { to: "/app/alerts", label: "Expiry Alerts", icon: BellRing },
  { to: "/app/recipes", label: "Recipes", icon: ChefHat },
  { to: "/app/shopping", label: "Shopping List", icon: ShoppingCart },
  { to: "/app/nutrition", label: "Nutrition", icon: HeartPulse },
  { to: "/app/history", label: "Scan History", icon: History },
  { to: "/app/insights", label: "Insights", icon: BarChart3 },
  { to: "/app/assistant", label: "Pantry AI", icon: MessageCircle },
  { to: "/app/settings", label: "Settings", icon: Settings },
] as const;

function NavList({ collapsed, onNav }: { collapsed?: boolean; onNav?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1">
      {nav.map((n) => {
        const active = "exact" in n ? path === n.to || path === n.to + "/" : path.startsWith(n.to);
        return (
          <Link
            key={n.to} to={n.to} onClick={onNav} title={collapsed ? n.label : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/75 hover:bg-secondary hover:text-sidebar-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            {active && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-primary" />}
            <n.icon className={cn("h-[18px] w-[18px] shrink-0", active && "text-primary")} />
            {!collapsed && n.label}
          </Link>
        );
      })}
    </nav>
  );
}

import { useAuth } from "@/lib/auth-store";
import { UserAuthModal } from "./UserAuthModal";
import { User } from "lucide-react";

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const { user } = useAuth();
  const { notifs } = usePantry();
  const unread = notifs.filter((n) => !n.read).length;
  const path = useRouterState({ select: (s) => s.location.pathname });

  const initial = user ? user.name.charAt(0).toUpperCase() : "?";

  return (
    <div className="flex min-h-screen bg-background">
      <aside className={cn("sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-sidebar p-3 transition-[width] duration-300 lg:flex", collapsed ? "w-[76px]" : "w-64")}>
        <div className={cn("mb-6 flex items-center gap-2 px-2 pt-2", collapsed && "justify-center px-0")}>
          <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-primary-foreground"><Leaf className="h-4 w-4" /></span>
            {!collapsed && "Ai Smart Pantry"}
          </Link>
        </div>
        <div className="no-scrollbar flex-1 overflow-y-auto"><NavList collapsed={collapsed} /></div>
        {!collapsed && user && (
          <div className="mt-4 rounded-2xl bg-brand p-4 text-primary-foreground">
            <p className="text-xs opacity-80">Active User</p>
            <p className="font-display text-lg font-bold truncate">{user.name}</p>
            <button
              onClick={() => setAuthOpen(true)}
              className="mt-2 text-xs font-semibold underline underline-offset-2 opacity-90 hover:opacity-100"
            >
              Switch Profile
            </button>
          </div>
        )}
        <button onClick={() => setCollapsed((c) => !c)} className="mt-3 flex items-center justify-center gap-2 rounded-xl py-2 text-xs text-muted-foreground hover:bg-secondary">
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <><PanelLeftClose className="h-4 w-4" /> Collapse</>}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 glass border-b">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button className="grid h-10 w-10 place-items-center rounded-xl hover:bg-secondary lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
            <div className="relative hidden max-w-sm flex-1 sm:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input placeholder="Search your pantry, recipes…" className="h-10 w-full rounded-full border bg-card pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Link to="/app/notifications" className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-secondary" aria-label="Notifications">
                <Bell className="h-5 w-5" />
                {unread > 0 && <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-spoiled px-1 text-[10px] font-bold text-primary-foreground">{unread}</span>}
              </Link>

              <button
                onClick={() => setAuthOpen(true)}
                title={user ? `Signed in as ${user.name}` : "Log In / Sign Up"}
                className="flex items-center gap-2 rounded-full border bg-card px-2.5 py-1 hover:bg-secondary transition-colors"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-primary-soft font-display text-xs font-bold text-accent-foreground">
                  {initial}
                </span>
                <span className="hidden text-xs font-medium md:inline max-w-[100px] truncate">
                  {user ? user.name : "Guest"}
                </span>
              </button>
            </div>
          </div>
        </header>

        <main key={path} className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-8 animate-fade-in sm:px-6 lg:pb-12">
          {user ? (
            children
          ) : (
            <div className="mx-auto max-w-md card-surface p-8 text-center space-y-4 my-12 animate-rise">
              <User className="mx-auto h-12 w-12 text-primary" />
              <h2 className="text-2xl font-bold font-display">Authentication Required</h2>
              <p className="text-sm text-muted-foreground">Please log in or select a profile to view your AI Smart Pantry and history.</p>
              <button
                onClick={() => setAuthOpen(true)}
                className="w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary/90"
              >
                Log In / Choose Profile
              </button>
            </div>
          )}
        </main>
      </div>

      <UserAuthModal open={authOpen} onOpenChange={setAuthOpen} />

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-4">
          <SheetTitle className="mb-6 flex items-center gap-2 font-display text-lg">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-primary-foreground"><Leaf className="h-4 w-4" /></span> Ai Smart Pantry
          </SheetTitle>
          <NavList onNav={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 glass border-t lg:hidden">
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center">
          {[nav[0], nav[1], null, nav[4], nav[9]].map((n, i) =>
            n ? (
              <Link key={n.to} to={n.to} className={cn("flex flex-col items-center gap-0.5 text-[11px] font-medium", (n.to === "/app" ? path === "/app" : path.startsWith(n.to)) ? "text-primary" : "text-muted-foreground")}>
                <n.icon className="h-5 w-5" />{n.label.replace("My ", "")}
              </Link>
            ) : (
              <Link key={i} to="/app/scan" aria-label="Scan food" className="mx-auto -mt-8 grid h-16 w-16 place-items-center rounded-full bg-brand text-primary-foreground shadow-lift ring-4 ring-background">
                <ScanLine className="h-7 w-7" />
              </Link>
            ),
          )}
        </div>
      </nav>
    </div>
  );
}
