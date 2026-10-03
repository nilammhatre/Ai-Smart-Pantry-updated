import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LayoutGrid, List, Search, ScanLine, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePantry } from "@/lib/pantry-store";
import { categories, statusFor, daysLabel } from "@/lib/pantry-data";
import { EmptyState, FoodCard, FoodThumb, FreshBar, PageHeader, StatusBadge } from "@/components/pantry/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/pantry/")({
  head: () => ({ meta: [{ title: "My Pantry — AI Smart Pantry" }, { name: "description", content: "Browse, filter and sort everything in your pantry by freshness." }, { property: "og:title", content: "My Pantry — AI Smart Pantry" }, { property: "og:description", content: "Your visual food inventory." }] }),
  component: Pantry,
});

type Sort = "freshness" | "expiry" | "recent" | "category";

function Pantry() {
  const { items } = usePantry();
  const [cat, setCat] = useState<string>("All");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("expiry");
  const [view, setView] = useState<"grid" | "list">("grid");

  const list = useMemo(() => {
    const f = items.filter((i) => (cat === "All" || i.category === cat) && i.name.toLowerCase().includes(q.toLowerCase()));
    return [...f].sort((a, b) =>
      sort === "freshness" ? b.freshness - a.freshness : sort === "expiry" ? a.expiresInDays - b.expiresInDays : sort === "recent" ? a.addedDaysAgo - b.addedDaysAgo : a.category.localeCompare(b.category));
  }, [items, cat, q, sort]);

  return (
    <div>
      <PageHeader eyebrow={`${items.length} items`} title="My Pantry" subtitle="Everything you have, ordered by what needs eating first."
        actions={<><Button asChild variant="outline"><Link to="/app/scan" search={{ tab: "manual" }}><Plus /> Add manually</Link></Button><Button asChild><Link to="/app/scan"><ScanLine /> Scan</Link></Button></>} />

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pantry…" className="h-11 w-full rounded-full border bg-card pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="flex gap-2">
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="h-11 w-44 rounded-full bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="expiry">Expiry date</SelectItem>
              <SelectItem value="freshness">Freshness</SelectItem>
              <SelectItem value="recent">Recently added</SelectItem>
              <SelectItem value="category">Category</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex rounded-full border bg-card p-1">
            {(["grid", "list"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} aria-label={`${v} view`} className={cn("grid h-9 w-9 place-items-center rounded-full", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                {v === "grid" ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="no-scrollbar -mx-4 mb-8 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {["All", ...categories].map((c) => (
          <button key={c} onClick={() => setCat(c)} className={cn("shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors", cat === c ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-secondary")}>{c}</button>
        ))}
      </div>

      {list.length === 0 ? (
        items.length === 0 ? (
          <EmptyState title="Your pantry is empty." body="Scan your first food item to start tracking freshness." action={<Button asChild><Link to="/app/scan"><ScanLine /> Scan Food</Link></Button>} />
        ) : (
          <EmptyState title="Nothing matches." body="Try a different search or category." />
        )
      ) : view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((i, idx) => <div key={i.id} className="animate-rise" style={{ animationDelay: `${idx * 40}ms` }}><FoodCard item={i} /></div>)}
        </div>
      ) : (
        <div className="card-surface divide-y overflow-hidden">
          {list.map((i) => {
            const s = statusFor(i.freshness, i.expiresInDays);
            return (
              <Link key={i.id} to="/app/pantry/$id" params={{ id: i.id }} className="flex items-center gap-4 p-3 hover:bg-secondary/60">
                <FoodThumb item={i} className="h-12 w-12 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{i.name}</p>
                  <p className="text-xs text-muted-foreground">{i.quantity} · {i.storage}</p>
                </div>
                <div className="hidden w-32 sm:block"><FreshBar value={i.freshness} status={s} /></div>
                <span className="hidden w-28 text-right text-xs text-muted-foreground md:block">{daysLabel(i.expiresInDays)}</span>
                <StatusBadge status={s} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
