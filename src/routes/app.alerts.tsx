import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Bell, Check, ShieldAlert, CheckCircle2,
  CalendarPlus, MessageCircle, ChefHat, Trash2, Share2
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { usePantry } from "@/lib/pantry-store";
import { daysLabel, getDeterministicDaysLeft, getExpiryBadge, getExpiryCategory, type PantryItem } from "@/lib/pantry-data";
import { EmptyState, FoodThumb, PageHeader } from "@/components/pantry/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/alerts")({
  head: () => ({
    meta: [
      { title: "Expiry & Food Safety Alerts — AI Smart Pantry" },
      { name: "description", content: "Track food that needs attention soon, prevent waste, and cook with fresh ingredients." },
      { property: "og:title", content: "Expiry & Food Safety Alerts — AI Smart Pantry" },
      { property: "og:description", content: "Smart kitchen reminders before food goes bad." }
    ]
  }),
  component: Alerts,
});

function humanFreshness(item: PantryItem): string {
  const daysLeft = getDeterministicDaysLeft(item);
  if (item.hasCriticalSpoilage || item.spoilageStatus === "SPOILED" || daysLeft < 0) {
    return "Expired (Discard)";
  }
  if (daysLeft === 0) {
    return "Expires today (Use Immediately)";
  }
  if (daysLeft === 1) {
    return "Expires tomorrow";
  }
  if (daysLeft <= 3) {
    return `Expires in ${daysLeft} days`;
  }
  return "Fresh stock";
}

const strictGroups = [
  {
    title: "Expired Items",
    test: (daysLeft: number) => daysLeft < 0,
    badgeText: "Expired (Discard)",
    badgeCls: "bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30",
    barCls: "bg-red-500",
    isExpired: true
  },
  {
    title: "Expiring Today",
    test: (daysLeft: number) => daysLeft === 0,
    badgeText: "Use Immediately",
    badgeCls: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border border-orange-500/30",
    barCls: "bg-orange-500",
    isExpired: false
  },
  {
    title: "Expiring in 1–3 Days",
    test: (daysLeft: number) => daysLeft >= 1 && daysLeft <= 3,
    badgeText: "Expiring in 1–3 Days",
    badgeCls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30",
    barCls: "bg-amber-500",
    isExpired: false
  },
  {
    title: "Fresh Stock",
    test: (daysLeft: number) => daysLeft > 3,
    badgeText: "Fresh Stock",
    badgeCls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30",
    barCls: "bg-emerald-500",
    isExpired: false
  }
];

function Alerts() {
  const { items, consumeItem, removeItem } = usePantry();
  const [settings, setSettings] = useState({
    channel_in_app: true,
    channel_google_calendar: true,
    channel_whatsapp: true,
    remind_3_days_before: true,
    remind_1_day_before: true,
    remind_on_due_date: true,
    remind_overdue: true,
  });

  useEffect(() => {
    fetch("/api/settings")
      .then(res => res.json())
      .then(data => {
        if (data.settings) {
          setSettings(prev => ({ ...prev, ...data.settings }));
        }
      })
      .catch(() => {});
  }, []);

  const updateSetting = async (key: string, value: boolean) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value })
      });
      toast.success("Reminder preferences updated.");
    } catch {
      toast.error("Failed to update setting");
    }
  };

  const handleMarkUsed = async (item: PantryItem) => {
    try {
      await consumeItem(item.id);
      toast.success(`Marked ${item.name} as used! Great job preventing waste.`, {
        icon: <Check className="h-4 w-4 text-emerald-500" />
      });
    } catch (err: any) {
      toast.error(`Could not update item: ${err.message}`);
    }
  };

  const handleDiscard = async (item: PantryItem) => {
    try {
      await removeItem(item.id);
      toast.info(`Removed ${item.name} from pantry.`);
    } catch (err: any) {
      toast.error(`Could not remove item: ${err.message}`);
    }
  };

  const handleShare = (item: PantryItem) => {
    const text = `🍽️ Smart Pantry Reminder: ${item.name} (${item.quantity}) needs attention! ${humanFreshness(item)}.`;
    if (navigator.share) {
      navigator.share({ title: "Smart Pantry Alert", text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text);
      toast.success("Reminder copied to clipboard to share!");
    }
  };

  // Critical Spoilage Items
  const criticalItems = items.filter(i => i.hasCriticalSpoilage || i.spoilageStatus === "SPOILED");
  const isAllClear = criticalItems.length === 0 && items.every(i => i.expiresInDays > 3);

  return (
    <div>
      <PageHeader
        title="Expiry & Food Safety Alerts"
        subtitle="Prioritized by urgency so you know exactly what needs attention."
      />

      {isAllClear && items.length > 0 && (
        <div className="mb-8 flex items-center gap-4 rounded-3xl bg-fresh-soft p-5 text-fresh border border-fresh/30 animate-rise">
          <CheckCircle2 className="h-8 w-8 shrink-0" />
          <div>
            <h3 className="font-display font-bold text-lg">All Clear!</h3>
            <p className="text-sm opacity-90">Every food item in your pantry is fresh. No immediate expiry or spoilage alerts.</p>
          </div>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-8">
          {/* SECTION: CRITICAL FOOD SAFETY ALERTS */}
          {criticalItems.length > 0 && (
            <section className="animate-rise">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex items-center gap-2 text-spoiled font-bold">
                  <ShieldAlert className="h-5 w-5" />
                  <h2 className="text-lg">Food Safety Alerts</h2>
                </div>
                <span className="rounded-full bg-spoiled px-2.5 py-0.5 text-xs font-bold text-white">
                  {criticalItems.length} Needs Attention
                </span>
              </div>
              <div className="space-y-3">
                {criticalItems.map((i) => (
                  <AlertCard
                    key={i.id}
                    item={i}
                    badgeClass="bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30"
                    barClass="bg-red-500"
                    label="Spoiled — Discard"
                    onMarkUsed={() => handleMarkUsed(i)}
                    onDiscard={() => handleDiscard(i)}
                    onShare={() => handleShare(i)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* STRICT DETERMINISTIC EXPIRY CATEGORIES */}
          {strictGroups.map((g) => {
            const list = items.filter((i) => {
              const dl = getDeterministicDaysLeft(i);
              return g.test(dl);
            });
            return (
              <section key={g.title} className="animate-rise">
                <div className="mb-3 flex items-center gap-3">
                  <h2 className="text-lg font-semibold">{g.title}</h2>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold border", g.badgeCls)}>
                    {list.length}
                  </span>
                </div>
                {list.length === 0 ? (
                  <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                    Nothing here — all clear.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {list.map((i) => (
                      <AlertCard
                        key={i.id}
                        item={i}
                        badgeClass={g.badgeCls}
                        barClass={g.barCls}
                        label={g.badgeText}
                        onMarkUsed={() => handleMarkUsed(i)}
                        onDiscard={() => handleDiscard(i)}
                        onShare={() => handleShare(i)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}

          {items.length === 0 && (
            <EmptyState title="No alerts yet" body="Add food to your pantry and we'll watch the dates for you." />
          )}
        </div>

        {/* SIDEBAR: CHANNELS & REMINDER TIMING */}
        <aside className="space-y-6 lg:sticky lg:top-24">
          <div className="card-surface p-6">
            <h3 className="font-semibold text-base">Notification Channels</h3>
            <p className="mt-1 text-xs text-muted-foreground">Choose where you'd like to receive reminders.</p>
            <div className="mt-4 space-y-4">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary-soft text-primary">
                    <Bell className="h-4 w-4" />
                  </span>
                  <div>
                    <span className="block text-sm font-medium">In-app notifications</span>
                    <span className="text-[11px] text-muted-foreground">Notification center & badges</span>
                  </div>
                </div>
                <Switch
                  checked={settings.channel_in_app}
                  onCheckedChange={(v) => updateSetting("channel_in_app", v)}
                />
              </label>

              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary-soft text-primary">
                    <CalendarPlus className="h-4 w-4" />
                  </span>
                  <div>
                    <span className="block text-sm font-medium">Google Calendar</span>
                    <span className="text-[11px] text-muted-foreground">Add reminders to your calendar</span>
                  </div>
                </div>
                <Switch
                  checked={settings.channel_google_calendar}
                  onCheckedChange={(v) => updateSetting("channel_google_calendar", v)}
                />
              </label>

              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary-soft text-primary">
                    <MessageCircle className="h-4 w-4" />
                  </span>
                  <div>
                    <span className="block text-sm font-medium">WhatsApp</span>
                    <span className="text-[11px] text-muted-foreground">Receive WhatsApp message alerts</span>
                  </div>
                </div>
                <Switch
                  checked={settings.channel_whatsapp}
                  onCheckedChange={(v) => updateSetting("channel_whatsapp", v)}
                />
              </label>
            </div>
          </div>

          <div className="card-surface p-6">
            <h3 className="font-semibold text-base">Alert Timing</h3>
            <p className="mt-1 text-xs text-muted-foreground">Choose when you want to be reminded.</p>
            <div className="mt-4 space-y-3 text-sm">
              <label className="flex items-center justify-between cursor-pointer">
                <span>3 days before due date</span>
                <Switch
                  checked={settings.remind_3_days_before}
                  onCheckedChange={(v) => updateSetting("remind_3_days_before", v)}
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <span>1 day before due date</span>
                <Switch
                  checked={settings.remind_1_day_before}
                  onCheckedChange={(v) => updateSetting("remind_1_day_before", v)}
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <span>On consume-by date</span>
                <Switch
                  checked={settings.remind_on_due_date}
                  onCheckedChange={(v) => updateSetting("remind_on_due_date", v)}
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <span>When food is overdue</span>
                <Switch
                  checked={settings.remind_overdue}
                  onCheckedChange={(v) => updateSetting("remind_overdue", v)}
                />
              </label>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function AlertCard({
  item,
  badgeClass,
  barClass,
  label,
  onMarkUsed,
  onDiscard,
  onShare
}: {
  item: PantryItem;
  badgeClass: string;
  barClass: string;
  label: string;
  onMarkUsed: () => void;
  onDiscard?: () => void;
  onShare: () => void;
}) {
  const verifiedBadge = item.isVerifiedExpiry ? "Verified Date" : "Estimated";
  const daysLeft = getDeterministicDaysLeft(item);
  const isExpired = daysLeft < 0 || item.hasCriticalSpoilage || item.spoilageStatus === "SPOILED";

  return (
    <div className="card-surface lift relative flex flex-col gap-4 overflow-hidden p-4 pl-5 sm:flex-row sm:items-center">
      <span className={cn("absolute inset-y-0 left-0 w-1.5", barClass)} />
      <Link to="/app/pantry/$id" params={{ id: item.id }} className="flex flex-1 items-center gap-4 min-w-0">
        <FoodThumb item={item} className="h-14 w-14 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold truncate">{item.name}</p>
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold border",
              item.isVerifiedExpiry
                ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "bg-muted text-muted-foreground border-border"
            )}>
              {verifiedBadge}
            </span>
          </div>

          <p className="text-sm text-muted-foreground mt-0.5">
            {item.quantity} · {daysLabel(daysLeft)} · {humanFreshness(item)} · {item.storage}
          </p>
        </div>
      </Link>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold border", badgeClass)}>{label}</span>

        {isExpired ? (
          onDiscard ? (
            <Button size="sm" variant="destructive" onClick={onDiscard} className="gap-1.5">
              <Trash2 className="h-3.5 w-3.5" /> Discard
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={onMarkUsed} className="gap-1.5">
              <Check className="h-3.5 w-3.5" /> Mark Used
            </Button>
          )
        ) : (
          <>
            <Link to="/app/recipes">
              <Button size="sm" variant="default" className="gap-1.5">
                <ChefHat className="h-3.5 w-3.5" /> Cook Today
              </Button>
            </Link>
            <Button size="sm" variant="soft" onClick={onMarkUsed} className="gap-1.5">
              <Check className="h-3.5 w-3.5" /> Mark Used
            </Button>
          </>
        )}

        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={onShare}
          title="Share reminder"
        >
          <Share2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
