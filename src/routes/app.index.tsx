import { createFileRoute, Link } from "@tanstack/react-router";
import { Boxes, Leaf, AlarmClock, XCircle, PackageCheck, IndianRupee, Recycle, ScanLine, ArrowRight, Salad, Refrigerator, CookingPot, ShoppingCart, Cloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePantry } from "@/lib/pantry-store";
import { statusFor, type Status } from "@/lib/pantry-data";
import { Counter, FoodCard, Ring, Section } from "@/components/pantry/ui";
import { calculateAnalytics } from "@/services/analyticsService";

export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [{ title: "Dashboard — AI Smart Pantry" }, { name: "description", content: "Your pantry at a glance: freshness, expiring items and savings." }, { property: "og:title", content: "Dashboard — AI Smart Pantry" }, { property: "og:description", content: "See what needs your attention today." }] }),
  component: Dashboard,
});

import { useAuth } from "@/lib/auth-store";
import { pantryDb } from "@/services/swiggy/pantryDb";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Dashboard() {
  const { user } = useAuth();
  const { items, history, addShop, removeItem, syncPantryDb } = usePantry();
  const analytics = calculateAnalytics(items, history);

  const counts: Record<Status, number> = { Fresh: 0, Good: 0, "Use Soon": 0, Spoiled: 0 };
  items.forEach((i) => counts[statusFor(i.freshness, i.expiresInDays)]++);
  const expiring = items.filter((i) => i.expiresInDays >= 0 && i.expiresInDays <= 3).sort((a, b) => a.expiresInDays - b.expiresInDays);
  const spoiledItems = items.filter((i) => i.expiresInDays < 0 || i.freshness <= 25);
  const lowStockItems = items.filter((i) => i.lowStock || i.expiresInDays <= 1);
  const counterItems = items.filter((i) => i.storage === "Counter" || i.storage === "Pantry shelf");

  const stats = [
    { label: "Total items", v: analytics.totalItems, icon: Boxes, tone: "bg-primary-soft text-primary" },
    { label: "Fresh", v: analytics.freshCount + analytics.goodCount, icon: Leaf, tone: "bg-fresh-soft text-fresh" },
    { label: "Expiring soon", v: analytics.expiringSoonCount, icon: AlarmClock, tone: "bg-warn-soft text-warn" },
    { label: "Expired", v: analytics.expiredCount, icon: XCircle, tone: "bg-spoiled-soft text-spoiled" },
    { label: "Food saved", v: analytics.foodSavedCount, suffix: " items", icon: PackageCheck, tone: "bg-primary-soft text-primary" },
    { label: "Money saved", v: analytics.moneySavedINR, prefix: "₹", icon: IndianRupee, tone: "bg-good-soft text-good" },
    { label: "Waste reduced", v: analytics.wasteReductionPercent, suffix: "%", icon: Recycle, tone: "bg-fresh-soft text-fresh" },
  ];

  // Dynamically generated actionable recommendations based on REAL pantry items
  const dynamicActions: Array<{
    icon: any;
    text: string;
    sub: string;
    to?: "/app/recipes" | "/app/pantry" | "/app/shopping";
    onClick?: () => void;
  }> = [];

  // Action 1: Remove Spoiled Items
  if (spoiledItems.length > 0) {
    const item = spoiledItems[0];
    dynamicActions.push({
      icon: XCircle,
      text: `Remove spoiled ${item.name}`,
      sub: "Spoiled/expired · discard to keep pantry clean",
      onClick: async () => {
        await removeItem(item.id);
        toast.success(`Removed spoiled ${item.name} from pantry.`);
      }
    });
  }

  // Action 2: Cook Expiring Soon Items
  if (expiring.length > 0) {
    const item = expiring[0];
    dynamicActions.push({
      icon: Salad,
      text: `Cook ${item.name} today`,
      sub: `${item.expiresInDays} day(s) left · view zero-waste AI recipes`,
      to: "/app/recipes"
    });
  }

  // Action 3: Storage Optimization
  if (counterItems.length > 0) {
    const item = counterItems[0];
    dynamicActions.push({
      icon: Refrigerator,
      text: `Move ${item.name} to Refrigerator`,
      sub: "Extends freshness by 3–5 days at 4°C",
      onClick: () => {
        pantryDb.updateItem(item.id, { storageCondition: "fridge", storage: "Refrigerator" });
        syncPantryDb();
        toast.success(`Moved ${item.name} to Refrigerator.`);
      }
    });
  }

  // Action 4: Restock Low Stock Items
  const lowItem = lowStockItems[0] || items[0];
  if (lowItem) {
    dynamicActions.push({
      icon: ShoppingCart,
      text: `Add ${lowItem.name} to shopping list`,
      sub: `Current stock: ${lowItem.quantity}`,
      onClick: () => {
        addShop({ name: lowItem.name, category: lowItem.category, qty: lowItem.quantity, priority: "High", section: "Running Low" });
        toast.success(`Added ${lowItem.name} to your shopping list.`);
      }
    });
  }

  // Fallback if pantry is empty
  if (dynamicActions.length === 0) {
    dynamicActions.push({
      icon: ScanLine,
      text: "Scan your first food item",
      sub: "Use AI freshness vision to populate your pantry",
      to: "/app/scan" as any
    });
  }

  const userName = user ? user.name.split(" ")[0] : "Chef";

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 animate-rise sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">{greeting()}, {userName}.</h1>
          <p className="mt-2 text-muted-foreground">Here's what needs your attention today.</p>
        </div>
        <Button asChild variant="hero" size="lg"><Link to="/app/scan"><ScanLine /> Scan food</Link></Button>
      </div>

      <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-4 sm:px-0 2xl:grid-cols-7">
        {stats.map((s, i) => (
          <div key={s.label} className="card-surface lift min-w-[150px] snap-start p-4 animate-rise" style={{ animationDelay: `${i * 50}ms` }}>
            <div className={`grid h-9 w-9 place-items-center rounded-xl ${s.tone}`}><s.icon className="h-4 w-4" /></div>
            <p className="mt-4 font-display text-2xl font-bold"><Counter value={s.v} prefix={s.prefix} suffix={s.suffix} /></p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card-surface p-6 lg:col-span-2 animate-rise">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Food Freshness Overview</h2>
            <Link to="/app/pantry" className="text-sm font-medium text-primary hover:underline">View pantry</Link>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {(Object.keys(counts) as Status[]).map((s) => (
              <div key={s} className="flex flex-col items-center gap-3">
                <Ring value={Math.round((counts[s] / Math.max(items.length, 1)) * 100)} status={s} size={104}
                  label={<div><p className="font-display text-2xl font-bold">{counts[s]}</p><p className="text-[10px] text-muted-foreground">items</p></div>} />
                <p className="text-sm font-semibold">{s}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="card-surface p-6 animate-rise">
          <h2 className="text-xl font-semibold">Recommended actions</h2>
          <ul className="mt-4 space-y-2">
            {dynamicActions.map((a) => {
              const inner = (
                <>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><a.icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{a.text}</span><span className="block text-xs text-muted-foreground">{a.sub}</span></span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </>
              );
              const cls = "group flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-secondary";
              return <li key={a.text}>{a.to ? <Link to={a.to} className={cls}>{inner}</Link> : <button onClick={a.onClick ?? (() => toast.success("Noted — action saved."))} className={cls}>{inner}</button>}</li>;
            })}
          </ul>
        </div>
      </div>

      <Section title="Expiring soon" action={<Link to="/app/alerts" className="text-sm font-medium text-primary hover:underline">All alerts</Link>}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {expiring.slice(0, 4).map((i) => (
            <FoodCard key={i.id} item={i} action={<Button asChild size="sm" variant="soft" className="mt-1"><Link to="/app/recipes">Use in a recipe</Link></Button>} />
          ))}
        </div>
      </Section>

      <Section title="Waste reduction">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { l: "Food saved", v: analytics.foodSavedCount, s: " items", icon: PackageCheck },
            { l: "Money saved", v: analytics.moneySavedINR, p: "₹", icon: IndianRupee },
            { l: "Waste prevented", v: analytics.wastePreventedKg, s: " kg", icon: Recycle },
            { l: "CO₂ avoided", v: analytics.co2AvoidedKg, s: " kg", icon: Cloud },
          ].map((m) => (
            <div key={m.l} className="card-surface p-5">
              <m.icon className="h-5 w-5 text-primary" />
              <p className="mt-3 font-display text-3xl font-bold"><Counter value={m.v} prefix={m.p} suffix={m.s} /></p>
              <p className="text-sm text-muted-foreground">{m.l}</p>
            </div>
          ))}
        </div>
        <div className="card-surface mt-4 p-5">
          <div className="flex items-center justify-between text-sm"><span className="font-medium">You are {analytics.wasteReductionPercent}% toward your monthly waste-reduction goal.</span><span className="font-display font-bold text-primary">{analytics.wasteReductionPercent}%</span></div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand" style={{ width: `${analytics.wasteReductionPercent}%` }} /></div>
        </div>
      </Section>
    </div>
  );
}
