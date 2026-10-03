import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Sparkles, CheckCircle2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usePantry } from "@/lib/pantry-store";
import { PageHeader, Ring } from "@/components/pantry/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/nutrition")({
  head: () => ({ meta: [{ title: "Nutrition & Allergens — AI Smart Pantry" }, { name: "description", content: "Daily and weekly nutrition from your pantry, plus allergen detection." }, { property: "og:title", content: "Nutrition & Allergens — AI Smart Pantry" }, { property: "og:description", content: "Know what's in your food." }] }),
  component: Nutrition,
});

const week = [
  { d: "Mon", protein: 52, carbs: 210, fat: 48 }, { d: "Tue", protein: 61, carbs: 190, fat: 52 }, { d: "Wed", protein: 47, carbs: 230, fat: 44 },
  { d: "Thu", protein: 68, carbs: 205, fat: 55 }, { d: "Fri", protein: 58, carbs: 240, fat: 60 }, { d: "Sat", protein: 72, carbs: 220, fat: 58 }, { d: "Sun", protein: 64, carbs: 198, fat: 50 },
];
const daily = [
  { k: "Calories", v: 1680, goal: 2000, u: "kcal" }, { k: "Protein", v: 58, goal: 70, u: "g" }, { k: "Carbs", v: 215, goal: 260, u: "g" }, { k: "Fat", v: 52, goal: 65, u: "g" }, { k: "Fiber", v: 24, goal: 30, u: "g" },
];
const allAllergens = ["Milk", "Nuts", "Gluten", "Soy", "Eggs"];

function Nutrition() {
  const { items } = usePantry();
  const found = new Map<string, string[]>();
  items.forEach((i) => i.allergens.forEach((a) => found.set(a, [...(found.get(a) ?? []), i.name])));
  const fiber = items.filter((i) => i.nutrition.fiber >= 2).length;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Nutrition" title="Nutrition & allergens" subtitle="An estimate of today's intake and what's hiding in your pantry." />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {daily.map((d) => (
          <div key={d.k} className="card-surface flex flex-col items-center p-5 animate-rise">
            <Ring value={Math.round((d.v / d.goal) * 100)} status="Fresh" size={88} stroke={8} label={<span className="font-display text-sm font-bold">{Math.round((d.v / d.goal) * 100)}%</span>} />
            <p className="mt-3 font-display text-xl font-bold">{d.v}<span className="text-xs font-normal text-muted-foreground"> {d.u}</span></p>
            <p className="text-xs text-muted-foreground">{d.k} · goal {d.goal}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card-surface p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold">This week</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={week} barGap={4}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="d" tickLine={false} axisLine={false} stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis tickLine={false} axisLine={false} stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="carbs" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="protein" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="fat" fill="var(--chart-3)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="space-y-4">
          {[`Your pantry contains ${fiber} high-fiber foods.`, "Protein intake is up 12% vs last week.", "Spinach and paneer are great sources of iron and calcium."].map((t) => (
            <div key={t} className="card-surface flex gap-3 p-5"><Sparkles className="h-5 w-5 shrink-0 text-primary" /><p className="text-sm">{t}</p></div>
          ))}
        </div>
      </div>

      <div className="card-surface p-6">
        <h2 className="text-lg font-semibold">Allergens in your pantry</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-5">
          {allAllergens.map((a) => {
            const hits = found.get(a);
            return (
              <div key={a} className={cn("rounded-2xl border p-4", hits ? "border-spoiled/40 bg-spoiled-soft" : "bg-surface")}>
                <div className="flex items-center gap-2 font-semibold">{hits ? <AlertTriangle className="h-4 w-4 text-spoiled" /> : <CheckCircle2 className="h-4 w-4 text-fresh" />}{a}</div>
                <p className="mt-1 text-xs text-muted-foreground">{hits ? `Found in ${hits.join(", ")}` : "Not detected"}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
