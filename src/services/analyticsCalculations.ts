// Pure calculations engine for Smart Pantry Nutrition & Sustainability Analytics
// Used by both backend API routes and client-side React routes.

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
  carbs: number;
  protein: number;
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

export const ALL_ALLERGENS = ["Milk", "Nuts", "Gluten", "Soy", "Eggs", "Fish", "Shellfish", "Sesame"];

export const FOOD_NUTRITION_LOOKUP: Record<string, MacroNutrients> = {
  spinach: { calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2 },
  palak: { calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2 },
  tomato: { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2 },
  tomatoes: { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2 },
  banana: { calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3, fiber: 2.6 },
  bananas: { calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3, fiber: 2.6 },
  apple: { calories: 52, protein: 0.3, carbs: 14.0, fat: 0.2, fiber: 2.4 },
  apples: { calories: 52, protein: 0.3, carbs: 14.0, fat: 0.2, fiber: 2.4 },
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
  cashews: { calories: 553, protein: 18.2, carbs: 30.2, fat: 43.8, fiber: 3.3 },
  almond: { calories: 579, protein: 21.2, carbs: 21.6, fat: 49.9, fiber: 12.5 },
  almonds: { calories: 579, protein: 21.2, carbs: 21.6, fat: 49.9, fiber: 12.5 },
  rice: { calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3, fiber: 0.4 },
  bread: { calories: 265, protein: 9.0, carbs: 49.0, fat: 3.2, fiber: 2.7 },
  wheat: { calories: 340, protein: 13.0, carbs: 71.0, fat: 2.5, fiber: 10.7 },
  roti: { calories: 264, protein: 9.0, carbs: 55.0, fat: 3.5, fiber: 9.0 },
  bhendi: { calories: 33, protein: 1.9, carbs: 7.5, fat: 0.2, fiber: 3.2 },
  okra: { calories: 33, protein: 1.9, carbs: 7.5, fat: 0.2, fiber: 3.2 },
  potato: { calories: 77, protein: 2.0, carbs: 17.5, fat: 0.1, fiber: 2.2 },
  potatoes: { calories: 77, protein: 2.0, carbs: 17.5, fat: 0.1, fiber: 2.2 },
  onion: { calories: 40, protein: 1.1, carbs: 9.3, fat: 0.1, fiber: 1.7 },
  egg: { calories: 143, protein: 12.6, carbs: 0.7, fat: 9.5, fiber: 0 },
  eggs: { calories: 143, protein: 12.6, carbs: 0.7, fat: 9.5, fiber: 0 },
  chicken: { calories: 165, protein: 31.0, carbs: 0, fat: 3.6, fiber: 0 },
  fish: { calories: 136, protein: 20.0, carbs: 0, fat: 5.6, fiber: 0 }
};

export const CATEGORY_DEFAULT_NUTRITION: Record<string, MacroNutrients> = {
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
export function getNutrientsPer100g(item: { name?: string; category?: string; nutrition?: any }): MacroNutrients {
  const n = typeof item.nutrition === "string" ? JSON.parse(item.nutrition || "{}") : (item.nutrition || {});
  if (n && (Number(n.calories) > 0 || Number(n.protein) > 0 || Number(n.carbs) > 0)) {
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
export function detectAllergensInFood(item: { name?: string; category?: string; notes?: string | null; allergens?: any }): string[] {
  const hits = new Set<string>();
  const text = `${item.name || ""} ${item.category || ""} ${item.notes || ""}`.toLowerCase();

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
 * Standardizes categories into clean chart buckets: Vegetables, Fruits, Dairy, Pantry, etc.
 */
export function normalizeCategoryBucket(cat: string = ""): string {
  const c = cat.toLowerCase();
  if (c.includes("veg")) return "Vegetables";
  if (c.includes("fruit")) return "Fruits";
  if (c.includes("dairy")) return "Dairy";
  if (c.includes("meat") || c.includes("fish") || c.includes("egg")) return "Protein";
  return "Pantry";
}
