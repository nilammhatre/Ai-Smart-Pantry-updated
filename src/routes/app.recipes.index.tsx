import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  Clock,
  Gauge,
  Leaf,
  Sparkles,
  ChefHat,
  Check,
  UtensilsCrossed,
  Flame,
  CheckCircle2,
  ListOrdered,
  ScanLine,
  ArrowRight
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { usePantry } from "@/lib/pantry-store";
import { recipes as staticRecipes, getDeterministicDaysLeft } from "@/lib/pantry-data";
import { EmptyState, PageHeader } from "@/components/pantry/ui";
import { cn } from "@/lib/utils";
import {
  generateZeroWasteRecipes,
  getRecipeImage,
  type GeminiStructuredRecipe
} from "@/services/geminiService";

export const Route = createFileRoute("/app/recipes/")({
  head: () => ({
    meta: [
      { title: "Chef-Grade Zero-Waste Recipes — AI Smart Pantry" },
      { name: "description", content: "Interactive AI kitchen assistant prioritizing pantry items expiring in 3 days or less." },
      { property: "og:title", content: "Chef-Grade Zero-Waste Kitchen Assistant" },
      { property: "og:description", content: "Pantry-aware recipes with interactive cooking mode and ingredient deduction." }
    ]
  }),
  component: Recipes,
});

/**
 * Filter pills requested by user
 */
const FILTER_PILLS = [
  "All Recipes",
  "Use Expiring First",
  "Under 20 Mins",
  "High Protein",
  "Vegetarian"
] as const;

type FilterType = (typeof FILTER_PILLS)[number];

/**
 * High-quality image component with graceful fallback to styled dish illustration
 */
function RecipeCardImage({
  src,
  alt,
  cuisine,
  timeMins,
  title
}: {
  src?: string;
  alt: string;
  cuisine: string;
  timeMins: number;
  title: string;
}) {
  const [hasError, setHasError] = useState(!src);

  if (hasError || !src) {
    return (
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-primary/15 flex flex-col justify-between p-5 border-b border-border/40 select-none">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1 text-xs font-semibold text-foreground shadow-sm backdrop-blur-sm border">
            <UtensilsCrossed className="h-3.5 w-3.5 text-primary" />
            {cuisine}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-sm border">
            <Clock className="h-3 w-3" />
            {timeMins} min
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/20 text-primary border border-primary/30 shadow-inner">
            <ChefHat className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-base font-bold text-foreground truncate">{title}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-amber-500" /> Chef-Crafted Recipe
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted group">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setHasError(true)}
        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/30 pointer-events-none" />
      <div className="absolute top-3 left-3">
        <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md shadow-sm border border-white/10">
          <UtensilsCrossed className="h-3 w-3 text-primary-light" />
          {cuisine}
        </span>
      </div>
      <div className="absolute top-3 right-3">
        <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md shadow-sm border border-white/10">
          <Clock className="h-3 w-3" /> {timeMins}m
        </span>
      </div>
    </div>
  );
}

/**
 * Adapter to unify static recipes with the GeminiStructuredRecipe interface,
 * accurately matching against real pantry stock.
 */
function adaptStaticRecipe(r: (typeof staticRecipes)[0], pantryItems: any[]): GeminiStructuredRecipe {
  const matchedPantryItems: string[] = [];
  const missingIngredients: string[] = [...r.missing];

  for (const uid of r.uses) {
    const found = pantryItems.find((it) => {
      const itName = (it.name || "").toLowerCase();
      const u = uid.toLowerCase();
      return it.id === uid || itName.includes(u) || u.includes(itName);
    });
    if (found) {
      if (!matchedPantryItems.includes(found.name)) {
        matchedPantryItems.push(found.name);
      }
    } else {
      missingIngredients.push(uid.charAt(0).toUpperCase() + uid.slice(1));
    }
  }

  const totalRequired = matchedPantryItems.length + missingIngredients.length;
  const matchPct = totalRequired > 0
    ? Math.round((matchedPantryItems.length / totalRequired) * 100)
    : 0;

  const prep = Math.round(r.time * 0.35);
  const cook = r.time - prep;

  const tags = [...r.tags];
  if (r.time <= 20 && !tags.includes("Under 20 Mins")) tags.push("Under 20 Mins");
  if (r.nutrition.protein >= 12 && !tags.includes("High Protein")) tags.push("High Protein");
  if (matchedPantryItems.length > 0 && pantryItems.some((it) => getDeterministicDaysLeft(it) <= 3 && matchedPantryItems.includes(it.name))) {
    tags.push("Use Expiring First");
  }

  return {
    id: r.id,
    title: r.name,
    cuisine: r.tags.includes("Indian") ? "Indian" : "Continental",
    difficulty: r.difficulty === "Hard" ? "Medium" : r.difficulty,
    prep_time_mins: prep,
    cook_time_mins: cook,
    matched_pantry_items: matchedPantryItems,
    pantry_match_percentage: matchPct,
    missing_staples: missingIngredients,
    steps: r.steps,
    calories_per_serving: r.nutrition.calories,
    tags,
    image: r.image || getRecipeImage({ title: r.name, tags, matched_pantry_items: matchedPantryItems }),
    prep_time: `${r.time} mins`,
    ingredients_used_from_pantry: matchedPantryItems,
    missing_pantry_staples: missingIngredients,
    quick_instructions: r.steps,
    estimated_savings_inr: r.wasteSaved
  };
}

function Recipes() {
  const { items, consumeItem } = usePantry();
  const [activeFilters, setActiveFilters] = useState<Set<FilterType>>(new Set(["All Recipes"]));
  const [aiRecipes, setAiRecipes] = useState<GeminiStructuredRecipe[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [cookedRecipeIds, setCookedRecipeIds] = useState<Set<string>>(new Set());

  // Interactive "Cook This" Modal State
  const [activeCookingRecipe, setActiveCookingRecipe] = useState<GeminiStructuredRecipe | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Record<string, Set<number>>>({});
  const [isDeducting, setIsDeducting] = useState(false);

  // Items expiring within 3 days (Priority Rule)
  const expiringSoonItems = useMemo(() => {
    return items.filter((i) => {
      const days = getDeterministicDaysLeft(i);
      return days >= 0 && days <= 3 && !i.hasCriticalSpoilage && i.spoilageStatus !== "SPOILED";
    });
  }, [items]);

  // Adapt static recipes
  const adaptedCatalog = useMemo(() => {
    return staticRecipes.map((r) => adaptStaticRecipe(r, items));
  }, [items]);

  // Combined recipe list (Gemini recipes first, followed by catalog)
  const allRecipes = useMemo(() => {
    const list = [...aiRecipes];
    const existingIds = new Set(list.map((r) => r.id));
    for (const cat of adaptedCatalog) {
      if (!existingIds.has(cat.id)) {
        list.push(cat);
      }
    }
    return list;
  }, [aiRecipes, adaptedCatalog]);

  // Recipe generation with Gemini AI (gemini-2.5-flash)
  const handleGenerateAiRecipes = async () => {
    setIsGenerating(true);
    try {
      const generated = await generateZeroWasteRecipes(items, { maxRecipes: 4 });
      setAiRecipes(generated);
      toast.success(`Chef Gemini created ${generated.length} zero-waste meals prioritizing your expiring pantry stock!`, {
        icon: <ChefHat className="h-4 w-4 text-emerald-500" />
      });
    } catch {
      toast.error("Could not generate recipes right now. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Auto-generate on initial load if pantry has items
  useEffect(() => {
    if (items.length > 0 && aiRecipes.length === 0) {
      handleGenerateAiRecipes();
    }
  }, [items.length]);

  // Filter selection toggle
  const toggleFilter = (filter: FilterType) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (filter === "All Recipes") {
        return new Set(["All Recipes"]);
      }
      next.delete("All Recipes");
      if (next.has(filter)) {
        next.delete(filter);
        if (next.size === 0) {
          next.add("All Recipes");
        }
      } else {
        next.add(filter);
      }
      return next;
    });
  };

  // Filtered recipe list (sorted by actual pantry match percentage and expiring priority)
  const filteredRecipes = useMemo(() => {
    let list = allRecipes;
    if (!(activeFilters.has("All Recipes") && activeFilters.size === 1)) {
      const expiringNames = new Set(expiringSoonItems.map((it) => it.name.toLowerCase()));
      list = allRecipes.filter((recipe) => {
        let matches = true;

        if (activeFilters.has("Use Expiring First")) {
          const usesExpiring =
            recipe.tags.includes("Use Expiring First") ||
            recipe.matched_pantry_items.some((ing) =>
              Array.from(expiringNames).some((en) => ing.toLowerCase().includes(en) || en.includes(ing.toLowerCase()))
            );
          if (!usesExpiring) matches = false;
        }

        if (activeFilters.has("Under 20 Mins")) {
          const totalTime = recipe.prep_time_mins + recipe.cook_time_mins;
          const isQuick = totalTime <= 20 || recipe.tags.includes("Under 20 Mins");
          if (!isQuick) matches = false;
        }

        if (activeFilters.has("High Protein")) {
          const isHighProtein =
            recipe.tags.includes("High Protein") ||
            recipe.calories_per_serving >= 240 ||
            recipe.matched_pantry_items.some((m) =>
              ["paneer", "egg", "milk", "curd", "chicken", "dal", "tofu"].some((p) => m.toLowerCase().includes(p))
            );
          if (!isHighProtein) matches = false;
        }

        if (activeFilters.has("Vegetarian")) {
          const isVeg =
            recipe.tags.includes("Vegetarian") ||
            !recipe.matched_pantry_items.some((m) => ["chicken", "meat", "fish", "pork"].some((nonVeg) => m.toLowerCase().includes(nonVeg)));
          if (!isVeg) matches = false;
        }

        return matches;
      });
    }

    // Sort: Recipes with higher pantry match % come first
    return [...list].sort((a, b) => {
      const aExpiring = a.tags.includes("Use Expiring First") ? 1 : 0;
      const bExpiring = b.tags.includes("Use Expiring First") ? 1 : 0;
      if (bExpiring !== aExpiring) return bExpiring - aExpiring;
      return (b.pantry_match_percentage || 0) - (a.pantry_match_percentage || 0);
    });
  }, [allRecipes, activeFilters, expiringSoonItems]);

  // Step toggle in "Cook This" modal
  const toggleStepCompleted = (recipeId: string, stepIndex: number) => {
    setCompletedSteps((prev) => {
      const current = new Set(prev[recipeId] || []);
      if (current.has(stepIndex)) {
        current.delete(stepIndex);
      } else {
        current.add(stepIndex);
      }
      return { ...prev, [recipeId]: current };
    });
  };

  // Action: Deduct ingredients from pantry when cooked
  const handleDeductFromPantry = async (recipe: GeminiStructuredRecipe) => {
    setIsDeducting(true);
    let rescuedCount = 0;
    const rescuedNames: string[] = [];

    try {
      for (const ingName of recipe.matched_pantry_items) {
        const matched = items.find(
          (it) =>
            it.name.toLowerCase().includes(ingName.toLowerCase()) ||
            ingName.toLowerCase().includes(it.name.toLowerCase())
        );
        if (matched) {
          try {
            await consumeItem(matched.id);
            rescuedCount++;
            rescuedNames.push(matched.name);
          } catch (e) {
            console.warn("Could not consume item:", matched.name, e);
          }
        }
      }

      setCookedRecipeIds((prev) => new Set(prev).add(recipe.id));

      if (rescuedCount > 0) {
        toast.success(
          `Bon appétit! Rescued ${rescuedCount} item${rescuedCount !== 1 ? "s" : ""} (${rescuedNames.slice(0, 3).join(", ")}) from going to waste!`,
          { icon: <ChefHat className="h-5 w-5 text-emerald-500" /> }
        );
      } else {
        toast.success(`Marked "${recipe.title}" as cooked!`, {
          icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        });
      }

      setActiveCookingRecipe(null);
    } catch {
      toast.error("Failed to deduct ingredients. Please try again.");
    } finally {
      setIsDeducting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <PageHeader
        eyebrow="Interactive Kitchen Assistant"
        title="Chef-Grade Zero-Waste Cooking"
        subtitle="Gemini AI personalizes gourmet recipes prioritizing ingredients expiring in 3 days or less."
        actions={
          <Button
            onClick={handleGenerateAiRecipes}
            disabled={isGenerating || items.length === 0}
            className="gap-2 shadow-soft font-medium"
          >
            <Sparkles className={cn("h-4 w-4", isGenerating && "animate-spin text-amber-400")} />
            {isGenerating ? "Gemini Chef is Crafting..." : "Craft Fresh Meals"}
          </Button>
        }
      />

      {/* Priority Rescuable Alert Banner */}
      <div className="rounded-3xl border border-primary/25 bg-gradient-to-r from-primary-soft/60 via-background to-primary-soft/40 p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <Leaf className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base font-bold text-foreground">
                  Zero-Waste Priority: {expiringSoonItems.length} Item{expiringSoonItems.length !== 1 ? "s" : ""} Expiring Soon (&le; 3 Days)
                </h2>
                {expiringSoonItems.length > 0 && (
                  <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                    Rescue First
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {expiringSoonItems.length > 0
                  ? `Active rescue queue: ${expiringSoonItems.map((i) => `${i.name} (${getDeterministicDaysLeft(i)}d left)`).join(", ")}`
                  : "All pantry stock is currently fresh! Gemini is suggesting creative recipes from your pantry staples."}
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateAiRecipes}
            disabled={isGenerating}
            className="shrink-0 self-start sm:self-auto gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Refresh Recipes
          </Button>
        </div>
      </div>

      {/* Interactive Filter Bar */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <ChefHat className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Kitchen-Ready Recipes ({filteredRecipes.length})
            </h2>
          </div>
          <span className="text-xs text-muted-foreground">
            Tap filter pills to narrow meal ideas
          </span>
        </div>

        {/* Filter Pills */}
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {FILTER_PILLS.map((pill) => {
            const isSelected = activeFilters.has(pill);
            return (
              <button
                key={pill}
                type="button"
                onClick={() => toggleFilter(pill)}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold transition-all cursor-pointer select-none",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-card hover:bg-secondary text-foreground hover:border-primary/40"
                )}
              >
                {pill === "Use Expiring First" && <Leaf className="h-3.5 w-3.5 text-emerald-400" />}
                {pill === "Under 20 Mins" && <Clock className="h-3.5 w-3.5" />}
                {pill === "High Protein" && <Flame className="h-3.5 w-3.5 text-orange-400" />}
                {pill === "Vegetarian" && <Sparkles className="h-3.5 w-3.5 text-emerald-400" />}
                {pill}
              </button>
            );
          })}
        </div>
      </section>

      {/* Recipe Cards Grid */}
      {filteredRecipes.length === 0 ? (
        <EmptyState
          title="No recipes found for active filters"
          body="Try switching filter pills or tapping 'Craft Fresh Meals' to ask Gemini for more ideas."
          action={
            <Button variant="outline" size="sm" onClick={() => setActiveFilters(new Set(["All Recipes"]))}>
              Reset Filters
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredRecipes.map((recipe, idx) => {
            const isCooked = cookedRecipeIds.has(recipe.id);
            const totalTime = recipe.prep_time_mins + recipe.cook_time_mins;

            return (
              <div
                key={recipe.id || idx}
                className="card-surface lift group flex flex-col justify-between overflow-hidden rounded-3xl border transition-all duration-300 shadow-sm animate-rise"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <div>
                  {/* Recipe Image with Clean Fallback */}
                  <RecipeCardImage
                    src={recipe.image}
                    alt={recipe.title}
                    cuisine={recipe.cuisine}
                    timeMins={totalTime}
                    title={recipe.title}
                  />

                  <div className="p-5 space-y-4">
                    {/* Header: Title & Pantry Match Badge */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        {/* Pantry Match Pill */}
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border shadow-xs",
                            recipe.pantry_match_percentage >= 85
                              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                              : "bg-primary/10 border-primary/25 text-primary"
                          )}
                        >
                          <Sparkles className="h-3 w-3" />
                          {recipe.pantry_match_percentage}% In Your Pantry
                        </span>

                        {/* Difficulty */}
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-medium">
                          <Gauge className="h-3.5 w-3.5" />
                          {recipe.difficulty}
                        </span>
                      </div>

                      <h3 className="font-display text-lg font-bold text-foreground leading-snug group-hover:text-primary transition-colors">
                        {recipe.title}
                      </h3>
                    </div>

                    {/* Matched Pantry Ingredients */}
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center justify-between">
                        <span>Pantry Ingredients ({recipe.matched_pantry_items.length}):</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold lowercase">
                          in stock
                        </span>
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {recipe.matched_pantry_items.map((ing, iIdx) => (
                          <span
                            key={iIdx}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-200 border border-emerald-500/30"
                          >
                            <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                            {ing}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Missing Staples */}
                    {recipe.missing_staples && recipe.missing_staples.length > 0 && (
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                          Missing Staples:
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {recipe.missing_staples.map((staple, sIdx) => (
                            <span
                              key={sIdx}
                              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground border border-border"
                            >
                              + {staple}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Quick Stats: Calories, Time */}
                    <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
                      <span className="flex items-center gap-1 font-medium">
                        <Flame className="h-3.5 w-3.5 text-orange-400" />
                        {recipe.calories_per_serving} kcal / serving
                      </span>
                      <span>
                        Prep: {recipe.prep_time_mins}m · Cook: {recipe.cook_time_mins}m
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="p-5 pt-0">
                  <Button
                    className={cn(
                      "w-full gap-2 transition-all font-semibold",
                      isCooked && "border-emerald-500/40 text-emerald-600 bg-emerald-500/10 hover:bg-emerald-500/20"
                    )}
                    variant={isCooked ? "outline" : "default"}
                    onClick={() => setActiveCookingRecipe(recipe)}
                  >
                    {isCooked ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        Cooked & Rescued (View Steps)
                      </>
                    ) : (
                      <>
                        <ChefHat className="h-4 w-4" />
                        Cook This
                      </>
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Interactive "Cook This" Modal */}
      <Dialog
        open={Boolean(activeCookingRecipe)}
        onOpenChange={(open) => {
          if (!open) setActiveCookingRecipe(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 sm:p-8">
          {activeCookingRecipe && (
            <div className="space-y-6">
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/25 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    <UtensilsCrossed className="h-3 w-3" />
                    {activeCookingRecipe.cuisine} Cuisine
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    <Sparkles className="h-3 w-3" />
                    {activeCookingRecipe.pantry_match_percentage}% In Your Pantry
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {activeCookingRecipe.prep_time_mins + activeCookingRecipe.cook_time_mins} mins
                  </span>
                </div>

                <DialogTitle className="font-display text-2xl font-bold text-foreground text-left">
                  {activeCookingRecipe.title}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground text-left">
                  Follow along the chef-crafted steps below. When finished, tap "Deduct Ingredients from Pantry" to update your inventory.
                </DialogDescription>
              </DialogHeader>

              {/* Ingredients Overview */}
              <div className="grid gap-4 sm:grid-cols-2 rounded-2xl bg-secondary/30 p-4 border border-border/60">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 mb-2 flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5" />
                    Pantry Stock (To Deduct):
                  </h4>
                  <ul className="space-y-1.5 text-xs">
                    {activeCookingRecipe.matched_pantry_items.map((ing, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-foreground font-medium">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {ing}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <UtensilsCrossed className="h-3.5 w-3.5" />
                    Kitchen Staples:
                  </h4>
                  <ul className="space-y-1.5 text-xs text-muted-foreground">
                    {activeCookingRecipe.missing_staples && activeCookingRecipe.missing_staples.length > 0 ? (
                      activeCookingRecipe.missing_staples.map((st, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-border" />
                          {st}
                        </li>
                      ))
                    ) : (
                      <li className="italic text-muted-foreground">None! All ingredients available.</li>
                    )}
                  </ul>
                </div>
              </div>

              {/* Step-by-Step Cooking Instructions */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <ListOrdered className="h-4 w-4 text-primary" />
                    Step-by-Step Cooking Instructions
                  </h4>
                  <span className="text-xs text-muted-foreground">
                    {(completedSteps[activeCookingRecipe.id]?.size || 0)} of {activeCookingRecipe.steps.length} steps checked
                  </span>
                </div>

                <div className="space-y-2.5">
                  {activeCookingRecipe.steps.map((step, sIdx) => {
                    const isChecked = Boolean(completedSteps[activeCookingRecipe.id]?.has(sIdx));
                    return (
                      <div
                        key={sIdx}
                        onClick={() => toggleStepCompleted(activeCookingRecipe.id, sIdx)}
                        className={cn(
                          "flex items-start gap-3 rounded-2xl border p-3.5 cursor-pointer transition-all select-none",
                          isChecked
                            ? "border-emerald-500/40 bg-emerald-500/5 text-foreground"
                            : "border-border/60 bg-card hover:bg-secondary/40 text-foreground"
                        )}
                      >
                        <button
                          type="button"
                          className={cn(
                            "grid h-6 w-6 shrink-0 place-items-center rounded-lg border text-xs font-bold transition-all",
                            isChecked
                              ? "border-emerald-500 bg-emerald-500 text-white shadow-xs"
                              : "border-muted-foreground/30 bg-background text-muted-foreground"
                          )}
                        >
                          {isChecked ? <Check className="h-3.5 w-3.5" /> : sIdx + 1}
                        </button>
                        <p
                          className={cn(
                            "text-xs leading-relaxed transition-all",
                            isChecked && "line-through text-muted-foreground"
                          )}
                        >
                          {step}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Modal Footer Actions */}
              <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setActiveCookingRecipe(null)}
                  className="sm:w-auto"
                >
                  Close
                </Button>
                <Button
                  onClick={() => handleDeductFromPantry(activeCookingRecipe)}
                  disabled={isDeducting || cookedRecipeIds.has(activeCookingRecipe.id)}
                  className="gap-2 sm:w-auto font-semibold shadow-soft"
                >
                  <ChefHat className="h-4 w-4" />
                  {cookedRecipeIds.has(activeCookingRecipe.id)
                    ? "Already Deducted from Pantry"
                    : isDeducting
                    ? "Deducting Ingredients..."
                    : "Deduct Ingredients from Pantry"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
