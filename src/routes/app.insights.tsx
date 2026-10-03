import { createFileRoute } from "@tanstack/react-router";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Recycle, IndianRupee, PackageCheck, Cloud, Sprout, Trophy } from "lucide-react";
import { Counter, PageHeader } from "@/components/pantry/ui";

export const Route = createFileRoute("/app/insights")({
  head: () => ({ meta: [{ title: "Insights & Sustainability — AI Smart Pantry" }, { name: "description", content: "Food consumed vs wasted, money saved and your carbon impact." }, { property: "og:title", content: "Insights & Sustainability — AI Smart Pantry" }, { property: "og:description", content: "See the impact of wasting less." }] }),
  component: Insights,
});

const months = [
  { m: "May", consumed: 38, wasted: 11 }, { m: "Jun", consumed: 42, wasted: 9 }, { m: "Jul", consumed: 45, wasted: 8 },
  { m: "Aug", consumed: 48, wasted: 6 }, { m: "Sep", consumed: 52, wasted: 5 }, { m: "Oct", consumed: 55, wasted: 3 },
];
const wasteByCat = [{ name: "Vegetables", v: 42 }, { name: "Dairy", v: 24 }, { name: "Fruits", v: 18 }, { name: "Bread", v: 16 }];
const colors = ["var(--chart-1)", "var(--chart-3)", "var(--chart-5)", "var(--chart-4)"];
const frequent = [["Milk", 14], ["Tomatoes", 9], ["Bananas", 8], ["Eggs", 6], ["Rice", 4]] as const;

function Insights() {
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Insights" title="Your food habits" subtitle="Small changes, adding up." />

      <div className="relative overflow-hidden rounded-[2rem] bg-brand p-8 text-primary-foreground shadow-lift animate-rise">
        <Sprout className="absolute -right-6 -top-6 h-40 w-40 opacity-15" />
        <p className="text-sm opacity-85">October summary</p>
        <p className="mt-2 max-w-2xl font-display text-2xl font-bold sm:text-3xl">This month you rescued 12 food items and prevented an estimated ₹850 worth of food waste.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { l: "Food Waste Prevented", v: 4, s: ".2 kg", I: Recycle },
          { l: "Money Saved", v: 850, p: "₹", I: IndianRupee },
          { l: "Food Rescued", v: 12, s: " items", I: PackageCheck },
          { l: "Carbon Impact", v: 9, s: ".8 kg CO₂", I: Cloud },
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
          <p className="font-semibold">You are 72% toward your monthly waste-reduction goal.</p>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted"><div className="h-full w-[72%] rounded-full bg-brand transition-all duration-1000" /></div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card-surface p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold">Consumed vs wasted</h2>
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
          <h2 className="text-lg font-semibold">Most wasted category</h2>
          <div className="relative mx-auto h-48 w-48">
            <ResponsiveContainer><PieChart><Pie data={wasteByCat} dataKey="v" innerRadius={58} outerRadius={84} paddingAngle={3} stroke="none">{wasteByCat.map((_, i) => <Cell key={i} fill={colors[i]} />)}</Pie></PieChart></ResponsiveContainer>
            <div className="absolute inset-0 grid place-items-center text-center"><div><p className="font-display text-xl font-bold">Veg</p><p className="text-xs text-muted-foreground">42%</p></div></div>
          </div>
          <ul className="mt-2 space-y-1.5 text-sm">{wasteByCat.map((w, i) => <li key={w.name} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[i] }} />{w.name}<span className="ml-auto text-muted-foreground">{w.v}%</span></li>)}</ul>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card-surface p-6">
          <h2 className="text-lg font-semibold">Most frequently purchased</h2>
          <ul className="mt-4 space-y-3">{frequent.map(([n, c]) => <li key={n} className="text-sm"><div className="flex justify-between"><span>{n}</span><span className="text-muted-foreground">{c}×</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(c / 14) * 100}%` }} /></div></li>)}</ul>
        </div>
        <div className="card-surface p-6">
          <h2 className="text-lg font-semibold">Pantry utilization</h2>
          <p className="mt-4 font-display text-5xl font-bold text-primary"><Counter value={86} suffix="%" /></p>
          <p className="mt-1 text-sm text-muted-foreground">of food bought this month was eaten — up from 71% in May.</p>
        </div>
      </div>
    </div>
  );
}
