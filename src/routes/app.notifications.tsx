import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlarmClock, Leaf, Boxes, ChefHat, ShoppingCart, Settings2,
  CheckCheck, ShieldAlert, ArrowUpRight, X, Bell
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePantry } from "@/lib/pantry-store";
import type { NotifCat } from "@/lib/pantry-data";
import { EmptyState, PageHeader } from "@/components/pantry/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — AI Smart Pantry" },
      { name: "description", content: "Expiry, freshness, pantry, recipe and shopping notifications." },
      { property: "og:title", content: "Notifications — AI Smart Pantry" },
      { property: "og:description", content: "Stay on top of your pantry." }
    ]
  }),
  component: Notifications,
});

const icons: Record<NotifCat, typeof Leaf> = {
  Expiry: AlarmClock,
  Freshness: Leaf,
  Pantry: Boxes,
  Recipes: ChefHat,
  Shopping: ShoppingCart,
  System: Settings2
};

const cats: ("All" | NotifCat)[] = ["All", "Expiry", "Freshness", "Pantry", "Recipes", "Shopping", "System"];

const priorityBadges = {
  CRITICAL: "bg-spoiled-soft text-spoiled border-spoiled/30",
  HIGH: "bg-warn-soft text-warn border-warn/30",
  MEDIUM: "bg-primary-soft text-primary border-primary/20",
  LOW: "bg-muted text-muted-foreground border-border"
};

function Notifications() {
  const { notifs, markRead, dismissNotif } = usePantry();
  const [c, setC] = useState<(typeof cats)[number]>("All");
  const [priorityFilter, setPriorityFilter] = useState<string>("All");

  const unreadCount = notifs.filter((n) => !n.read && !n.dismissed).length;

  const list = notifs.filter((n) => {
    if (n.dismissed) return false;
    const catMatch = c === "All" || n.cat === c;
    const prioMatch = priorityFilter === "All" || n.priority === priorityFilter;
    return catMatch && prioMatch;
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notification Center"
        subtitle={`${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}
        actions={
          unreadCount > 0 ? (
            <Button variant="outline" onClick={() => markRead()}>
              <CheckCheck className="mr-1.5 h-4 w-4" /> Mark all read
            </Button>
          ) : undefined
        }
      />

      {/* Category filters */}
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {cats.map((x) => (
          <button
            key={x}
            onClick={() => setC(x)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
              c === x ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-secondary"
            )}
          >
            {x}
          </button>
        ))}
      </div>

      {/* Priority quick filters */}
      <div className="mb-6 flex items-center gap-2 text-xs">
        <span className="text-muted-foreground font-medium">Priority:</span>
        {["All", "CRITICAL", "HIGH", "MEDIUM"].map((p) => (
          <button
            key={p}
            onClick={() => setPriorityFilter(p)}
            className={cn(
              "rounded-md px-2 py-1 font-semibold transition-colors",
              priorityFilter === p ? "bg-muted text-foreground underline underline-offset-4" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {p === "All" ? "All Priorities" : p}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState title="You're all caught up" body="No notifications in this filter." />
      ) : (
        <ul className="space-y-3">
          {list.map((n) => {
            const I = n.priority === "CRITICAL" ? ShieldAlert : (icons[n.cat] || Bell);
            const prio = n.priority || "MEDIUM";

            return (
              <li key={n.id} className="animate-rise">
                <div
                  className={cn(
                    "card-surface relative flex items-start gap-4 p-4 transition-colors",
                    !n.read && "border-primary/40 bg-primary-soft/20",
                    prio === "CRITICAL" && "border-spoiled/40 bg-spoiled-soft/10"
                  )}
                >
                  <span
                    className={cn(
                      "grid h-10 w-10 shrink-0 place-items-center rounded-2xl",
                      prio === "CRITICAL"
                        ? "bg-spoiled-soft text-spoiled"
                        : n.cat === "Expiry"
                        ? "bg-warn-soft text-warn"
                        : "bg-primary-soft text-primary"
                    )}
                  >
                    <I className="h-5 w-5" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase", priorityBadges[prio as keyof typeof priorityBadges] || priorityBadges.MEDIUM)}>
                        {prio}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {n.cat} · {n.time}
                      </span>
                    </div>

                    <p className={cn("text-sm text-foreground", !n.read && "font-semibold")}>
                      {n.text}
                    </p>

                    <div className="mt-2.5 flex items-center gap-3">
                      {n.actionUrl ? (
                        <Link
                          to={n.actionUrl}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                        >
                          View Food Item <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      ) : null}

                      {!n.read ? (
                        <button
                          onClick={() => markRead(n.id)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Mark read
                        </button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground italic">Read</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!n.read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                    <button
                      onClick={() => dismissNotif(n.id)}
                      className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                      title="Dismiss notification"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
