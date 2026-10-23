import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft, ChefHat, ShoppingCart, BellRing, Trash2, Calendar, Package,
  Thermometer, ShoppingBag, Sparkles, AlertTriangle, Scan, CalendarPlus, Send
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { usePantry } from "@/lib/pantry-store";
import { statusFor, dateFromNow, daysLabel } from "@/lib/pantry-data";
import { EmptyState, FoodThumb, Ring, StatusBadge } from "@/components/pantry/ui";
import FreshnessScannerModal from "@/components/pantry/FreshnessScannerModal";

export const Route = createFileRoute("/app/pantry/$id")({
  head: () => ({
    meta: [
      { title: "Food details — AI Smart Pantry" },
      { name: "description", content: "Freshness, nutrition, Gemini AI vision and storage advice for this item." },
      { property: "og:title", content: "Food details — AI Smart Pantry" },
      { property: "og:description", content: "AI insights for a pantry item." }
    ]
  }),
  component: Detail,
});

function Detail() {
  const { id } = Route.useParams();
  const { items, removeItem, addShop, toggleReminder, syncCalendarNotification, sendWhatsAppNotification, syncPantryDb } = usePantry();
  const nav = useNavigate();
  const [showAiScanModal, setShowAiScanModal] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const item = items.find((i) => i.id === id);

  if (!item) {
    return (
      <EmptyState
        title="We couldn't find that item."
        body="It may have been used up or removed."
        action={
          <Button asChild>
            <Link to="/app/pantry">Back to pantry</Link>
          </Button>
        }
      />
    );
  }

  const s = statusFor(item.freshness, item.expiresInDays);
  const n = item.nutrition;

  const handleCalendarSync = async () => {
    setSyncing(true);
    try {
      const res = await syncCalendarNotification(item);
      if (res.success) {
        toast.success(`Google Calendar synced for ${item.name}!`);
      } else {
        toast.error(`Calendar sync note: ${res.error || "Check authorization token in Settings"}`);
      }
    } catch (err: any) {
      toast.error(`Calendar Error: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleWhatsAppAlert = async () => {
    setSyncing(true);
    try {
      const res = await sendWhatsAppNotification(item);
      if (res.success) {
        toast.success(`WhatsApp Cloud API alert sent for ${item.name}!`);
      } else {
        toast.error(`WhatsApp note: ${res.error || "Failed to send alert"}`);
      }
    } catch (err: any) {
      toast.error(`WhatsApp Error: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const insights = [
    {
      k: "Current condition",
      v: item.visualScanNotes || (s === "Fresh" ? "Firm, vibrant, no visible defects" : s === "Good" ? "Good quality, minor softening" : s === "Use Soon" ? "Softening — quality declining" : "Signs of spoilage detected")
    },
    {
      k: "Ripeness & Spoilage Risk",
      v: item.spoilageRisk ? `${item.spoilageRisk.toUpperCase()} risk` : (item.category === "Fruits" ? (item.freshness > 85 ? "Just ripe" : "Fully ripe") : "Standard")
    },
    { k: "Spoilage indicators", v: s === "Spoiled" ? "Mold / off-smell likely" : "None detected" },
    {
      k: "Storage recommendation",
      v: item.storageRecommendation || (item.category === "Dairy" ? "Keep at 4°C, back of fridge" : item.category === "Vegetables" ? "Crisper drawer, loosely wrapped" : "Cool, dry, away from sunlight")
    },
    {
      k: "Best time to consume",
      v: item.expiresInDays <= 1 ? "Today" : `Within ${Math.min(item.expiresInDays, 3)} days`
    }
  ];

  return (
    <div className="space-y-8">
      <Link to="/app/pantry" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> My Pantry
      </Link>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="relative overflow-hidden rounded-[2rem] bg-muted shadow-soft animate-rise">
          <FoodThumb item={item} className="aspect-[4/3] h-full w-full" />
          <StatusBadge status={s} className="absolute left-4 top-4 glass" />
        </div>

        <div className="flex flex-col gap-6 animate-rise [animation-delay:100ms]">
          <div>
            <p className="text-sm font-medium text-primary">{item.category}</p>
            <h1 className="mt-1 text-4xl font-bold">{item.name}</h1>
            <p className="mt-1 text-muted-foreground">{item.quantity}</p>
          </div>

          <div className="card-surface flex items-center gap-6 p-5">
            <Ring
              value={item.freshness}
              status={s}
              size={110}
              label={
                <div>
                  <p className="font-display text-2xl font-bold">{item.freshness}%</p>
                  <p className="text-[10px] text-muted-foreground">freshness</p>
                </div>
              }
            />
            <div className="grid flex-1 grid-cols-2 gap-4 text-sm">
              <Info icon={Calendar} k="Consume by" v={item.consumeByDate || dateFromNow(item.expiresInDays)} />
              <Info icon={Package} k="Shelf life" v={daysLabel(item.expiresInDays)} />
              <Info icon={Thermometer} k="Storage" v={item.storage} />
              <Info icon={ShoppingBag} k="Purchased" v={dateFromNow(-item.addedDaysAgo)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button asChild>
              <Link to="/app/recipes">
                <ChefHat /> Use in Recipe
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                addShop({ name: item.name, qty: item.quantity, category: item.category, priority: "Medium", section: "Need Now" });
                toast.success(`${item.name} added to your shopping list.`);
              }}
            >
              <ShoppingCart /> Add to list
            </Button>
            <Button
              variant="soft"
              onClick={() => setShowAiScanModal(true)}
              className="col-span-2 sm:col-span-1"
            >
              <Scan className="mr-1.5 h-4 w-4 text-emerald-600" />
              Gemini Vision Scan
            </Button>
            <Button
              variant="soft"
              onClick={() => {
                toggleReminder(item.id);
                toast.success(item.reminder ? "Reminder removed." : "Reminder set for Google Calendar & WhatsApp.");
              }}
            >
              <BellRing /> {item.reminder ? "Reminder on" : "Set Reminder"}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCalendarSync} disabled={syncing}>
              <CalendarPlus className="mr-1 h-3.5 w-3.5" />
              Sync GCal API
            </Button>
            <Button variant="ghost" size="sm" onClick={handleWhatsAppAlert} disabled={syncing}>
              <Send className="mr-1 h-3.5 w-3.5" />
              WhatsApp Alert
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="col-span-2 text-destructive">
                  <Trash2 /> Delete Item
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove {item.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes it from your pantry and automatically removes its Google Calendar reminder via API.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      await removeItem(item.id);
                      toast(`${item.name} removed from pantry & calendar.`);
                      nav({ to: "/app/pantry" });
                    }}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card-surface p-6 lg:col-span-2">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Sparkles className="h-5 w-5 text-primary" /> Gemini AI insights
          </h2>
          <dl className="mt-4 divide-y">
            {insights.map((x) => (
              <div key={x.k} className="flex justify-between gap-4 py-3 text-sm">
                <dt className="text-muted-foreground">{x.k}</dt>
                <dd className="text-right font-medium">{x.v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="space-y-6">
          <div className="card-surface p-6">
            <h2 className="text-xl font-semibold">
              Nutrition <span className="text-sm font-normal text-muted-foreground">per 100 g</span>
            </h2>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              {[
                ["Calories", n.calories, "kcal"],
                ["Protein", n.protein, "g"],
                ["Carbs", n.carbs, "g"],
                ["Fat", n.fat, "g"],
                ["Fiber", n.fiber, "g"]
              ].map(([k, v, u]) => (
                <div key={k} className="rounded-2xl bg-surface p-3">
                  <p className="font-display text-lg font-bold">
                    {v}
                    <span className="text-xs font-normal text-muted-foreground">{u}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">{k}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {n.nutrients.map((x) => (
                <span key={x} className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-accent-foreground">
                  {x}
                </span>
              ))}
            </div>
          </div>

          <div className="card-surface p-6">
            <h2 className="text-xl font-semibold">Allergens</h2>
            {item.allergens.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {item.allergens.map((a) => (
                  <span
                    key={a}
                    className="inline-flex items-center gap-1 rounded-full bg-spoiled-soft px-3 py-1 text-sm font-semibold text-spoiled"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {a}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No common allergens detected.</p>
            )}
          </div>
        </div>
      </div>

      {showAiScanModal && (
        <FreshnessScannerModal
          item={item}
          onClose={() => setShowAiScanModal(false)}
          onItemUpdated={() => {
            syncPantryDb();
            toast.success(`Freshness analysis applied to ${item.name}`);
          }}
        />
      )}
    </div>
  );
}

function Info({ icon: I, k, v }: { icon: typeof Calendar; k: string; v: string }) {
  return (
    <div>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <I className="h-3.5 w-3.5" />
        {k}
      </p>
      <p className="font-semibold">{v}</p>
    </div>
  );
}
