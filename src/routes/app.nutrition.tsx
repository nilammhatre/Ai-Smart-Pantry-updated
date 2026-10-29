import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Sparkles, CheckCircle2, Info } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usePantry } from "@/lib/pantry-store";
import { PageHeader, Ring } from "@/components/pantry/ui";
import { type Status } from "@/lib/pantry-data";
import { cn } from "@/lib/utils";
import {
  parseQuantityInGrams,
  getNutrientsPer100g,
  detectAllergensInFood,
  normalizeCategoryBucket,
  ALL_ALLERGENS,
  type CategoryMacro
} from "@/services/analyticsCalculations";

export const Route = createFileRoute("/app/nutrition")({
  head: () => ({
    meta: [
      { title: "Nutrition & Allergens — AI Smart Pantry" },
      { name: "description", content: "Daily and weekly nutrition from your pantry, plus allergen detection." },
      { property: "og:title", content: "Nutrition & Allergens — AI Smart Pantry" },
      { property: "og:description", content: "Know what's in your food." }
    ]
  }),
  component: Nutrition,
});

function Nutrition() {
  const { items } = usePantry();

  // 1. Filter active (non-expired, non-consumed) items in the user's pantry
  const activeItems = items.filter((item) => {
    if (item.status === "consumed" || item.status === "discarded") return false;
    if (item.hasCriticalSpoilage || item.spoilageStatus === "SPOILED") return false;
    if (typeof item.expiresInDays === "number" && item.expiresInDays < 0) return false;
    return true;
  });

  // 2. Calculate total Calories, Protein, Carbs, Fat, and Fiber:
  // sum of (item.quantity / 100g) * item.nutrients_per_100g across active items
  let totalCalories = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;
  let totalFiber = 0;

  // Group item-level macros by standardized category (Vegetables, Fruits, Dairy, Pantry)
  const categoryMap = new Map<string, { protein: number; carbs: number; fat: number; fiber: number; itemCount: number }>();

  activeItems.forEach((item) => {
    const weightGrams = parseQuantityInGrams(item.quantity, item.category, item.name);
    const factor = Math.max(weightGrams / 100, 0.1);
    const per100g = getNutrientsPer100g(item);

    const cals = per100g.calories * factor;
    const prot = per100g.protein * factor;
    const carbs = per100g.carbs * factor;
    const fat = per100g.fat * factor;
    const fiber = per100g.fiber * factor;

    totalCalories += cals;
    totalProtein += prot;
    totalCarbs += carbs;
    totalFat += fat;
    totalFiber += fiber;

    const catKey = normalizeCategoryBucket(item.category);
    const prev = categoryMap.get(catKey) || { protein: 0, carbs: 0, fat: 0, fiber: 0, itemCount: 0 };
    categoryMap.set(catKey, {
      protein: prev.protein + prot,
      carbs: prev.carbs + carbs,
      fat: prev.fat + fat,
      fiber: prev.fiber + fiber,
      itemCount: prev.itemCount + 1,
    });
  });

  const totals = {
    calories: Math.round(totalCalories),
    protein: Math.round(totalProtein),
    carbs: Math.round(totalCarbs),
    fat: Math.round(totalFat),
    fiber: Math.round(totalFiber),
    hasData: activeItems.length > 0,
  };

  // 3. Macro Distribution / Pantry Share (% of total caloric energy from macros)
  const carbKcal = totals.carbs * 4;
  const proteinKcal = totals.protein * 4;
  const fatKcal = totals.fat * 9;
  const totalMacroKcal = carbKcal + proteinKcal + fatKcal;

  const carbPct = totalMacroKcal > 0 ? Math.round((carbKcal / totalMacroKcal) * 100) : 0;
  const proteinPct = totalMacroKcal > 0 ? Math.round((proteinKcal / totalMacroKcal) * 100) : 0;
  const fatPct = totalMacroKcal > 0 ? Math.max(0, 100 - carbPct - proteinPct) : 0;

  // Days of Stock based on standard 2,000 kcal/day baseline
  const daysOfFood = totals.calories > 0 ? (totals.calories / 2000).toFixed(1) : "0";
  const daysOfFoodNum = parseFloat(daysOfFood);

  // 4. Daily Consumption Log: what the user actually consumed today (distinct from overall pantry stock)
  const consumedItems = items.filter((item) => item.status === "consumed");
  let consumedCalories = 0;
  let consumedProtein = 0;
  let consumedCarbs = 0;
  let consumedFat = 0;
  let consumedFiber = 0;

  consumedItems.forEach((item) => {
    const weightGrams = parseQuantityInGrams(item.quantity, item.category, item.name);
    const factor = Math.max(weightGrams / 100, 0.1);
    const per100g = getNutrientsPer100g(item);

    consumedCalories += per100g.calories * factor;
    consumedProtein += per100g.protein * factor;
    consumedCarbs += per100g.carbs * factor;
    consumedFat += per100g.fat * factor;
    consumedFiber += per100g.fiber * factor;
  });

  const dailyConsumedTotals = {
    calories: Math.round(consumedCalories),
    protein: Math.round(consumedProtein),
    carbs: Math.round(consumedCarbs),
    fat: Math.round(consumedFat),
    fiber: Math.round(consumedFiber),
    hasLogged: consumedItems.length > 0,
  };

  const dailyGoals = [
    { k: "Calories", v: dailyConsumedTotals.calories, goal: 2000, u: "kcal" },
    { k: "Protein",  v: dailyConsumedTotals.protein,  goal: 70,   u: "g" },
    { k: "Carbs",    v: dailyConsumedTotals.carbs,    goal: 260,  u: "g" },
    { k: "Fat",      v: dailyConsumedTotals.fat,      goal: 65,   u: "g" },
    { k: "Fiber",    v: dailyConsumedTotals.fiber,    goal: 30,   u: "g" },
  ];

  const highFiberCount = activeItems.filter((i) => {
    const per100 = getNutrientsPer100g(i);
    return per100.fiber >= 2;
  }).length;

  // Top Stock & Macro Distribution Cards
  const pantryMacroCards: Array<{
    k: string;
    label: string;
    ringValue: number;
    ringLabel: string;
    displayValue: string;
    unit: string;
    status: Status;
    sub: string;
  }> = [
    {
      k: "Days of Stock",
      label: "Days of Food",
      ringValue: Math.min(100, Math.round((daysOfFoodNum / 3) * 100)),
      ringLabel: `${daysOfFood}d`,
      displayValue: totals.calories.toLocaleString("en-IN"),
      unit: "kcal",
      status: daysOfFoodNum >= 2 ? "Fresh" : daysOfFoodNum >= 1 ? "Good" : "Use Soon",
      sub: `~${daysOfFood} days of food available (2,000 kcal/day base)`,
    },
    {
      k: "Carbs Share",
      label: "Carbohydrates",
      ringValue: carbPct,
      ringLabel: `${carbPct}%`,
      displayValue: totals.carbs.toLocaleString("en-IN"),
      unit: "g",
      status: "Good",
      sub: `${carbPct}% of pantry stock (${totals.carbs}g total)`,
    },
    {
      k: "Protein Share",
      label: "Protein",
      ringValue: proteinPct,
      ringLabel: `${proteinPct}%`,
      displayValue: totals.protein.toLocaleString("en-IN"),
      unit: "g",
      status: "Fresh",
      sub: `${proteinPct}% of pantry stock (${totals.protein}g total)`,
    },
    {
      k: "Fat Share",
      label: "Healthy Fats",
      ringValue: fatPct,
      ringLabel: `${fatPct}%`,
      displayValue: totals.fat.toLocaleString("en-IN"),
      unit: "g",
      status: "Good",
      sub: `${fatPct}% of pantry stock (${totals.fat}g total)`,
    },
    {
      k: "Fiber Density",
      label: "Dietary Fiber",
      ringValue: Math.min(100, Math.round((totals.fiber / 30) * 100)),
      ringLabel: `${totals.fiber}g`,
      displayValue: totals.fiber.toLocaleString("en-IN"),
      unit: "g",
      status: totals.fiber >= 30 ? "Fresh" : "Good",
      sub: `${highFiberCount} high-fiber item${highFiberCount !== 1 ? "s" : ""} in pantry`,
    },
  ];

  // 5. Bar chart data: X-axis categories (Vegetables, Fruits, Dairy, Pantry) grouping item-level macros
  const catChartData: CategoryMacro[] = Array.from(categoryMap.entries()).map(([cat, vals]) => ({
    d: cat,
    category: cat,
    carbs: Math.round(vals.carbs),
    protein: Math.round(vals.protein),
    fat: Math.round(vals.fat),
    fiber: Math.round(vals.fiber),
    itemCount: vals.itemCount,
  }));

  // 6. Intelligent Allergen Detection evaluating ingredient tags, notes, and food items in the pantry
  const allergenFoundMap = new Map<string, string[]>();
  ALL_ALLERGENS.forEach((a) => allergenFoundMap.set(a, []));

  activeItems.forEach((item) => {
    // 1. Direct allergens from Gemini multimodal scan schema
    if (Array.isArray(item.allergens)) {
      item.allergens.forEach((alg) => {
        const standardAllergen = ALL_ALLERGENS.find(a => a.toLowerCase() === String(alg).toLowerCase()) || alg;
        const existing = allergenFoundMap.get(standardAllergen) || [];
        if (!existing.includes(item.name)) {
          existing.push(item.name);
        }
        allergenFoundMap.set(standardAllergen, existing);
      });
    }

    // 2. Ingredient & food name heuristics
    const hits = detectAllergensInFood(item);
    hits.forEach((allergen) => {
      const existing = allergenFoundMap.get(allergen) || [];
      if (!existing.includes(item.name)) {
        existing.push(item.name);
      }
      allergenFoundMap.set(allergen, existing);
    });
  });

  const detectedAllergenList = ALL_ALLERGENS.filter((a) => (allergenFoundMap.get(a)?.length || 0) > 0);

  const insights: string[] = [];
  if (highFiberCount > 0) {
    insights.push(`Your pantry has ${highFiberCount} high-fiber item${highFiberCount > 1 ? "s" : ""} — great for digestion.`);
  }
  if (totals.protein < 50 && activeItems.length > 0) {
    insights.push("Protein density in current active stock is low. Consider adding eggs, paneer, or lentils.");
  } else if (totals.protein >= 70) {
    insights.push(`Great protein reserve (${totals.protein}g) available in your active pantry stock.`);
  }
  if (totals.fiber >= 25) {
    insights.push("Excellent fiber reserves! Keep up the fresh vegetables and whole grains.");
  }
  if (detectedAllergenList.length > 0) {
    insights.push(`${detectedAllergenList.length} allergen${detectedAllergenList.length > 1 ? "s" : ""} detected (${detectedAllergenList.join(", ")}). Review before cooking for guests.`);
  }
  if (insights.length === 0) {
    insights.push("Add items to your pantry to receive personalized nutritional breakdowns.");
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Nutrition"
        title="Nutrition & allergens"
        subtitle="Live nutritional macro aggregation across active, non-expired pantry inventory."
      />

      {!totals.hasData && items.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border bg-muted p-4 text-sm text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 text-primary" />
          No non-expired active items currently in pantry. Add fresh items to see live macro totals.
        </div>
      )}

      {/* Top Cards: Macro Distribution & Days of Stock (Pantry Inventory Share) */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            Pantry Macro Distribution & Days of Stock
          </h2>
          <span className="text-xs font-medium text-muted-foreground">
            {activeItems.length} active item{activeItems.length !== 1 ? "s" : ""} in stock
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {pantryMacroCards.map((c) => (
            <div key={c.k} className="card-surface flex flex-col items-center p-5 animate-rise shadow-sm text-center">
              <Ring
                value={c.ringValue}
                status={c.status}
                size={88}
                stroke={8}
                label={<span className="font-display text-sm font-bold">{c.ringLabel}</span>}
              />
              {totals.hasData ? (
                <p className="mt-3 font-display text-xl font-bold text-foreground">
                  {c.displayValue}
                  <span className="text-xs font-normal text-muted-foreground"> {c.unit}</span>
                </p>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">No data</p>
              )}
              <p className="font-medium text-xs text-foreground mt-0.5">{c.label}</p>
              <p className="text-[11px] text-muted-foreground leading-tight mt-1">{c.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Daily Consumption Log (what the user actually consumed today) */}
      <div className="card-surface p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">Daily Consumption Log</h2>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                Today's Actual Intake
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tracks actual consumed food against daily recommended nutrition goals (2,000 kcal / 70g protein / 260g carbs / 65g fat).
            </p>
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {consumedItems.length} item{consumedItems.length !== 1 ? "s" : ""} consumed
          </span>
        </div>

        {dailyConsumedTotals.hasLogged ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {dailyGoals.map((d) => {
              const pct = Math.round((d.v / d.goal) * 100);
              const status = pct >= 100 ? "Fresh" : pct >= 50 ? "Good" : "Use Soon";
              return (
                <div key={d.k} className="flex flex-col items-center rounded-2xl border bg-surface/50 p-4 text-center">
                  <Ring
                    value={Math.min(100, pct)}
                    status={status}
                    size={76}
                    stroke={7}
                    label={<span className="font-display text-xs font-bold">{pct}%</span>}
                  />
                  <p className="mt-2.5 font-display text-base font-bold text-foreground">
                    {d.v.toLocaleString("en-IN")}{" "}
                    <span className="text-xs font-normal text-muted-foreground">/ {d.goal} {d.u}</span>
                  </p>
                  <p className="text-xs font-medium text-foreground">{d.k}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{pct}% of daily goal</p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-border/80 bg-muted/20 p-4 text-xs text-muted-foreground">
            <Info className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-semibold text-foreground">No meals marked consumed today yet</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Mark items as "Consumed" or "Cooked" from your pantry to log your meals and compare your actual daily intake against your 2,000 kcal target.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Nutrition by Category Bar Chart */}
        <div className="card-surface p-6 lg:col-span-2 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Nutrition by Category</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Aggregated item-level macros grouped by food category
              </p>
            </div>
          </div>

          {catChartData.length === 0 ? (
            <div className="mt-12 flex flex-col items-center justify-center p-6 text-center text-sm text-muted-foreground">
              <Info className="h-8 w-8 text-muted-foreground/50 mb-2" />
              Add items to your pantry to see nutrition grouped by category.
            </div>
          ) : (
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={catChartData} barGap={4}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="category"
                    tickLine={false}
                    axisLine={false}
                    stroke="var(--muted-foreground)"
                    fontSize={12}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    unit="g"
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                    }}
                    cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    height={36}
                    iconType="circle"
                    wrapperStyle={{ paddingBottom: "12px", fontSize: "12px" }}
                  />
                  <Bar
                    dataKey="carbs"
                    name="Carbs (g)"
                    fill="#10b981"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="protein"
                    name="Protein (g)"
                    fill="#047857"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="fat"
                    name="Fat (g)"
                    fill="#f59e0b"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Nutritional Insights</h2>
          {insights.map((t) => (
            <div key={t} className="card-surface flex gap-3 p-5 shadow-sm">
              <Sparkles className="h-5 w-5 shrink-0 text-primary" />
              <p className="text-sm leading-relaxed">{t}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Allergen Detection & Quick Badges Row with clear green/red status tags */}
      <div className="card-surface p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Allergens in your pantry</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Evaluates ingredients and food names across active pantry items (Wheat/Bread &rarr; Gluten, Paneer/Milk &rarr; Milk, Cashews/Almonds &rarr; Nuts).
            </p>
          </div>
          <span className={cn(
            "text-xs font-semibold px-3 py-1 rounded-full",
            detectedAllergenList.length > 0
              ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
              : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
          )}>
            {detectedAllergenList.length} Detected · {ALL_ALLERGENS.length - detectedAllergenList.length} Safe
          </span>
        </div>

        {/* Quick Allergen Badges Row */}
        <div className="mb-6 rounded-2xl border border-border/80 bg-muted/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
            Quick Allergen Status Bar
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {ALL_ALLERGENS.map((a) => {
              const hits = allergenFoundMap.get(a) || [];
              const isDetected = hits.length > 0;
              return (
                <div
                  key={a}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-all border",
                    isDetected
                      ? "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  )}
                >
                  {isDetected ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  )}
                  <span>{a}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.2 text-[10px] font-bold uppercase",
                      isDetected
                        ? "bg-rose-600 text-white"
                        : "bg-emerald-600 text-white"
                    )}
                  >
                    {isDetected ? "Detected" : "Safe"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detailed Allergen Cards */}
        <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {ALL_ALLERGENS.map((a) => {
            const hits = allergenFoundMap.get(a) || [];
            const isDetected = hits.length > 0;
            return (
              <div
                key={a}
                className={cn(
                  "rounded-2xl border p-4 transition-all duration-200",
                  isDetected
                    ? "border-rose-500/40 bg-rose-500/10 dark:bg-rose-950/20 shadow-sm"
                    : "border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20"
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 font-semibold text-sm">
                    {isDetected ? (
                      <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    )}
                    <span className={isDetected ? "text-rose-900 dark:text-rose-200" : "text-foreground"}>
                      {a}
                    </span>
                  </div>
                </div>

                <div className="mt-2">
                  <span
                    className={cn(
                      "inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                      isDetected
                        ? "bg-rose-500/20 text-rose-700 dark:text-rose-300"
                        : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                    )}
                  >
                    {isDetected ? "Detected" : "Safe"}
                  </span>
                </div>

                <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                  {isDetected
                    ? `Found in ${hits.slice(0, 2).join(", ")}${hits.length > 2 ? ` +${hits.length - 2}` : ""}`
                    : "Not detected"}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
