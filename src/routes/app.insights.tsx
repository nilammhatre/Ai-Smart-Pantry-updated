import { createFileRoute } from "@tanstack/react-router";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Recycle, IndianRupee, PackageCheck, Cloud, Sprout, Trophy } from "lucide-react";
import { Counter, PageHeader } from "@/components/pantry/ui";
import { usePantry } from "@/lib/pantry-store";
import { calculateAnalytics } from "@/services/analyticsService";

export const Route = createFileRoute("/app/insights")({
  head: () => ({ meta: [{ title: "Insights & Sustainability — AI Smart Pantry" }, { name: "description", content: "Food consumed vs wasted, money saved and your carbon impact." }, { property: "og:title", content: "Insights & Sustainability — AI Smart Pantry" }, { property: "og:description", content: "See the impact of wasting less." }] }),
  component: Insights,
});

const colors = ["var(--chart-1)", "var(--chart-3)", "var(--chart-5)", "var(--chart-4)"];

function Insights() {
  const { items, history } = usePantry();
  const analytics = calculateAnalytics(items, history);

  // Category breakdown from real data
  const catMap = new Map<string, number>();
  items.forEach((i) => {
    const cat = i.category || "Other";
    catMap.set(cat, (catMap.get(cat) || 0) + 1);
  });
  const total = items.length || 1;
  const wasteByCat = Array.from(catMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, count]) => ({ name, v: Math.round((count / total) * 100) }));

  const topCat = wasteByCat[0];

  // Most frequently seen items from history
  const nameCounts = new Map<string, number>();
  history.forEach((h) => nameCounts.set(h.name, (nameCounts.get(h.name) || 0) + 1));
  items.forEach((i) => nameCounts.set(i.name, (nameCounts.get(i.name) || 0) + 1));
  const frequent = Array.from(nameCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxFreq = frequent[0]?.[1] || 1;

  // Monthly chart: build last 6 months from history + current pantry
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { m: monthNames[d.getMonth()], consumed: 0, wasted: 0 };
  });
  // Fill with accumulated pantry data (approximation from real items)
  const totalConsumed = analytics.foodSavedCount;
  const totalWasted = analytics.expiredCount;
  months.forEach((mo, idx) => {
    const weight = (idx + 1) / 6;
    mo.consumed = Math.round(totalConsumed * weight);
    mo.wasted = Math.max(0, Math.round(totalWasted * weight));
  });
  months[5].consumed = totalConsumed;
  months[5].wasted = totalWasted;

  // Utilisation: how many bought were used
  const utilisationPct = Math.min(100, analytics.wasteReductionPercent);

  const monthLabel = monthNames[now.getMonth()] + " " + now.getFullYear().toString().slice(2);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Insights" title="Your food habits" subtitle="Small changes, adding up." />

      <div className="relative overflow-hidden rounded-[2rem] bg-brand p-8 text-primary-foreground shadow-lift animate-rise">
        <Sprout className="absolute -right-6 -top-6 h-40 w-40 opacity-15" />
        <p className="text-sm opacity-85">{monthNames[now.getMonth()]} summary</p>
        <p className="mt-2 max-w-2xl font-display text-2xl font-bold sm:text-3xl">
          {analytics.foodSavedCount > 0
            ? `This month you rescued ${analytics.foodSavedCount} food item${analytics.foodSavedCount !== 1 ? "s" : ""} and prevented an estimated ₹${analytics.moneySavedINR} worth of food waste.`
            : "Start scanning food items to see your monthly waste reduction impact here."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { l: "Food Waste Prevented", v: analytics.wastePreventedKg, s: " kg", I: Recycle },
          { l: "Money Saved", v: analytics.moneySavedINR, p: "₹", I: IndianRupee },
          { l: "Food Rescued", v: analytics.foodSavedCount, s: " items", I: PackageCheck },
          { l: "Carbon Impact", v: analytics.co2AvoidedKg, s: " kg CO₂", I: Cloud },
        ].map((m, i) => (
          <div key={m.l} className="card-surface lift p-5 animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary-soft text-primary"><m.I className="h-5 w-5" /></div>
            <p className="mt-4 font-display text-3xl font-bold"><Counter value={m.v} prefix={m.p} suffix={m.s} /></p>
            <p className="text-sm text-muted-foreground">{m.l}</p>
          </div>
        ))}
      </div>

      <div className="card-surface flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
        <Trophy className="h-10 w-10 shrink-0 text-warn" />
        <div className="flex-1">
          <p className="font-semibold">You are {utilisationPct}% toward your monthly waste-reduction goal.</p>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand transition-all duration-1000" style={{ width: `${utilisationPct}%` }} /></div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card-surface p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold">Consumed vs wasted (6 months)</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={months}>
                <defs>
                  <linearGradient id="gc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gw" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-4)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="m" tickLine={false} axisLine={false} stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis tickLine={false} axisLine={false} stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} />
                <Area type="monotone" dataKey="consumed" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#gc)" />
                <Area type="monotone" dataKey="wasted" stroke="var(--chart-4)" strokeWidth={2.5} fill="url(#gw)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card-surface p-6">
          <h2 className="text-lg font-semibold">Items by category</h2>
          {wasteByCat.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">No data. Add items to your pantry to see a breakdown.</p>
          ) : (
            <>
              <div className="relative mx-auto h-48 w-48">
                <ResponsiveContainer>
                  <PieChart><Pie data={wasteByCat} dataKey="v" innerRadius={58} outerRadius={84} paddingAngle={3} stroke="none">{wasteByCat.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}</Pie></PieChart>
                </ResponsiveContainer>
                {topCat && (
                  <div className="absolute inset-0 grid place-items-center text-center">
                    <div>
                      <p className="font-display text-lg font-bold">{topCat.name.slice(0, 4)}</p>
                      <p className="text-xs text-muted-foreground">{topCat.v}%</p>
                    </div>
                  </div>
                )}
              </div>
              <ul className="mt-2 space-y-1.5 text-sm">{wasteByCat.map((w, i) => <li key={w.name} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[i % colors.length] }} />{w.name}<span className="ml-auto text-muted-foreground">{w.v}%</span></li>)}</ul>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card-surface p-6">
          <h2 className="text-lg font-semibold">Most frequently tracked</h2>
          {frequent.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Scan more items to see your most tracked foods.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {frequent.map(([n, c]) => (
                <li key={n} className="text-sm">
                  <div className="flex justify-between"><span className="truncate max-w-[180px]">{n}</span><span className="text-muted-foreground">{c}×</span></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(c / maxFreq) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card-surface p-6">
          <h2 className="text-lg font-semibold">Pantry utilization</h2>
          <p className="mt-4 font-display text-5xl font-bold text-primary"><Counter value={utilisationPct} suffix="%" /></p>
          <p className="mt-1 text-sm text-muted-foreground">
            {utilisationPct >= 80 ? "Excellent! Most food you buy gets eaten." :
             utilisationPct >= 60 ? "Good — still room to reduce waste." :
             "Low utilization. Try scanning items and using AI recipes to reduce waste."}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-surface p-3">
              <p className="font-bold text-fresh text-lg">{analytics.freshCount + analytics.goodCount}</p>
              <p className="text-muted-foreground">Fresh items</p>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <p className="font-bold text-spoiled text-lg">{analytics.expiredCount}</p>
              <p className="text-muted-foreground">Expired/wasted</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
