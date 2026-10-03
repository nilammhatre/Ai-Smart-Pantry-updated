import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Clock, Gauge, Leaf } from "lucide-react";
import { usePantry } from "@/lib/pantry-store";
import { recipes } from "@/lib/pantry-data";
import { EmptyState, PageHeader } from "@/components/pantry/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/recipes/")({
  head: () => ({ meta: [{ title: "Recipes — AI Smart Pantry" }, { name: "description", content: "Recipes built from what's already in your pantry, prioritising food that expires soon." }, { property: "og:title", content: "Cook what you already have" }, { property: "og:description", content: "AI recipe recommendations from your pantry." }] }),
  component: Recipes,
});

const filters = ["Vegetarian", "Vegan", "Indian", "Quick meals", "Breakfast", "Lunch", "Dinner", "Snacks"];

function Recipes() {
  const { items } = usePantry();
  const [active, setActive] = useState<string[]>([]);
  const ids = new Set(items.map((i) => i.id));
  const soon = new Set(items.filter((i) => i.expiresInDays >= 0 && i.expiresInDays <= 3).map((i) => i.id));
  const list = recipes.filter((r) => active.every((a) => r.tags.includes(a)));

  return (
    <div>
      <PageHeader eyebrow="AI recipes" title="Cook what you already have." subtitle="Ranked by how much soon-to-expire food each recipe rescues." />
      <div className="no-scrollbar -mx-4 mb-8 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {filters.map((f) => (
          <button key={f} onClick={() => setActive((a) => (a.includes(f) ? a.filter((x) => x !== f) : [...a, f]))} className={cn("shrink-0 rounded-full border px-4 py-2 text-sm font-medium", active.includes(f) ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-secondary")}>{f}</button>
        ))}
      </div>
      {list.length === 0 ? <EmptyState title="No recipes match those filters" body="Try removing a filter or two." /> : (
        <div className="grid gap-6 md:grid-cols-2">
          {list.map((r, i) => {
            const have = r.uses.filter((u) => ids.has(u));
            const rescue = r.uses.filter((u) => soon.has(u)).length;
            return (
              <Link key={r.id} to="/app/recipes/$id" params={{ id: r.id }} className="card-surface lift group overflow-hidden animate-rise" style={{ animationDelay: `${i * 70}ms` }}>
                <div className="relative aspect-[16/10] overflow-hidden">
                  <img src={r.image} alt={r.name} loading="lazy" width={944} height={704} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  {rescue > 0 && <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-lift"><Leaf className="h-3.5 w-3.5" />Uses {rescue} item{rescue > 1 ? "s" : ""} that expire soon</span>}
                </div>
                <div className="p-5">
                  <h3 className="text-xl font-semibold">{r.name}</h3>
                  <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" />{r.time} min</span>
                    <span className="inline-flex items-center gap-1"><Gauge className="h-4 w-4" />{r.difficulty}</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span><b className="text-fresh">{have.length}</b> available · <b className={r.missing.length ? "text-warn" : "text-fresh"}>{r.missing.length}</b> missing</span>
                    <span className="font-semibold text-primary">Saves ₹{r.wasteSaved}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
