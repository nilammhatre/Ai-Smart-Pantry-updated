import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LayoutGrid, List, Search, ScanLine, Plus, Download, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePantry } from "@/lib/pantry-store";
import { categories, statusFor, daysLabel, getDeterministicDaysLeft, getExpiryBadge, getExpiryCategory, type ExpiryCategory } from "@/lib/pantry-data";
import { EmptyState, FoodCard, FoodThumb, FreshBar, PageHeader, StatusBadge } from "@/components/pantry/ui";
import { cn } from "@/lib/utils";
import ImportDemoOrder from "@/components/pantry/ImportDemoOrder";

export const Route = createFileRoute("/app/pantry/")({
  head: () => ({
    meta: [
      { title: "My Pantry — AI Smart Pantry" },
      { name: "description", content: "Browse, filter and sort everything in your pantry by freshness." },
      { property: "og:title", content: "My Pantry — AI Smart Pantry" },
      { property: "og:description", content: "Your visual food inventory." }
    ]
  }),
  component: Pantry,
});

type Sort = "freshness" | "expiry" | "recent" | "category";

function Pantry() {
  const { items, syncPantryDb } = usePantry();
  const [cat, setCat] = useState<string>("All");
  const [expiryFilter, setExpiryFilter] = useState<string>("All");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("expiry");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [showImportModal, setShowImportModal] = useState(false);

  const list = useMemo(() => {
    const f = items.filter((i) => {
      const matchCat = cat === "All" || i.category === cat;
      const matchQ = i.name.toLowerCase().includes(q.toLowerCase());
      const daysLeft = getDeterministicDaysLeft(i);
      const category = getExpiryCategory(daysLeft);
      const matchExpiry = expiryFilter === "All" || category === expiryFilter;
      return matchCat && matchQ && matchExpiry;
    });

    return [...f].sort((a, b) => {
      const daysA = getDeterministicDaysLeft(a);
      const daysB = getDeterministicDaysLeft(b);
      return sort === "freshness"
        ? b.freshness - a.freshness
        : sort === "expiry"
        ? daysA - daysB
        : sort === "recent"
        ? a.addedDaysAgo - b.addedDaysAgo
        : a.category.localeCompare(b.category);
    });
  }, [items, cat, expiryFilter, q, sort]);

  const handleImportSuccess = () => {
    syncPantryDb();
    setShowImportModal(false);
    toast.success("Swiggy Instamart / Kaggle demo items added to your pantry!", {
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    });
  };

  return (
    <div>
      <PageHeader
        eyebrow={`${items.length} items`}
        title="My Pantry"
        subtitle="Everything you have, ordered by what needs eating first."
        actions={
          <>
            <Button variant="outline" onClick={() => setShowImportModal(true)}>
              <Download className="mr-1.5 h-4 w-4 text-emerald-600" /> Import Orders
            </Button>
            <Button asChild variant="outline">
              <Link to="/app/scan" search={{ tab: "manual" }}>
                <Plus /> Add manually
              </Link>
            </Button>
            <Button asChild>
              <Link to="/app/scan">
                <ScanLine /> Scan
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pantry…"
            className="h-11 w-full rounded-full border bg-card pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-2">
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="h-11 w-44 rounded-full bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="expiry">Expiry date</SelectItem>
              <SelectItem value="freshness">Freshness</SelectItem>
              <SelectItem value="recent">Recently added</SelectItem>
              <SelectItem value="category">Category</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex rounded-full border bg-card p-1">
            {(["grid", "list"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-label={`${v} view`}
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-full transition-colors",
                  view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                )}
              >
                {v === "grid" ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Strict Expiry State Filter Tabs */}
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {[
          { id: "All", label: "All Items", count: items.length },
          { id: "Expired Items", label: "Expired Items", count: items.filter((i) => getDeterministicDaysLeft(i) < 0).length },
          { id: "Expiring Today", label: "Expiring Today", count: items.filter((i) => getDeterministicDaysLeft(i) === 0).length },
          { id: "Expiring in 1–3 Days", label: "Expiring in 1–3 Days", count: items.filter((i) => { const dl = getDeterministicDaysLeft(i); return dl >= 1 && dl <= 3; }).length },
          { id: "Fresh Stock", label: "Fresh Stock", count: items.filter((i) => getDeterministicDaysLeft(i) > 3).length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setExpiryFilter(tab.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors",
              expiryFilter === tab.id
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "bg-card hover:bg-secondary text-muted-foreground"
            )}
          >
            <span>{tab.label}</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                expiryFilter === tab.id ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
              )}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      <div className="no-scrollbar -mx-4 mb-8 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {["All", ...categories].map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              cat === c ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-secondary"
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        items.length === 0 ? (
          <EmptyState
            title="Your pantry is empty."
            body="Scan your first food item or import a Swiggy Instamart order."
            action={
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowImportModal(true)}>
                  <Download /> Import Order
                </Button>
                <Button asChild>
                  <Link to="/app/scan">
                    <ScanLine /> Scan Food
                  </Link>
                </Button>
              </div>
            }
          />
        ) : (
          <EmptyState title="Nothing matches." body="Try a different search, category, or expiry filter." />
        )
      ) : view === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((i, idx) => (
            <div key={i.id} className="animate-rise" style={{ animationDelay: `${idx * 30}ms` }}>
              <FoodCard item={i} />
            </div>
          ))}
        </div>
      ) : (
        <div className="card-surface divide-y overflow-hidden rounded-2xl border">
          {list.map((i) => {
            const daysLeft = getDeterministicDaysLeft(i);
            const expiryBadge = getExpiryBadge(daysLeft);
            const s = statusFor(i.freshness, daysLeft);
            return (
              <div key={i.id} className="flex items-center gap-4 p-3 hover:bg-secondary/60">
                <Link to="/app/pantry/$id" params={{ id: i.id }} className="flex items-center gap-3 min-w-0 flex-1">
                  <FoodThumb item={i} className="h-12 w-12 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">{i.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.quantity} · {i.storage}
                    </p>
                  </div>
                </Link>

                <span className={cn("px-2 py-0.5 text-[10px] font-bold rounded-md shrink-0 border", expiryBadge.badgeClass)}>
                  {expiryBadge.text}
                </span>

                <div className="hidden w-28 sm:block">
                  <FreshBar value={i.freshness} status={s} />
                </div>
                <span className="hidden w-28 text-right text-xs text-muted-foreground md:block">
                  {daysLabel(daysLeft)}
                </span>
                <StatusBadge status={s} />
              </div>
            );
          })}
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-card p-6 shadow-2xl">
            <button
              onClick={() => setShowImportModal(false)}
              className="absolute right-5 top-5 rounded-full p-2 text-muted-foreground hover:bg-muted"
            >
              ✕
            </button>
            <ImportDemoOrder onImportSuccess={handleImportSuccess} />
          </div>
        </div>
      )}
    </div>
  );
}
