import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Recycle, IndianRupee, PackageCheck, Cloud, Sprout, Trophy, CheckCircle2, Sparkles, AlertTriangle, ChefHat, CalendarDays, Flame, ShieldAlert, Trash2, ArrowRight } from "lucide-react";
import { Counter, PageHeader } from "@/components/pantry/ui";
import { usePantry } from "@/lib/pantry-store";
import { calculateAnalytics } from "@/services/analyticsService";
import { normalizeCategoryBucket } from "@/services/analyticsCalculations";
import { generateImpactSummaryWithGemini } from "@/services/geminiService";

export const Route = createFileRoute("/app/insights")({
  head: () => ({
    meta: [
      { title: "Insights & Sustainability — AI Smart Pantry" },
      { name: "description", content: "Food consumed vs wasted, money saved and your carbon impact." },
      { property: "og:title", content: "Insights & Sustainability — AI Smart Pantry" },
      { property: "og:description", content: "See the impact of wasting less." }
    ]
  }),
  component: Insights,
});

const colors = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899"];

function Insights() {
  const { items, history } = usePantry();
  const [backendData, setBackendData] = useState<any>(null);
  const [conversationalSummary, setConversationalSummary] = useState<string>("");

  // Fetch live analytics & monthly event logs from backend API
  useEffect(() => {
    fetch("/api/analytics")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setBackendData(data);
        }
      })
      .catch((err) => console.warn("[Insights] Backend analytics fetch error:", err));
  }, [items]);

  // 1. Calculate impact counters directly from live pantry inventory and historical event logs
  const localAnalytics = calculateAnalytics(items, history);

  const foodSavedCount = backendData?.consumedCount !== undefined ? backendData.consumedCount : localAnalytics.foodSavedCount;
  const wastePreventedKg = backendData?.wastePreventedKg !== undefined ? backendData.wastePreventedKg : localAnalytics.wastePreventedKg;
  const moneySavedINR = backendData?.moneySavedINR !== undefined ? backendData.moneySavedINR : localAnalytics.moneySavedINR;
  const co2AvoidedKg = backendData?.co2AvoidedKg !== undefined ? backendData.co2AvoidedKg : localAnalytics.co2AvoidedKg;
  
  const freshCount = backendData?.activeCount ?? (localAnalytics.freshCount + localAnalytics.goodCount);
  const expiredCount = backendData?.expiredCount ?? localAnalytics.expiredCount;
  const discardedCount = backendData?.discardedCount ?? items.filter((it) => it.status === "discarded").length;
  const wastedCount = expiredCount + discardedCount;

  const totalTracked = backendData?.totalTracked || Math.max(items.length, localAnalytics.totalTracked, 1);

  // Redefine Utilization / Health Score: If items are fresh and 0 are wasted, pantry health is 100% Fresh / In Good Standing.
  // Only penalize utilization when items actually spoil or are discarded.
  const utilisationPct = backendData?.pantryUtilizationPercent !== undefined
    ? backendData.pantryUtilizationPercent
    : (totalTracked > 0
        ? Math.max(0, Math.min(100, Math.round(((totalTracked - wastedCount) / totalTracked) * 100)))
        : 100);

  // Gemini 2-sentence conversational impact summary
  useEffect(() => {
    let cancelled = false;
    generateImpactSummaryWithGemini({
      foodSavedCount,
      wastePreventedKg,
      moneySavedINR,
      co2AvoidedKg,
      freshCount,
      totalTracked
    }).then((summary) => {
      if (!cancelled && summary) {
        setConversationalSummary(summary);
      }
    });
    return () => { cancelled = true; };
  }, [foodSavedCount, wastePreventedKg, moneySavedINR, co2AvoidedKg, freshCount, totalTracked]);

  // 2. Category Breakdown for Donut Chart
  const activeItems = items.filter((i) => i.status !== "consumed" && i.status !== "discarded");
  const catMap = new Map<string, number>();
  activeItems.forEach((i) => {
    const bucket = normalizeCategoryBucket(i.category);
    catMap.set(bucket, (catMap.get(bucket) || 0) + 1);
  });

  const totalActive = activeItems.length || 1;
  const categoryChartData = backendData?.categoryBreakdown && backendData.categoryBreakdown.length > 0
    ? backendData.categoryBreakdown
    : Array.from(catMap.entries())
        .map(([name, count]) => ({
          name,
          count,
          v: Math.round((count / totalActive) * 100),
        }))
        .sort((a, b) => b.count - a.count);

  const topCategory = categoryChartData[0];

  // Most frequently tracked foods
  const nameCounts = new Map<string, number>();
  history.forEach((h) => nameCounts.set(h.name, (nameCounts.get(h.name) || 0) + 1));
  items.forEach((i) => nameCounts.set(i.name, (nameCounts.get(i.name) || 0) + 1));
  const frequent = Array.from(nameCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxFreq = frequent[0]?.[1] || 1;

  // 3. Consumed vs. Wasted Chart: query actual monthly event logs
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const now = new Date();

  // If backend provided actual logs, use them; otherwise, compute from actual dates
  const monthlyTrendsData = backendData?.monthlyTrends || Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const m = monthNames[d.getMonth()];
    const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    const consumedInMonth = items.filter(
      (it) => it.status === "consumed" && ((it.consumeByDate && it.consumeByDate.startsWith(yearMonth)) || (it.purchaseDate && it.purchaseDate.startsWith(yearMonth)))
    ).length;

    const wastedInMonth = items.filter(
      (it) => (it.status === "discarded" || (typeof it.expiresInDays === "number" && it.expiresInDays < 0)) && (it.consumeByDate && it.consumeByDate.startsWith(yearMonth))
    ).length;

    return { m, consumed: consumedInMonth, wasted: wastedInMonth };
  });

  const hasEventRecords = foodSavedCount > 0 || wastedCount > 0 || monthlyTrendsData.some((d: any) => d.consumed > 0 || d.wasted > 0);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Insights"
        title={<span className="text-foreground dark:text-white font-extrabold tracking-tight">Your food habits & sustainability</span>}
        subtitle="Real-time pantry utilization, waste prevention, and monthly consumption trends."
      />

      {/* Summary Impact Banner */}
      <div className="relative overflow-hidden rounded-[2rem] bg-brand p-8 text-primary-foreground shadow-lift animate-rise">
        <Sprout className="absolute -right-6 -top-6 h-40 w-40 opacity-15" />
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary-foreground/80">
          <Sparkles className="h-3.5 w-3.5" />
          <span>{monthNames[now.getMonth()]} {now.getFullYear()} Conversational Impact Summary</span>
        </div>
        <p className="mt-2.5 max-w-2xl font-display text-xl font-bold sm:text-2xl leading-relaxed">
          {conversationalSummary || (foodSavedCount > 0
            ? `You have rescued ${foodSavedCount} food item${foodSavedCount !== 1 ? "s" : ""}, prevented ${wastePreventedKg} kg of waste, and saved an estimated ₹${moneySavedINR.toLocaleString("en-IN")}. Your kitchen is operating at peak freshness while keeping nutritious food out of landfills.`
            : `All ${totalTracked} pantry items are currently fresh and tracked (100% in good standing). Mark items as 'Consumed' or 'Cooked' from your pantry to start tracking your savings and CO₂ impact!`)}
        </p>
      </div>

      {/* Savings & Impact Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { l: "Food Waste Prevented", v: wastePreventedKg, s: " kg", I: Recycle },
          { l: "Money Saved", v: moneySavedINR, p: "₹", I: IndianRupee },
          { l: "Food Rescued", v: foodSavedCount, s: " items", I: PackageCheck },
          { l: "Carbon Impact", v: co2AvoidedKg, s: " kg CO₂", I: Cloud },
        ].map((m, i) => (
          <div key={m.l} className="card-surface lift p-5 animate-rise shadow-sm" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary-soft text-primary">
              <m.I className="h-5 w-5" />
            </div>
            <p className="mt-4 font-display text-3xl font-bold">
              <Counter value={m.v} prefix={m.p} suffix={m.s} />
            </p>
            <p className="text-sm text-muted-foreground">{m.l}</p>
          </div>
        ))}
      </div>

      {/* Pantry Utilization Progress */}
      <div className="card-surface flex flex-col gap-4 p-6 sm:flex-row sm:items-center shadow-sm">
        <Trophy className="h-10 w-10 shrink-0 text-amber-500" />
        <div className="flex-1">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-foreground">
                {wastedCount === 0 ? (
                  <>Pantry Health: <span className="text-emerald-600 dark:text-emerald-400 font-bold">100% (Fresh)</span></>
                ) : (
                  <>Dynamic Pantry Utilization: <span className="text-primary font-bold">{utilisationPct}%</span></>
                )}
              </p>
              {wastedCount === 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  100% Fresh / In Good Standing
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground font-medium">
              {foodSavedCount === 0 && wastedCount === 0
                ? `${totalTracked} of ${totalTracked} items fresh & in good standing · 0 wasted`
                : `${foodSavedCount} consumed · ${freshCount} active · ${wastedCount} wasted of ${totalTracked} tracked`}
            </span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand transition-all duration-1000"
              style={{ width: `${utilisationPct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Consumed vs. Wasted Chart / Encouraging Empty State */}
        <div className="card-surface p-6 lg:col-span-2 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Consumed vs Wasted (Last 6 Months)</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Actual monthly event records of consumed vs expired/discarded items
              </p>
            </div>
            {hasEventRecords && (
              <div className="flex items-center gap-4 text-xs font-medium">
                <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  Consumed
                </span>
                <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                  Wasted
                </span>
              </div>
            )}
          </div>

          {!hasEventRecords ? (
            <div className="my-auto flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/20 p-8 text-center animate-rise">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mb-3">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="font-display text-base font-semibold text-foreground">
                No waste recorded yet!
              </h3>
              <p className="mt-1.5 max-w-md text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Mark items as &apos;Consumed&apos; or &apos;Cooked&apos; from your pantry to start tracking your savings and CO₂ impact.
              </p>
              <Link
                to="/app/pantry"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
              >
                <PackageCheck className="h-3.5 w-3.5" />
                Go to Pantry
              </Link>
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyTrendsData}>
                  <defs>
                    <linearGradient id="gc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gw" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="m" tickLine={false} axisLine={false} stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
                  <Tooltip
                    formatter={(value, name) => [`${value} item${Number(value) !== 1 ? "s" : ""}`, name === "consumed" ? "Consumed" : "Wasted"]}
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                    }}
                  />
                  <Area type="monotone" dataKey="consumed" name="consumed" stroke="#10b981" strokeWidth={2.5} fill="url(#gc)" />
                  <Area type="monotone" dataKey="wasted" name="wasted" stroke="#f43f5e" strokeWidth={2.5} fill="url(#gw)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Category Pie/Donut Chart: Non-truncated full labels, accurate percentages */}
        <div className="card-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Inventory by Category</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Active category share in live inventory
          </p>

          {categoryChartData.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">No active items in pantry to categorize.</p>
          ) : (
            <div className="mt-4">
              <div className="relative mx-auto h-52 w-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryChartData}
                      dataKey="v"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={88}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {categoryChartData.map((_: any, i: number) => (
                        <Cell key={i} fill={colors[i % colors.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [
                        `${value}% (${categoryChartData.find((x: any) => x.name === name)?.count || 0} items)`,
                        `${name}`
                      ]}
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* Donut Center Display without truncation */}
                {topCategory && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2 pointer-events-none">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Top Category
                    </span>
                    <span
                      className="font-display text-sm font-bold text-foreground max-w-[110px] truncate"
                      title={topCategory.name}
                    >
                      {topCategory.name}
                    </span>
                    <span className="font-display text-base font-bold text-primary">
                      {topCategory.v}%
                    </span>
                  </div>
                )}
              </div>

              {/* Clean Legend with full labels and item counts */}
              <ul className="mt-5 space-y-2 text-sm border-t pt-3">
                {categoryChartData.map((w: any, i: number) => (
                  <li key={w.name} className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ background: colors[i % colors.length] }}
                    />
                    <span className="font-medium text-foreground">{w.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({w.count} item{w.count > 1 ? "s" : ""})
                    </span>
                    <span className="ml-auto font-semibold text-foreground">{w.v}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Most frequently tracked */}
        <div className="card-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Most Frequently Tracked</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Top foods logged in your smart pantry</p>
          {frequent.length === 0 ? (
            <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/20 p-8 text-center animate-rise">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary mb-3">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="font-display text-base font-semibold text-foreground">
                Start tracking your foods
              </h3>
              <p className="mt-1.5 max-w-xs text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Scan grocery items or receipts to see your most frequently used ingredients and habits here.
              </p>
              <Link
                to="/app/scan"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
              >
                <PackageCheck className="h-3.5 w-3.5" />
                Scan Food Now
              </Link>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {frequent.map(([n, c]) => (
                <li key={n} className="text-sm">
                  <div className="flex justify-between">
                    <span className="truncate max-w-[200px] font-medium">{n}</span>
                    <span className="text-muted-foreground font-semibold">{c}×</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(c / maxFreq) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Pantry Utilization Summary Card */}
        <div className="card-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold">
            {wastedCount === 0 ? "Pantry Health (Fresh)" : "Pantry Utilization & Freshness"}
          </h2>
          <p className="mt-4 font-display text-5xl font-bold text-emerald-600 dark:text-emerald-400">
            {wastedCount === 0 ? "100%" : <Counter value={utilisationPct} suffix="%" />}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {wastedCount === 0
              ? "100% Pantry Health (Fresh)! All items in your pantry are in good standing with zero food wasted. Mark items as 'Consumed' or 'Cooked' as you eat them to track waste prevented."
              : utilisationPct >= 80
              ? "Outstanding! The vast majority of tracked food gets eaten before spoilage."
              : utilisationPct >= 40
              ? "Healthy progress — maintain good pantry habits to maximize utilization."
              : "Active pantry stage: scan items and cook recipes to reduce waste and boost utilization."}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-surface border border-emerald-500/20 p-3.5">
              <p className="font-bold text-emerald-600 dark:text-emerald-400 text-xl">
                {freshCount}
              </p>
              <p className="text-muted-foreground font-medium mt-0.5">Fresh items</p>
            </div>
            <div className="rounded-xl bg-surface border border-rose-500/20 p-3.5">
              <p className="font-bold text-rose-600 dark:text-rose-400 text-xl">{expiredCount}</p>
              <p className="text-muted-foreground font-medium mt-0.5">Expired / Wasted</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
