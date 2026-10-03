import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { BellRing, CalendarPlus, MessageCircle, Bell, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { usePantry } from "@/lib/pantry-store";
import { daysLabel, type PantryItem } from "@/lib/pantry-data";
import { EmptyState, FoodThumb, PageHeader } from "@/components/pantry/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/alerts")({
  head: () => ({ meta: [{ title: "Expiry Alerts — AI Smart Pantry" }, { name: "description", content: "Everything expiring today, this week and already expired." }, { property: "og:title", content: "Expiry Alerts — AI Smart Pantry" }, { property: "og:description", content: "Smart reminders before food goes bad." }] }),
  component: Alerts,
});

const groups = [
  { title: "Expiring today", test: (d: number) => d === 0, tone: "spoiled" as const, label: "Critical" },
  { title: "Expiring in 1–3 days", test: (d: number) => d >= 1 && d <= 3, tone: "warn" as const, label: "High" },
  { title: "Expiring this week", test: (d: number) => d >= 4 && d <= 7, tone: "good" as const, label: "Medium" },
  { title: "Already expired", test: (d: number) => d < 0, tone: "spoiled" as const, label: "Expired" },
];
const toneCls = { spoiled: "bg-spoiled-soft text-spoiled", warn: "bg-warn-soft text-warn", good: "bg-good-soft text-good" };
const barCls = { spoiled: "bg-spoiled", warn: "bg-warn", good: "bg-good" };

function Alerts() {
  const { items, toggleReminder } = usePantry();
  const [ch, setCh] = useState({ app: true, cal: true, wa: false });

  return (
    <div>
      <PageHeader eyebrow="Smart alerts" title="Expiry & alerts" subtitle="Ordered by urgency so you always know what to eat next." />
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          {groups.map((g) => {
            const list = items.filter((i) => g.test(i.expiresInDays));
            return (
              <section key={g.title} className="animate-rise">
                <div className="mb-3 flex items-center gap-3"><h2 className="text-lg font-semibold">{g.title}</h2><span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", toneCls[g.tone])}>{list.length}</span></div>
                {list.length === 0 ? <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Nothing here — nice.</p> : (
                  <div className="space-y-3">{list.map((i) => <AlertCard key={i.id} item={i} tone={g.tone} label={g.label} onRemind={() => { toggleReminder(i.id); toast.success(i.reminder ? "Reminder removed." : "Reminder set."); }} />)}</div>
                )}
              </section>
            );
          })}
          {items.length === 0 && <EmptyState title="No alerts yet" body="Add food to your pantry and we'll watch the dates for you." />}
        </div>
        <aside className="card-surface h-fit p-6 lg:sticky lg:top-24">
          <h3 className="font-semibold">Reminder channels</h3>
          <p className="mt-1 text-sm text-muted-foreground">Choose how you'd like to be nudged.</p>
          <div className="mt-5 space-y-4">
            {([["app", Bell, "In-app notifications", "Active"], ["cal", CalendarPlus, "Google Calendar", "Connected (demo)"], ["wa", MessageCircle, "WhatsApp reminders", "Not connected"]] as const).map(([k, I, l, s]) => (
              <label key={k} className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary"><I className="h-4 w-4" /></span>
                <span className="flex-1"><span className="block text-sm font-medium">{l}</span><span className="text-xs text-muted-foreground">{ch[k] ? s.replace("Not connected", "Enabled (demo)") : "Off"}</span></span>
                <Switch checked={ch[k]} onCheckedChange={(v) => setCh({ ...ch, [k]: v })} />
              </label>
            ))}
          </div>
          <p className="mt-5 rounded-xl bg-muted p-3 text-xs text-muted-foreground">Deleting an item from your pantry also removes its calendar reminder.</p>
          <Button asChild variant="link" className="mt-2 px-0"><Link to="/app/notifications">Open notification center</Link></Button>
        </aside>
      </div>
    </div>
  );
}

function AlertCard({ item, tone, label, onRemind }: { item: PantryItem; tone: keyof typeof toneCls; label: string; onRemind: () => void }) {
  return (
    <div className="card-surface lift relative flex flex-col gap-4 overflow-hidden p-4 pl-5 sm:flex-row sm:items-center">
      <span className={cn("absolute inset-y-0 left-0 w-1.5", barCls[tone])} />
      <Link to="/app/pantry/$id" params={{ id: item.id }} className="flex flex-1 items-center gap-4">
        <FoodThumb item={item} className="h-14 w-14 shrink-0 rounded-2xl" />
        <div className="min-w-0">
          <p className="font-semibold">{item.name} {item.expiresInDays >= 0 ? (item.expiresInDays === 0 ? "expires today" : `expires in ${item.expiresInDays} day${item.expiresInDays > 1 ? "s" : ""}`) : "has expired"}</p>
          <p className="text-sm text-muted-foreground">{item.quantity} · {daysLabel(item.expiresInDays)} · {item.freshness}% fresh</p>
        </div>
      </Link>
      <div className="flex items-center gap-2">
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", toneCls[tone])}>{label}</span>
        <Button size="sm" variant={item.reminder ? "soft" : "outline"} onClick={onRemind}>{item.reminder ? <><Check /> Reminder set</> : <><BellRing /> Set Reminder</>}</Button>
        <Button size="sm" variant="ghost" onClick={() => toast.success("Added to Google Calendar (demo).")}><CalendarPlus /><span className="hidden sm:inline">Add to Calendar</span></Button>
      </div>
    </div>
  );
}
