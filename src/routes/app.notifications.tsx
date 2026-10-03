import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlarmClock, Leaf, Boxes, ChefHat, ShoppingCart, Settings2, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePantry } from "@/lib/pantry-store";
import type { NotifCat } from "@/lib/pantry-data";
import { EmptyState, PageHeader } from "@/components/pantry/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/notifications")({
  head: () => ({ meta: [{ title: "Notifications — AI Smart Pantry" }, { name: "description", content: "Expiry, freshness, pantry, recipe and shopping notifications." }, { property: "og:title", content: "Notifications — AI Smart Pantry" }, { property: "og:description", content: "Stay on top of your pantry." }] }),
  component: Notifications,
});

const icons: Record<NotifCat, typeof Leaf> = { Expiry: AlarmClock, Freshness: Leaf, Pantry: Boxes, Recipes: ChefHat, Shopping: ShoppingCart, System: Settings2 };
const cats: ("All" | NotifCat)[] = ["All", "Expiry", "Freshness", "Pantry", "Recipes", "Shopping", "System"];

function Notifications() {
  const { notifs, markRead } = usePantry();
  const [c, setC] = useState<(typeof cats)[number]>("All");
  const list = notifs.filter((n) => c === "All" || n.cat === c);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Notifications" subtitle={`${notifs.filter((n) => !n.read).length} unread`} actions={<Button variant="outline" onClick={() => markRead()}><CheckCheck /> Mark all read</Button>} />
      <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4">
        {cats.map((x) => <button key={x} onClick={() => setC(x)} className={cn("shrink-0 rounded-full border px-4 py-2 text-sm font-medium", c === x ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>{x}</button>)}
      </div>
      {list.length === 0 ? <EmptyState title="You're all caught up" body="No notifications in this category." /> : (
        <ul className="space-y-2">
          {list.map((n) => {
            const I = icons[n.cat];
            return (
              <li key={n.id}>
                <button onClick={() => markRead(n.id)} className={cn("card-surface flex w-full items-center gap-4 p-4 text-left transition-colors", !n.read && "border-primary/30 bg-primary-soft/40")}>
                  <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", n.cat === "Expiry" ? "bg-warn-soft text-warn" : "bg-primary-soft text-primary")}><I className="h-4 w-4" /></span>
                  <span className="flex-1"><span className={cn("block text-sm", !n.read && "font-semibold")}>{n.text}</span><span className="text-xs text-muted-foreground">{n.cat} · {n.time}</span></span>
                  {!n.read && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
