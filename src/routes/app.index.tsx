import { createFileRoute, Link } from "@tanstack/react-router";
import { Boxes, Leaf, AlarmClock, XCircle, PackageCheck, IndianRupee, Recycle, ScanLine, ArrowRight, Salad, Refrigerator, CookingPot, ShoppingCart, Cloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePantry } from "@/lib/pantry-store";
import { statusFor, type Status } from "@/lib/pantry-data";
import { Counter, FoodCard, Ring, Section } from "@/components/pantry/ui";

export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [{ title: "Dashboard — AI Smart Pantry" }, { name: "description", content: "Your pantry at a glance: freshness, expiring items and savings." }, { property: "og:title", content: "Dashboard — AI Smart Pantry" }, { property: "og:description", content: "See what needs your attention today." }] }),
  component: Dashboard,
});

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Dashboard() {
  const { items, addShop } = usePantry();
  const counts: Record<Status, number> = { Fresh: 0, Good: 0, "Use Soon": 0, Spoiled: 0 };
  items.forEach((i) => counts[statusFor(i.freshness, i.expiresInDays)]++);
  const expiring = items.filter((i) => i.expiresInDays >= 0 && i.expiresInDays <= 3).sort((a, b) => a.expiresInDays - b.expiresInDays);
  const expired = items.filter((i) => i.expiresInDays < 0).length;

  const stats = [
    { label: "Total items", v: items.length, icon: Boxes, tone: "bg-primary-soft text-primary" },
    { label: "Fresh", v: counts.Fresh + counts.Good, icon: Leaf, tone: "bg-fresh-soft text-fresh" },
    { label: "Expiring soon", v: expiring.length, icon: AlarmClock, tone: "bg-warn-soft text-warn" },
    { label: "Expired", v: expired, icon: XCircle, tone: "bg-spoiled-soft text-spoiled" },
    { label: "Food saved", v: 12, suffix: " items", icon: PackageCheck, tone: "bg-primary-soft text-primary" },
    { label: "Money saved", v: 850, prefix: "₹", icon: IndianRupee, tone: "bg-good-soft text-good" },
    { label: "Waste reduced", v: 38, suffix: "%", icon: Recycle, tone: "bg-fresh-soft text-fresh" },
  ];

  const actions = [
    { icon: Salad, text: "Use tomatoes soon", sub: "3 days left · try Aloo Tamatar", to: "/app/recipes" as const },
    { icon: Refrigerator, text: "Move milk to the refrigerator door", sub: "Keeps 1–2 days longer at 4°C" },
    { icon: CookingPot, text: "Cook spinach today", sub: "Freshness dropping to 58%", to: "/app/recipes" as const },
    { icon: ShoppingCart, text: "Add low-stock rice to shopping list", sub: "Only 500 g left", onClick: () => { addShop({ name: "Basmati Rice", qty: "2 kg", category: "Grains", priority: "High", section: "Running Low" }); toast.success("Rice added to your shopping list."); } },
  ];

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 animate-rise sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">{greeting()}, Nilam.</h1>
          <p className="mt-2 text-muted-foreground">Here's what needs your attention today.</p>
        </div>
        <Button asChild variant="hero" size="lg"><Link to="/app/scan"><ScanLine /> Scan food</Link></Button>
      </div>

      <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-4 sm:px-0 xl:grid-cols-7">
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
            {actions.map((a) => {
              const inner = (
                <>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><a.icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{a.text}</span><span className="block text-xs text-muted-foreground">{a.sub}</span></span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </>
              );
              const cls = "group flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-secondary";
              return <li key={a.text}>{a.to ? <Link to={a.to} className={cls}>{inner}</Link> : <button onClick={a.onClick ?? (() => toast.success("Noted — we'll remind you."))} className={cls}>{inner}</button>}</li>;
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
            { l: "Food saved", v: 12, s: " items", icon: PackageCheck },
            { l: "Money saved", v: 850, p: "₹", icon: IndianRupee },
            { l: "Waste prevented", v: 4, s: ".2 kg", icon: Recycle },
            { l: "CO₂ avoided", v: 9, s: ".8 kg", icon: Cloud },
          ].map((m) => (
            <div key={m.l} className="card-surface p-5">
              <m.icon className="h-5 w-5 text-primary" />
              <p className="mt-3 font-display text-3xl font-bold"><Counter value={m.v} prefix={m.p} suffix={m.s} /></p>
              <p className="text-sm text-muted-foreground">{m.l}</p>
            </div>
          ))}
        </div>
        <div className="card-surface mt-4 p-5">
          <div className="flex items-center justify-between text-sm"><span className="font-medium">You are 72% toward your monthly waste-reduction goal.</span><span className="font-display font-bold text-primary">72%</span></div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full w-[72%] rounded-full bg-brand" /></div>
        </div>
      </Section>
    </div>
  );
}
