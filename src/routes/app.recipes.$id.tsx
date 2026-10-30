import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Clock, Gauge, Check, Plus, Flame, IndianRupee, Leaf } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePantry } from "@/lib/pantry-store";
import { recipes } from "@/lib/pantry-data";
import { EmptyState } from "@/components/pantry/ui";

export const Route = createFileRoute("/app/recipes/$id")({
  head: () => ({ meta: [{ title: "Recipe — AI Smart Pantry" }, { name: "description", content: "Ingredients, steps, nutrition and food-waste impact for this recipe." }, { property: "og:title", content: "Recipe — AI Smart Pantry" }, { property: "og:description", content: "Cook from your pantry." }] }),
  component: RecipeDetail,
});

function RecipeDetail() {
  const { id } = Route.useParams();
  const { items, addShop } = usePantry();
  const r = recipes.find((x) => x.id === id);
  if (!r) return <EmptyState title="Recipe not found" body="It may have been removed." action={<Button asChild><Link to="/app/recipes">All recipes</Link></Button>} />;
  const available = r.uses.map((u) => items.find((i) => i.id === u || i.name.toLowerCase().includes(u.toLowerCase()) || u.toLowerCase().includes(i.name.toLowerCase()))).filter(Boolean);
  const notInPantry = r.uses.filter((u) => !items.some((i) => i.id === u || i.name.toLowerCase().includes(u.toLowerCase()) || u.toLowerCase().includes(i.name.toLowerCase())));

  return (
    <div className="space-y-8">
      <Link to="/app/recipes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Recipes</Link>
      <div className="relative overflow-hidden rounded-[2rem] shadow-lift animate-rise">
        <img src={r.image} alt={r.name} width={944} height={704} className="h-72 w-full object-cover sm:h-96" />
        <div className="absolute inset-x-4 bottom-4 glass rounded-3xl border p-5 sm:inset-x-6 sm:bottom-6">
          <h1 className="text-3xl font-bold sm:text-4xl">{r.name}</h1>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" />{r.time} min</span>
            <span className="inline-flex items-center gap-1"><Gauge className="h-4 w-4" />{r.difficulty}</span>
            <span className="inline-flex items-center gap-1"><IndianRupee className="h-4 w-4" />~₹{r.cost} to make</span>
            <span className="inline-flex items-center gap-1 font-semibold text-primary"><Leaf className="h-4 w-4" />Prevents ₹{r.wasteSaved} waste</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <div className="card-surface p-6">
            <h2 className="text-lg font-semibold">Ingredients</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {available.map((i) => <li key={i!.id} className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-fresh-soft text-fresh"><Check className="h-3 w-3" /></span>{i!.name}<span className="ml-auto text-xs text-muted-foreground">in pantry</span></li>)}
              {[...notInPantry, ...r.missing].map((m) => (
                <li key={m} className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-warn-soft text-warn"><Plus className="h-3 w-3" /></span><span className="capitalize">{m}</span>
                  <button className="ml-auto text-xs font-semibold text-primary hover:underline" onClick={() => { addShop({ name: m, qty: "1", category: "Other", priority: "Medium", section: "Need Now", reason: `Missing for ${r.name}` }); toast.success(`${m} added to your shopping list.`); }}>Add to list</button></li>
              ))}
            </ul>
          </div>
          <div className="card-surface p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Flame className="h-4 w-4 text-warn" />Nutrition <span className="text-sm font-normal text-muted-foreground">per serving</span></h2>
            <div className="mt-4 grid grid-cols-4 gap-2 text-center">
              {Object.entries(r.nutrition).map(([k, v]) => <div key={k} className="rounded-xl bg-surface p-2"><p className="font-display font-bold">{v}{k === "calories" ? "" : "g"}</p><p className="text-[10px] capitalize text-muted-foreground">{k}</p></div>)}
            </div>
          </div>
        </div>
        <div className="card-surface p-6">
          <h2 className="text-lg font-semibold">Instructions</h2>
          <ol className="mt-4 space-y-4">
            {r.steps.map((s, i) => <li key={i} className="flex gap-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft font-display font-bold text-primary">{i + 1}</span><p className="pt-1">{s}</p></li>)}
          </ol>
          <Button size="lg" variant="hero" className="mt-8 w-full sm:w-auto" onClick={() => toast.success(`Enjoy your ${r.name}! ${available.length} pantry items marked as used.`)}>Cook This</Button>
        </div>
      </div>
    </div>
  );
}
