import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Sparkles, CheckCircle2, Info } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usePantry } from "@/lib/pantry-store";
import { PageHeader, Ring } from "@/components/pantry/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/nutrition")({
  head: () => ({ meta: [{ title: "Nutrition & Allergens — AI Smart Pantry" }, { name: "description", content: "Daily and weekly nutrition from your pantry, plus allergen detection." }, { property: "og:title", content: "Nutrition & Allergens — AI Smart Pantry" }, { property: "og:description", content: "Know what's in your food." }] }),
  component: Nutrition,
});

const ALL_ALLERGENS = ["Milk", "Nuts", "Gluten", "Soy", "Eggs", "Fish", "Shellfish", "Sesame"];

function Nutrition() {
  const { items } = usePantry();

  // Compute real nutrition totals from active pantry items
  const totals = items.reduce(
    (acc, item) => {
      const n = item.nutrition;
      if (!n) return acc;
      return {
        calories: acc.calories + (n.calories || 0),
        protein:  acc.protein  + (n.protein  || 0),
        carbs:    acc.carbs    + (n.carbs    || 0),
        fat:      acc.fat      + (n.fat      || 0),
        fiber:    acc.fiber    + (n.fiber    || 0),
        hasData:  acc.hasData  || n.calories > 0 || n.protein > 0 || n.carbs > 0,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, hasData: false }
  );

  const daily = [
    { k: "Calories", v: Math.round(totals.calories), goal: 2000, u: "kcal" },
    { k: "Protein",  v: Math.round(totals.protein),  goal: 70,   u: "g" },
    { k: "Carbs",    v: Math.round(totals.carbs),     goal: 260,  u: "g" },
    { k: "Fat",      v: Math.round(totals.fat),       goal: 65,   u: "g" },
    { k: "Fiber",    v: Math.round(totals.fiber),     goal: 30,   u: "g" },
  ];

  // Allergens actually found in pantry
  const found = new Map<string, string[]>();
  items.forEach((i) => (i.allergens || []).forEach((a) => found.set(a, [...(found.get(a) ?? []), i.name])));

  // Per-category nutrition breakdown for chart
  const catMap = new Map<string, { protein: number; carbs: number; fat: number }>();
  items.forEach((i) => {
    const n = i.nutrition;
    if (!n) return;
    const cat = i.category || "Other";
    const prev = catMap.get(cat) || { protein: 0, carbs: 0, fat: 0 };
    catMap.set(cat, {
      protein: prev.protein + (n.protein || 0),
      carbs:   prev.carbs   + (n.carbs   || 0),
      fat:     prev.fat     + (n.fat     || 0),
    });
  });
  const catChartData = Array.from(catMap.entries()).map(([d, vals]) => ({ d, ...vals }));

  const highFiberCount = items.filter((i) => (i.nutrition?.fiber ?? 0) >= 2).length;

  const insights: string[] = [];
  if (highFiberCount > 0) insights.push(`Your pantry has ${highFiberCount} high-fiber food${highFiberCount > 1 ? "s" : ""} — great for digestion.`);
  if (totals.protein < 30 && items.length > 0) insights.push("Protein intake is low. Consider adding eggs, paneer, or dal.");
  if (totals.fiber >= 25) insights.push("Excellent fiber intake! Keep up the vegetables and whole grains.");
  const allergenCount = found.size;
  if (allergenCount > 0) insights.push(`${allergenCount} allergen${allergenCount > 1 ? "s" : ""} detected in your pantry. Review before cooking for guests.`);
  if (insights.length === 0) insights.push("Scan more items to get personalised nutrition insights.");

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Nutrition" title="Nutrition & allergens" subtitle="Computed from your current pantry items." />

      {!totals.hasData && items.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border bg-muted p-4 text-sm text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 text-primary" />
          Nutrition data not yet available for most items. Scan items via barcode (Open Food Facts) to populate real values.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {daily.map((d) => {
          const pct = d.goal > 0 ? Math.min(100, Math.round((d.v / d.goal) * 100)) : 0;
          return (
            <div key={d.k} className="card-surface flex flex-col items-center p-5 animate-rise">
              <Ring value={pct} status="Fresh" size={88} stroke={8} label={<span className="font-display text-sm font-bold">{pct}%</span>} />
              {totals.hasData ? (
                <p className="mt-3 font-display text-xl font-bold">{d.v}<span className="text-xs font-normal text-muted-foreground"> {d.u}</span></p>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">No data</p>
              )}
              <p className="text-xs text-muted-foreground">{d.k} · goal {d.goal}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card-surface p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold">Nutrition by Category</h2>
          {catChartData.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">Scan food items via barcode to see nutrition breakdown by category.</p>
          ) : (
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={catChartData} barGap={4}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="d" tickLine={false} axisLine={false} stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} stroke="var(--muted-foreground)" fontSize={11} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} cursor={{ fill: "var(--muted)" }} />
                  <Bar dataKey="carbs" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="protein" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="fat" fill="var(--chart-3)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="space-y-4">
          {insights.map((t) => (
            <div key={t} className="card-surface flex gap-3 p-5"><Sparkles className="h-5 w-5 shrink-0 text-primary" /><p className="text-sm">{t}</p></div>
          ))}
        </div>
      </div>

      <div className="card-surface p-6">
        <h2 className="text-lg font-semibold">Allergens in your pantry</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {ALL_ALLERGENS.map((a) => {
            const hits = found.get(a);
            return (
              <div key={a} className={cn("rounded-2xl border p-4", hits ? "border-spoiled/40 bg-spoiled-soft" : "bg-surface")}>
                <div className="flex items-center gap-2 font-semibold text-sm">
                  {hits ? <AlertTriangle className="h-4 w-4 text-spoiled" /> : <CheckCircle2 className="h-4 w-4 text-fresh" />}
                  {a}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{hits ? `Found in ${hits.slice(0, 2).join(", ")}${hits.length > 2 ? ` +${hits.length - 2}` : ""}` : "Not detected"}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
