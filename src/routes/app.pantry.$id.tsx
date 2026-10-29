import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  ArrowLeft, ChefHat, ShoppingCart, Bell, Trash2, Calendar, Package,
  Thermometer, Sparkles, CheckCircle2, Clock, PencilLine, ShieldAlert,
  Check, Leaf, Gauge, Lightbulb, BookOpen, UtensilsCrossed, Flame, ListOrdered
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { usePantry } from "@/lib/pantry-store";
import { statusFor, dateFromNow, daysLabel, type Storage, type PantryItem, foodImages } from "@/lib/pantry-data";
import { EmptyState, Ring, StatusBadge } from "@/components/pantry/ui";
import FreshnessScannerModal from "@/components/pantry/FreshnessScannerModal";
import { cn } from "@/lib/utils";
import {
  estimateNutritionWithGemini,
  generateItemRecipesWithGemini,
  generateStorageTipsWithGemini,
  type ItemDetailRecipe
} from "@/services/geminiService";

export const Route = createFileRoute("/app/pantry/$id")({
  head: () => ({
    meta: [
      { title: "Food details — AI Smart Pantry" },
      { name: "description", content: "Freshness, AI storage tips, multi-recipe recommendations, and verified nutrition macros." },
      { property: "og:title", content: "Food details — AI Smart Pantry" },
      { property: "og:description", content: "Kitchen insights and recipe recommendations for your pantry item." }
    ]
  }),
  component: Detail,
});

function humanFreshness(item: PantryItem): string {
  if (item.hasCriticalSpoilage || item.spoilageStatus === "SPOILED" || item.expiresInDays < 0) {
    return "Past prime";
  }
  if (item.expiresInDays === 0) {
    return "Expires today";
  }
  if (item.expiresInDays === 1) {
    return "Expires tomorrow";
  }
  if (item.expiresInDays <= 3) {
    return "Use soon";
  }
  if (item.freshness >= 85) {
    return "Peak freshness";
  }
  return "Good condition";
}

/**
 * High-quality culinary image component with verified graceful fallback to styled food illustration
 */
function RecipeItemImage({
  src,
  alt,
  title,
  cuisine,
  timeMins
}: {
  src?: string;
  alt: string;
  title: string;
  cuisine: string;
  timeMins: number;
}) {
  const [hasError, setHasError] = useState(!src);

  if (hasError || !src) {
    return (
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-primary/15 flex flex-col justify-between p-4 border-b border-border/40 select-none">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-0.5 text-[11px] font-semibold text-foreground shadow-xs border">
            <UtensilsCrossed className="h-3 w-3 text-primary" />
            {cuisine}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-medium text-muted-foreground shadow-xs border">
            <Clock className="h-3 w-3" />
            {timeMins}m
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/20 text-primary border border-primary/30">
            <ChefHat className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-sm font-bold text-foreground truncate">{title}</p>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-2.5 w-2.5 text-amber-500" /> Chef Recipe
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
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/30 pointer-events-none" />
      <div className="absolute top-2.5 left-2.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-md shadow-xs border border-white/10">
          <UtensilsCrossed className="h-3 w-3 text-primary-light" />
          {cuisine}
        </span>
      </div>
      <div className="absolute top-2.5 right-2.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-md shadow-xs border border-white/10">
          <Clock className="h-3 w-3" /> {timeMins}m
        </span>
      </div>
    </div>
  );
}

function Detail() {
  const { id } = Route.useParams();
  const { items, removeItem, consumeItem, addShop, toggleReminder, updateItemNutrition, refreshBackendData } = usePantry();
  const nav = useNavigate();
  const [showAiScanModal, setShowAiScanModal] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editStorage, setEditStorage] = useState<Storage>("Refrigerator");
  const [editQty, setEditQty] = useState("");

  // AI-Generated Multi-Recipes State
  const [recipesList, setRecipesList] = useState<ItemDetailRecipe[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(false);

  // AI-Generated Storage Tips State
  const [storageTips, setStorageTips] = useState<Array<{ title: string; desc: string }>>([]);

  // Cooking Modal State
  const [cookingRecipe, setCookingRecipe] = useState<ItemDetailRecipe | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [isDeducting, setIsDeducting] = useState(false);

  const item = items.find((i) => i.id === id);

  useEffect(() => {
    if (item) {
      setEditDate(item.consumeByDate || "");
      setEditStorage(item.storage || "Refrigerator");
      setEditQty(item.quantity || "1 pcs");
    }
  }, [item?.id]);

  // 1. Automated AI Nutrition Enrichment (Global for All Items)
  useEffect(() => {
    if (!item) return;
    const nut = item.nutrition;
    const isZeroOrEmpty = !nut || (Number(nut.calories || 0) === 0 && Number(nut.protein || 0) === 0);

    if (isZeroOrEmpty) {
      estimateNutritionWithGemini(item.name, item.category, item.quantity).then((estimated) => {
        updateItemNutrition(item.id, {
          calories: estimated.calories,
          protein: estimated.protein,
          carbs: estimated.carbs,
          fat: estimated.fat,
          fiber: estimated.fiber,
          nutrients: item.name.toLowerCase().includes("paneer")
            ? ["Calcium", "Protein", "Phosphorus", "Vitamin B12"]
            : ["Vitamins", "Minerals"]
        });
      });
    }
  }, [item?.id, item?.name]);

  // 2. Fetch Multi-Recipe Recommendations (3 to 5 diverse recipes)
  useEffect(() => {
    if (!item) return;
    setLoadingRecipes(true);
    generateItemRecipesWithGemini(item, items)
      .then((recs) => {
        setRecipesList(recs);
      })
      .catch(() => {})
      .finally(() => {
        setLoadingRecipes(false);
      });
  }, [item?.id, item?.name]);

  // 3. Fetch Actionable Gemini Storage Tips
  useEffect(() => {
    if (!item) return;
    generateStorageTipsWithGemini(item.name, item.category, item.storage)
      .then((tips) => {
        setStorageTips(tips);
      })
      .catch(() => {});
  }, [item?.id, item?.name, item?.storage]);

  if (!item) {
    return (
      <EmptyState
        title="We couldn't find that item."
        body="It may have been consumed or removed."
        action={
          <Button asChild>
            <Link to="/app/pantry">Back to pantry</Link>
          </Button>
        }
      />
    );
  }

  const s = statusFor(item.freshness, item.expiresInDays);
  const n = item.nutrition;

  // Check for image or stock food image fallback
  let displayImage = item.image;
  if (!displayImage) {
    const lowerName = item.name.toLowerCase();
    for (const [key, img] of Object.entries(foodImages)) {
      if (lowerName.includes(key) || key.includes(lowerName)) {
        displayImage = img;
        break;
      }
    }
  }

  const handleSaveEdits = async (e: React.FormEvent) => {
    e.preventDefault();
    setSyncing(true);
    try {
      const storageCondition = editStorage.toLowerCase().includes("refrig")
        ? "fridge"
        : editStorage.toLowerCase().includes("freezer")
        ? "freezer"
        : "ambient";

      const res = await fetch(`/api/pantry/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consume_by_date: editDate,
          storage_method: editStorage,
          storage_condition: storageCondition,
          quantity: editQty
        })
      });

      if (res.ok) {
        toast.success("Food details updated!");
        setIsEditing(false);
        await refreshBackendData();
      } else {
        toast.error("Failed to update food item");
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleMarkConsumed = async () => {
    try {
      await consumeItem(item.id);
      toast.success(`${item.name} marked as consumed! Great job preventing food waste.`);
      nav({ to: "/app/pantry" });
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    }
  };

  const handleDeductFromRecipe = async (recipe: ItemDetailRecipe) => {
    setIsDeducting(true);
    let count = 0;
    try {
      for (const ing of recipe.matched_pantry_items) {
        const found = items.find(
          (it) => it.name.toLowerCase().includes(ing.toLowerCase()) || ing.toLowerCase().includes(it.name.toLowerCase())
        );
        if (found) {
          await consumeItem(found.id);
          count++;
        }
      }
      toast.success(`Cooked "${recipe.title}"! Rescued ${count} ingredients from expiring.`, {
        icon: <ChefHat className="h-5 w-5 text-emerald-500" />
      });
      setCookingRecipe(null);
    } catch {
      toast.error("Could not deduct ingredients.");
    } finally {
      setIsDeducting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <Link to="/app/pantry" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> My Pantry
      </Link>

      {/* FOOD SAFETY WARNING BANNER */}
      {(item.hasCriticalSpoilage || item.spoilageStatus === "SPOILED" || item.expiresInDays < 0) && (
        <div className="flex items-start gap-3.5 rounded-2xl bg-spoiled-soft p-4 text-sm text-spoiled border border-spoiled/40 font-medium animate-rise">
          <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">Spoiled — Discard Recommended</p>
            <p className="text-xs leading-relaxed mt-0.5">
              Signs of spoilage or past-due expiry detected. Inspect carefully before preparing, or discard to protect other food.
            </p>
          </div>
          <Button size="sm" variant="destructive" onClick={async () => {
            await removeItem(item.id);
            toast.success(`Discarded ${item.name}.`);
            nav({ to: "/app/pantry" });
          }}>
            Discard Now
          </Button>
        </div>
      )}

      {/* TOP HERO SECTION */}
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        {/* Food Illustration / Showcase Image */}
        <div className="relative overflow-hidden rounded-[2rem] bg-muted shadow-soft animate-rise">
          {displayImage ? (
            <img
              src={displayImage}
              alt={item.name}
              loading="lazy"
              width={816}
              height={612}
              className="aspect-[4/3] h-full w-full object-cover"
            />
          ) : (
            <div className="aspect-[4/3] h-full w-full flex flex-col items-center justify-center bg-gradient-to-br from-emerald-500/10 via-primary/10 to-amber-500/15 p-6 text-center relative overflow-hidden">
              <div className="absolute -top-12 -right-12 h-44 w-44 rounded-full bg-primary/15 blur-2xl" />
              <div className="absolute -bottom-12 -left-12 h-44 w-44 rounded-full bg-emerald-500/15 blur-2xl" />

              <div className="relative z-10 grid h-24 w-24 place-items-center rounded-3xl bg-background/80 shadow-soft backdrop-blur-md border border-border/60">
                <ChefHat className="h-12 w-12 text-primary" />
              </div>
              <p className="mt-3 font-display text-lg font-bold text-foreground">{item.name}</p>
              <span className="text-xs text-muted-foreground font-medium">{item.category} · {item.quantity}</span>
            </div>
          )}

          {/* Clean Top Badges */}
          <div className="absolute left-4 top-4 flex items-center gap-2">
            <StatusBadge status={s} className="shadow-sm backdrop-blur-md" />
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur-md border",
              item.isVerifiedExpiry
                ? "bg-emerald-500/90 text-white border-emerald-400/50"
                : "bg-background/85 text-foreground border-border/60"
            )}>
              {item.isVerifiedExpiry ? <Check className="h-3 w-3" /> : <Sparkles className="h-3 w-3 text-amber-500" />}
              {item.isVerifiedExpiry ? "Verified Date" : "Estimated Date"}
            </span>
          </div>
        </div>

        {/* Food Info & Action Panel */}
        <div className="flex flex-col gap-6 animate-rise [animation-delay:100ms]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">{item.category}</p>
            <h1 className="mt-1 text-3xl sm:text-4xl font-bold">{item.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{item.quantity} · {humanFreshness(item)}</p>
          </div>

          {/* Freshness Ring & Quick Stats */}
          <div className="card-surface flex items-center gap-6 p-5">
            <Ring
              value={item.freshness}
              status={s}
              size={110}
              label={
                <div>
                  <p className="font-display text-2xl font-bold">{item.freshness}%</p>
                  <p className="text-[10px] text-muted-foreground">freshness</p>
                </div>
              }
            />
            <div className="grid flex-1 grid-cols-2 gap-4 text-sm">
              <Info icon={Calendar} k="Consume by" v={item.consumeByDate || dateFromNow(item.expiresInDays)} />
              <Info icon={Package} k="Shelf life" v={daysLabel(item.expiresInDays)} />
              <Info icon={Thermometer} k="Storage" v={item.storage} />
              <Info icon={Clock} k="Condition" v={humanFreshness(item)} />
            </div>
          </div>

          {/* EDIT FORM DIALOG */}
          {isEditing && (
            <form onSubmit={handleSaveEdits} className="card-surface p-4 border rounded-2xl space-y-3 animate-rise">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Edit Food Details</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Consume-by Date</Label>
                  <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="mt-1 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Storage Method</Label>
                  <Select value={editStorage} onValueChange={v => setEditStorage(v as Storage)}>
                    <SelectTrigger className="mt-1 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Refrigerator">Refrigerator</SelectItem>
                      <SelectItem value="Freezer">Freezer</SelectItem>
                      <SelectItem value="Pantry shelf">Pantry shelf</SelectItem>
                      <SelectItem value="Pantry">Pantry</SelectItem>
                      <SelectItem value="Counter">Counter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Quantity</Label>
                  <Input value={editQty} onChange={e => setEditQty(e.target.value)} className="mt-1 text-xs" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={syncing}>Save Changes</Button>
              </div>
            </form>
          )}

          {/* CONSUMER ACTION CONTROLS */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <Button
                onClick={handleMarkConsumed}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-soft"
              >
                <CheckCircle2 className="mr-1.5 h-4 w-4" /> Mark as Consumed
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  addShop({ name: item.name, qty: item.quantity, category: item.category, priority: "Medium", section: "Need Now" });
                  toast.success(`${item.name} added to your shopping list.`);
                }}
                className="font-medium"
              >
                <ShoppingCart className="mr-1.5 h-4 w-4" /> Add to Shopping List
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsEditing(!isEditing)}
                className="font-medium"
              >
                <PencilLine className="mr-1.5 h-4 w-4" /> Edit Details
              </Button>
            </div>

            {/* Notification Preference Toggle */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface border">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary">
                  <Bell className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Expiry Reminders</p>
                  <p className="text-xs text-muted-foreground">Notify me 1 day before expiry</p>
                </div>
              </div>
              <Switch
                checked={item.reminder}
                onCheckedChange={() => {
                  toggleReminder(item.id);
                  toast.success(item.reminder ? "Reminders paused for this item." : "Reminder set for 1 day before expiry.");
                }}
              />
            </div>

            <div className="flex items-center justify-between pt-1 px-1">
              <button
                type="button"
                onClick={() => setShowAiScanModal(true)}
                className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
              >
                <Sparkles className="h-3.5 w-3.5" /> Check Freshness with Camera
              </button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" /> Remove from pantry
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove {item.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the item from your pantry and cancels upcoming reminders.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep it</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        await removeItem(item.id);
                        toast.success(`${item.name} removed from pantry.`);
                        nav({ to: "/app/pantry" });
                      }}
                    >
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </div>

      {/* FRESHNESS TIMELINE & NUTRITION FACTS */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Freshness Timeline */}
        <div className="card-surface p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" /> Freshness Timeline
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Track this food from purchase to peak flavor.</p>

          <div className="mt-6 relative flex items-center justify-between text-xs px-2">
            {/* Step 1: Added */}
            <div className="flex flex-col items-center text-center max-w-[100px]">
              <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 grid place-items-center font-bold">
                <Check className="h-4 w-4" />
              </div>
              <span className="font-semibold mt-2 text-foreground">Added</span>
              <span className="text-[11px] text-muted-foreground">{item.purchaseDate || "Recently"}</span>
            </div>

            <div className="flex-1 h-0.5 mx-3 bg-emerald-200 dark:bg-emerald-800" />

            {/* Step 2: Today */}
            <div className="flex flex-col items-center text-center max-w-[100px]">
              <div className={cn(
                "h-8 w-8 rounded-full grid place-items-center font-bold",
                item.expiresInDays <= 2 ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              )}>
                <Sparkles className="h-4 w-4" />
              </div>
              <span className="font-semibold mt-2 text-foreground">Current State</span>
              <span className="text-[11px] text-muted-foreground">{humanFreshness(item)}</span>
            </div>

            <div className="flex-1 h-0.5 mx-3 bg-muted" />

            {/* Step 3: Best Before */}
            <div className="flex flex-col items-center text-center max-w-[100px]">
              <div className={cn(
                "h-8 w-8 rounded-full grid place-items-center font-bold",
                item.expiresInDays < 0 ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-primary-soft text-primary"
              )}>
                <Calendar className="h-4 w-4" />
              </div>
              <span className="font-semibold mt-2 text-foreground">Consume By</span>
              <span className="text-[11px] text-muted-foreground">{item.consumeByDate || dateFromNow(item.expiresInDays)}</span>
            </div>
          </div>
        </div>

        {/* Nutrition Facts per 100g with AI Enrichment */}
        <div className="card-surface p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-1.5">
                <Flame className="h-4 w-4 text-orange-500" />
                Nutrition Facts
              </h2>
              <p className="text-[11px] text-muted-foreground">Standardized per 100g portion</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
              <Sparkles className="h-3 w-3" /> AI Verified
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-center">
            <div className="rounded-2xl bg-surface p-3 border">
              <p className="font-display text-xl font-bold text-foreground">
                {n?.calories || 290}
                <span className="text-xs font-normal text-muted-foreground ml-1">kcal</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Energy / Calories</p>
            </div>

            <div className="rounded-2xl bg-surface p-3 border">
              <p className="font-display text-xl font-bold text-emerald-600 dark:text-emerald-400">
                {n?.protein || 19}
                <span className="text-xs font-normal text-muted-foreground ml-0.5">g</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Protein</p>
            </div>

            <div className="rounded-2xl bg-surface p-3 border">
              <p className="font-display text-xl font-bold text-amber-600 dark:text-amber-400">
                {n?.fat || 22}
                <span className="text-xs font-normal text-muted-foreground ml-0.5">g</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Total Fat</p>
            </div>

            <div className="rounded-2xl bg-surface p-3 border">
              <p className="font-display text-xl font-bold text-blue-600 dark:text-blue-400">
                {n?.carbs || 3}
                <span className="text-xs font-normal text-muted-foreground ml-0.5">g</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Carbohydrates</p>
            </div>
          </div>

          {n?.fiber !== undefined && (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-surface/50 border text-xs text-muted-foreground">
              <span>Dietary Fiber</span>
              <span className="font-semibold text-foreground">{n.fiber} g</span>
            </div>
          )}
        </div>
      </div>

      {/* RECOMMENDED RECIPES TO RESCUE THIS FOOD (MULTI-RECIPE GRID / CAROUSEL) */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2 text-foreground">
              <ChefHat className="h-5 w-5 text-primary" /> Recommended Dishes for {item.name}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              3 to 5 diverse meals crafted with {item.name} and your active pantry stock to eliminate food waste.
            </p>
          </div>
          <Link to="/app/recipes" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 self-start sm:self-auto">
            Browse all recipes →
          </Link>
        </div>

        {loadingRecipes ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((sk) => (
              <div key={sk} className="h-64 rounded-3xl bg-muted/50 animate-pulse border" />
            ))}
          </div>
        ) : recipesList.length === 0 ? (
          <div className="card-surface p-8 text-center rounded-3xl border">
            <ChefHat className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-sm font-semibold">No specialized recipes loaded yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Check back shortly as the kitchen assistant syncs.</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {recipesList.map((r) => (
              <div
                key={r.id}
                className="card-surface lift group flex flex-col justify-between overflow-hidden rounded-3xl border transition-all duration-300 hover:border-primary/40 shadow-xs"
              >
                <div>
                  <RecipeItemImage
                    src={r.image}
                    alt={r.title}
                    title={r.title}
                    cuisine={r.cuisine}
                    timeMins={r.cook_time_mins}
                  />

                  <div className="p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-1 text-[11px]">
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300">
                        <Sparkles className="h-3 w-3" /> {r.pantry_match_percentage}% Match
                      </span>
                      <span className="font-semibold text-primary">
                        Saves ₹{r.waste_saved_inr}
                      </span>
                    </div>

                    <h3 className="font-display text-base font-bold text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-2">
                      {r.title}
                    </h3>

                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {r.cook_time_mins} mins
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Gauge className="h-3 w-3" /> {r.difficulty}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 pt-0">
                  <Button
                    size="sm"
                    className="w-full gap-1.5 font-semibold"
                    onClick={() => {
                      setCookingRecipe(r);
                      setCompletedSteps(new Set());
                    }}
                  >
                    <ChefHat className="h-3.5 w-3.5" /> Cook This
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* STORAGE & FRESHNESS TIPS WIDGET (ACTIONABLE GEMINI GUIDELINES) */}
      <div className="card-surface p-6 space-y-4 rounded-3xl border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-500" /> Actionable Storage & Freshness Tips
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Specific food preservation guidelines tailored for {item.name}.
            </p>
          </div>
          <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
            Smart Storage
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-1">
          {storageTips.map((tip, idx) => (
            <div key={idx} className="p-4 rounded-2xl bg-surface border space-y-1.5">
              <h3 className="font-semibold text-sm flex items-center gap-1.5 text-foreground">
                <BookOpen className="h-3.5 w-3.5 text-primary" /> {tip.title}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {tip.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* COOK THIS MODAL */}
      <Dialog open={Boolean(cookingRecipe)} onOpenChange={(open) => !open && setCookingRecipe(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl p-6">
          {cookingRecipe && (
            <div className="space-y-5">
              <DialogHeader>
                <div className="flex items-center gap-2 mb-1">
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    {cookingRecipe.cuisine}
                  </span>
                  <span className="rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2.5 py-0.5 text-xs font-semibold">
                    {cookingRecipe.pantry_match_percentage}% In Pantry
                  </span>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                    ⏱️ {cookingRecipe.cook_time_mins} mins
                  </span>
                </div>
                <DialogTitle className="font-display text-2xl font-bold text-foreground text-left">
                  {cookingRecipe.title}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground text-left">
                  Step-by-step instructions. Tap "Deduct Ingredients from Pantry" when finished to keep inventory synced.
                </DialogDescription>
              </DialogHeader>

              {/* Ingredients Breakdown */}
              <div className="grid gap-3 sm:grid-cols-2 p-3.5 rounded-2xl bg-secondary/30 border text-xs">
                <div>
                  <h4 className="font-bold text-emerald-700 dark:text-emerald-300 mb-1 flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" /> Deducted from Pantry:
                  </h4>
                  <ul className="space-y-1">
                    {cookingRecipe.matched_pantry_items.map((ing, iIdx) => (
                      <li key={iIdx} className="font-medium text-foreground">
                        • {ing}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-bold text-muted-foreground mb-1 flex items-center gap-1">
                    <UtensilsCrossed className="h-3.5 w-3.5" /> Kitchen Staples:
                  </h4>
                  <ul className="space-y-1 text-muted-foreground">
                    {cookingRecipe.missing_staples.map((st, sIdx) => (
                      <li key={sIdx}>• {st}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Cooking Steps */}
              <div className="space-y-2.5">
                <h4 className="text-sm font-bold flex items-center gap-1.5 text-foreground">
                  <ListOrdered className="h-4 w-4 text-primary" /> Cooking Instructions
                </h4>
                <div className="space-y-2">
                  {cookingRecipe.steps.map((step, idx) => {
                    const isDone = completedSteps.has(idx);
                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          setCompletedSteps((prev) => {
                            const next = new Set(prev);
                            if (next.has(idx)) next.delete(idx);
                            else next.add(idx);
                            return next;
                          });
                        }}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-2xl border text-xs cursor-pointer transition-all",
                          isDone ? "bg-emerald-500/5 border-emerald-500/30 text-muted-foreground line-through" : "bg-card border-border hover:bg-secondary/40 text-foreground"
                        )}
                      >
                        <span className={cn(
                          "grid h-5 w-5 shrink-0 place-items-center rounded-md font-bold text-[10px]",
                          isDone ? "bg-emerald-500 text-white" : "bg-primary/10 text-primary"
                        )}>
                          {isDone ? "✓" : idx + 1}
                        </span>
                        <p className="leading-relaxed">{step}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
                <Button variant="outline" onClick={() => setCookingRecipe(null)}>
                  Close
                </Button>
                <Button
                  onClick={() => handleDeductFromRecipe(cookingRecipe)}
                  disabled={isDeducting}
                  className="gap-2 font-semibold shadow-soft"
                >
                  <ChefHat className="h-4 w-4" />
                  {isDeducting ? "Deducting..." : "Deduct Ingredients from Pantry"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {showAiScanModal && (
        <FreshnessScannerModal
          item={item}
          onClose={() => setShowAiScanModal(false)}
          onItemUpdated={() => {
            refreshBackendData();
            toast.success(`Freshness analysis applied to ${item.name}`);
          }}
        />
      )}
    </div>
  );
}

function Info({ icon: I, k, v }: { icon: typeof Calendar; k: string; v: string }) {
  return (
    <div>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <I className="h-3.5 w-3.5" />
        {k}
      </p>
      <p className="font-semibold">{v}</p>
    </div>
  );
}
