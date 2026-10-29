// Food Waste & Nutrition Analytics Backend Engine
// Computes live inventory nutrition, category distributions, monthly waste trends, and sustainability metrics.

import type { FoodItemRecord, PantryRepository } from "../db/repository";

export interface MacroNutrients {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface CategoryMacro {
  d: string;
  category: string;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  itemCount: number;
}

export interface AllergenHit {
  allergen: string;
  detected: boolean;
  items: string[];
}

export interface MonthlyTrend {
  m: string;
  consumed: number;
  wasted: number;
}

export interface CategoryBreakdown {
  name: string;
  count: number;
  v: number; // percentage (e.g. 33)
}

export interface PantryAnalyticsReport {
  totals: MacroNutrients & { hasData: boolean };
  dailyGoals: Array<{ k: string; v: number; goal: number; u: string; pct: number }>;
  catChartData: CategoryMacro[];
  categoryBreakdown: CategoryBreakdown[];
  allergensFound: AllergenHit[];
  monthlyTrends: MonthlyTrend[];
  foodSavedCount: number;
  wastePreventedKg: number;
  moneySavedINR: number;
  co2AvoidedKg: number;
  pantryUtilizationPercent: number;
  totalTracked: number;
  activeCount: number;
  consumedCount: number;
  discardedCount: number;
  expiredCount: number;
}

/**
 * Standard reference nutrition per 100g.
 */
const FOOD_NUTRITION_LOOKUP: Record<string, MacroNutrients> = {
  spinach: { calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2 },
  palak: { calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2 },
  tomato: { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2 },
  banana: { calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3, fiber: 2.6 },
  apple: { calories: 52, protein: 0.3, carbs: 14.0, fat: 0.2, fiber: 2.4 },
  mango: { calories: 60, protein: 0.8, carbs: 15.0, fat: 0.4, fiber: 1.6 },
  orange: { calories: 47, protein: 0.9, carbs: 11.8, fat: 0.1, fiber: 2.4 },
  grape: { calories: 67, protein: 0.6, carbs: 17.2, fat: 0.2, fiber: 0.9 },
  strawberry: { calories: 32, protein: 0.7, carbs: 7.7, fat: 0.3, fiber: 2.0 },
  paneer: { calories: 265, protein: 18.3, carbs: 3.4, fat: 20.8, fiber: 0 },
  milk: { calories: 60, protein: 3.2, carbs: 4.8, fat: 3.3, fiber: 0 },
  cheese: { calories: 350, protein: 25.0, carbs: 1.5, fat: 28.0, fiber: 0 },
  butter: { calories: 717, protein: 0.9, carbs: 0.1, fat: 81.0, fiber: 0 },
  curd: { calories: 61, protein: 3.5, carbs: 4.7, fat: 3.3, fiber: 0 },
  yogurt: { calories: 61, protein: 3.5, carbs: 4.7, fat: 3.3, fiber: 0 },
  cashew: { calories: 553, protein: 18.2, carbs: 30.2, fat: 43.8, fiber: 3.3 },
  almond: { calories: 579, protein: 21.2, carbs: 21.6, fat: 49.9, fiber: 12.5 },
  rice: { calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3, fiber: 0.4 },
  bread: { calories: 265, protein: 9.0, carbs: 49.0, fat: 3.2, fiber: 2.7 },
  wheat: { calories: 340, protein: 13.0, carbs: 71.0, fat: 2.5, fiber: 10.7 },
  bhendi: { calories: 33, protein: 1.9, carbs: 7.5, fat: 0.2, fiber: 3.2 },
  okra: { calories: 33, protein: 1.9, carbs: 7.5, fat: 0.2, fiber: 3.2 },
  potato: { calories: 77, protein: 2.0, carbs: 17.5, fat: 0.1, fiber: 2.2 },
  onion: { calories: 40, protein: 1.1, carbs: 9.3, fat: 0.1, fiber: 1.7 },
  egg: { calories: 143, protein: 12.6, carbs: 0.7, fat: 9.5, fiber: 0 },
  chicken: { calories: 165, protein: 31.0, carbs: 0, fat: 3.6, fiber: 0 },
  fish: { calories: 136, protein: 20.0, carbs: 0, fat: 5.6, fiber: 0 }
};

const CATEGORY_DEFAULT_NUTRITION: Record<string, MacroNutrients> = {
  Vegetables: { calories: 35, protein: 2.0, carbs: 6.0, fat: 0.3, fiber: 2.5 },
  Fruits: { calories: 55, protein: 0.8, carbs: 14.0, fat: 0.3, fiber: 2.0 },
  Dairy: { calories: 120, protein: 6.0, carbs: 5.0, fat: 7.0, fiber: 0 },
  Grains: { calories: 180, protein: 5.0, carbs: 38.0, fat: 1.0, fiber: 2.0 },
  Pantry: { calories: 250, protein: 8.0, carbs: 35.0, fat: 10.0, fiber: 3.0 },
  "Packaged Food": { calories: 240, protein: 5.0, carbs: 35.0, fat: 9.0, fiber: 2.0 },
  Meat: { calories: 190, protein: 25.0, carbs: 0, fat: 9.0, fiber: 0 },
  Fish: { calories: 140, protein: 22.0, carbs: 0, fat: 5.0, fiber: 0 },
  Other: { calories: 100, protein: 3.0, carbs: 15.0, fat: 3.0, fiber: 1.5 }
};

/**
 * Standard allergens tracked.
 */
export const ALL_ALLERGENS = ["Milk", "Nuts", "Gluten", "Soy", "Eggs", "Fish", "Shellfish", "Sesame"];

/**
 * Parses diverse kitchen quantities (e.g. "250g", "1kg", "1L", "6 pcs", "12 pieces") into grams.
 */
export function parseQuantityInGrams(qtyStr: string | number = "", category: string = "", name: string = ""): number {
  if (typeof qtyStr === "number") {
    return qtyStr >= 50 ? qtyStr : qtyStr * 120;
  }

  const s = String(qtyStr || "").toLowerCase().trim();
  const lowerName = name.toLowerCase();

  // Kilograms / Liters
  const kgMatch = s.match(/([\d.]+)\s*(?:kg|kilo|kilogram|l|liter|litre)/);
  if (kgMatch) return parseFloat(kgMatch[1]) * 1000;

  // Grams / Milliliters
  const gMatch = s.match(/([\d.]+)\s*(?:g|gram|gms|ml|milliliter|millilitre)/);
  if (gMatch) return parseFloat(gMatch[1]);

  // Pieces / Bunches / Loaves
  const pcMatch = s.match(/([\d.]+)\s*(?:pc|pcs|piece|pieces|bunch|loaf|pack|packet|box|bottle|can|head)/);
  const count = pcMatch ? parseFloat(pcMatch[1]) : (parseFloat(s) || 1);

  // Piece weight heuristics
  if (lowerName.includes("apple") || lowerName.includes("orange") || lowerName.includes("tomato") || lowerName.includes("peach")) {
    return count * 150;
  }
  if (lowerName.includes("banana")) {
    return count * 120;
  }
  if (lowerName.includes("mango") || lowerName.includes("avocado")) {
    return count * 250;
  }
  if (lowerName.includes("egg")) {
    return count * 50;
  }
  if (lowerName.includes("bread") || lowerName.includes("loaf")) {
    return count * 400;
  }
  if (category.toLowerCase().includes("fruit") || category.toLowerCase().includes("veg")) {
    return count * 120;
  }

  return count * 150;
}

/**
 * Resolves per-100g nutritional macros, prioritizing scanned nutrition or falling back
 * to standard reference food data.
 */
export function getNutrientsPer100g(item: Pick<FoodItemRecord, "name" | "category" | "nutrition">): MacroNutrients {
  const n = typeof item.nutrition === "string" ? JSON.parse(item.nutrition || "{}") : (item.nutrition || {});
  if (n && (n.calories > 0 || n.protein > 0 || n.carbs > 0)) {
    return {
      calories: Number(n.calories) || 0,
      protein: Number(n.protein) || 0,
      carbs: Number(n.carbs) || 0,
      fat: Number(n.fat) || 0,
      fiber: Number(n.fiber) || 0
    };
  }

  const lowerName = (item.name || "").toLowerCase();
  for (const [key, vals] of Object.entries(FOOD_NUTRITION_LOOKUP)) {
    if (lowerName.includes(key)) {
      return vals;
    }
  }

  const cat = item.category || "Other";
  return CATEGORY_DEFAULT_NUTRITION[cat] || CATEGORY_DEFAULT_NUTRITION.Other;
}

/**
 * Intelligent allergen detector checking food names, ingredient notes, and category.
 */
export function detectAllergensInFood(item: Pick<FoodItemRecord, "name" | "category" | "notes" | "allergens">): string[] {
  const hits = new Set<string>();
  const text = `${item.name} ${item.category} ${item.notes || ""}`.toLowerCase();

  // Scanned / stored allergens
  const existingAllergens = Array.isArray(item.allergens)
    ? item.allergens
    : (typeof item.allergens === "string" ? JSON.parse(item.allergens || "[]") : []);
  existingAllergens.forEach((a: string) => hits.add(a));

  // Gluten
  if (/bread|wheat|flour|roti|pasta|noodle|croissant|toast|cracker|biscuit|cookie|cake|cereal|oat|barley|rye/.test(text)) {
    hits.add("Gluten");
  }

  // Milk / Dairy
  if (/milk|cheese|paneer|butter|curd|yogurt|dahi|ghee|cream|dairy|whey|lactose/.test(text)) {
    hits.add("Milk");
  }

  // Nuts
  if (/nut|almond|cashew|walnut|peanut|pistachio|hazelnut|pecan/.test(text)) {
    hits.add("Nuts");
  }

  // Eggs
  if (/egg|omelette|mayo|mayonnaise/.test(text)) {
    hits.add("Eggs");
  }

  // Soy
  if (/soy|tofu|edamame|miso/.test(text)) {
    hits.add("Soy");
  }

  // Fish
  if (/fish|salmon|tuna|cod|tilapia|seafood/.test(text)) {
    hits.add("Fish");
  }

  // Shellfish
  if (/prawn|shrimp|crab|lobster/.test(text)) {
    hits.add("Shellfish");
  }

  // Sesame
  if (/sesame|tahini|til\b/.test(text)) {
    hits.add("Sesame");
  }

  return Array.from(hits);
}

/**
 * Normalizes item category to standardized display buckets.
 */
export function normalizeCategoryBucket(cat: string = ""): string {
  const c = cat.toLowerCase();
  if (c.includes("veg")) return "Vegetables";
  if (c.includes("fruit")) return "Fruits";
  if (c.includes("dairy")) return "Dairy";
  if (c.includes("meat") || c.includes("fish") || c.includes("egg")) return "Protein";
  return "Pantry";
}

/**
 * Computes full analytics report from the pantry database.
 */
export function calculatePantryAnalytics(repo: PantryRepository, userId = "default_user"): PantryAnalyticsReport {
  const todayStr = new Date().toISOString().split("T")[0];

  // 1. Fetch all items (active, consumed, discarded)
  const allItems = repo.getAllFoodItems(userId);
  const activeItems = allItems.filter(i => i.status === "active");
  const consumedItems = allItems.filter(i => i.status === "consumed");
  const discardedItems = allItems.filter(i => i.status === "discarded");

  // Non-expired active items contribute to current nutrition
  const activeNonExpired = activeItems.filter(i => {
    if (i.has_critical_spoilage || i.spoilage_status === "SPOILED") return false;
    if (i.consume_by_date && i.consume_by_date < todayStr) return false;
    return true;
  });

  // 2. Nutrition Aggregation: sum of (item.quantity / 100g) * item.nutrients_per_100g
  let totalCalories = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;
  let totalFiber = 0;

  // Category grouping for chart
  const categoryMacroMap = new Map<string, { protein: number; carbs: number; fat: number; fiber: number; itemCount: number }>();

  activeNonExpired.forEach(item => {
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
    const prev = categoryMacroMap.get(catKey) || { protein: 0, carbs: 0, fat: 0, fiber: 0, itemCount: 0 };
    categoryMacroMap.set(catKey, {
      protein: prev.protein + prot,
      carbs: prev.carbs + carbs,
      fat: prev.fat + fat,
      fiber: prev.fiber + fiber,
      itemCount: prev.itemCount + 1
    });
  });

  const totals = {
    calories: Math.round(totalCalories),
    protein: Math.round(totalProtein),
    carbs: Math.round(totalCarbs),
    fat: Math.round(totalFat),
    fiber: Math.round(totalFiber),
    hasData: activeNonExpired.length > 0
  };

  // 3. Progress rings: dynamic percentage against daily goals: (actual / goal) * 100
  const dailyGoals = [
    { k: "Calories", v: totals.calories, goal: 2000, u: "kcal", pct: Math.round((totals.calories / 2000) * 100) },
    { k: "Protein", v: totals.protein, goal: 70, u: "g", pct: Math.round((totals.protein / 70) * 100) },
    { k: "Carbs", v: totals.carbs, goal: 260, u: "g", pct: Math.round((totals.carbs / 260) * 100) },
    { k: "Fat", v: totals.fat, goal: 65, u: "g", pct: Math.round((totals.fat / 65) * 100) },
    { k: "Fiber", v: totals.fiber, goal: 30, u: "g", pct: Math.round((totals.fiber / 30) * 100) },
  ];

  // 4. Bar Chart Data
  const catChartData: CategoryMacro[] = Array.from(categoryMacroMap.entries()).map(([cat, vals]) => ({
    d: cat,
    category: cat,
    protein: Math.round(vals.protein),
    carbs: Math.round(vals.carbs),
    fat: Math.round(vals.fat),
    fiber: Math.round(vals.fiber),
    itemCount: vals.itemCount
  }));

  // 5. Active Category Breakdown for Donut Chart
  const activeCatCounts = new Map<string, number>();
  activeItems.forEach(i => {
    const bucket = normalizeCategoryBucket(i.category);
    activeCatCounts.set(bucket, (activeCatCounts.get(bucket) || 0) + 1);
  });

  const totalActive = activeItems.length || 1;
  const categoryBreakdown: CategoryBreakdown[] = Array.from(activeCatCounts.entries())
    .map(([name, count]) => ({
      name,
      count,
      v: Math.round((count / totalActive) * 100)
    }))
    .sort((a, b) => b.count - a.count);

  // 6. Allergen Detection
  const allergenItemsMap = new Map<string, string[]>();
  ALL_ALLERGENS.forEach(a => allergenItemsMap.set(a, []));

  activeItems.forEach(item => {
    const detected = detectAllergensInFood(item);
    detected.forEach(a => {
      const existing = allergenItemsMap.get(a) || [];
      if (!existing.includes(item.name)) {
        existing.push(item.name);
      }
      allergenItemsMap.set(a, existing);
    });
  });

  const allergensFound: AllergenHit[] = ALL_ALLERGENS.map(a => {
    const list = allergenItemsMap.get(a) || [];
    return {
      allergen: a,
      detected: list.length > 0,
      items: list
    };
  });

  // 7. Monthly Consumed vs Wasted Trends (Last 6 Months)
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const now = new Date();
  const monthlyTrends: MonthlyTrend[] = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const m = monthNames[d.getMonth()];
    const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    // Count actual items consumed in this month
    const consumedInMonth = consumedItems.filter(item => {
      const date = item.consumed_at || item.updated_at;
      return date && date.startsWith(yearMonth);
    }).length;

    // Count actual items wasted/discarded in this month
    const wastedInMonth = discardedItems.filter(item => {
      const date = item.discarded_at || item.consume_by_date;
      return date && date.startsWith(yearMonth);
    }).length;

    return { m, consumed: consumedInMonth, wasted: wastedInMonth };
  });

  // Ensure current month shows current pantry consumption
  const currentMonthIdx = 5;
  const expiredActiveCount = activeItems.filter(i => i.consume_by_date && i.consume_by_date < todayStr).length;
  monthlyTrends[currentMonthIdx].consumed = Math.max(monthlyTrends[currentMonthIdx].consumed, consumedItems.length);
  monthlyTrends[currentMonthIdx].wasted = Math.max(monthlyTrends[currentMonthIdx].wasted, discardedItems.length + expiredActiveCount);

  // 8. Financial & Environmental Impact Metrics
  // Food Waste Prevented (kg) = sum of weight of consumed items near expiry
  // Money Saved (₹) = sum of price of consumed items near expiry
  let wastePreventedKg = 0;
  let moneySavedINR = 0;

  consumedItems.forEach(item => {
    const weightKg = parseQuantityInGrams(item.quantity, item.category, item.name) / 1000;
    wastePreventedKg += weightKg;

    // Price estimates per category in ₹
    const cat = item.category?.toLowerCase() || "";
    let itemPrice = 70;
    if (cat.includes("fruit")) itemPrice = 80;
    else if (cat.includes("dairy")) itemPrice = 65;
    else if (cat.includes("veg")) itemPrice = 45;
    else if (cat.includes("meat") || cat.includes("fish")) itemPrice = 240;
    else if (cat.includes("grain") || cat.includes("pantry")) itemPrice = 110;

    moneySavedINR += itemPrice;
  });

  // If no items have been marked consumed yet in a fresh demo, provide positive base calculation
  const foodSavedCount = consumedItems.length;
  if (foodSavedCount === 0) {
    wastePreventedKg = 0;
    moneySavedINR = 0;
  }

  const co2AvoidedKg = parseFloat((wastePreventedKg * 2.5).toFixed(1));

  // Pantry Health & Utilization: If items are fresh and 0 are wasted, pantry health is 100% Fresh / In Good Standing.
  // Only penalize utilization when items actually spoil.
  const totalTracked = allItems.length;
  const wastedCount = discardedItems.length + expiredActiveCount;
  const pantryUtilizationPercent = totalTracked > 0
    ? Math.max(0, Math.min(100, Math.round(((totalTracked - wastedCount) / totalTracked) * 100)))
    : 100;

  return {
    totals,
    dailyGoals,
    catChartData,
    categoryBreakdown,
    allergensFound,
    monthlyTrends,
    foodSavedCount,
    wastePreventedKg: parseFloat(wastePreventedKg.toFixed(1)),
    moneySavedINR: Math.round(moneySavedINR),
    co2AvoidedKg,
    pantryUtilizationPercent,
    totalTracked,
    activeCount: activeItems.length,
    consumedCount: consumedItems.length,
    discardedCount: discardedItems.length,
    expiredCount: expiredActiveCount
  };
}
