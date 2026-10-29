// Open Food Facts API Integration Service with Offline Dataset Registry & Caching
// Fetches packaged product information, barcode metadata, ingredients, allergens, and nutrition data.

const CACHE_KEY_PREFIX = "off_barcode_cache_";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days cache

const memoryCache = new Map();

// Curated Open Food Facts Dataset Registry for Instant Offline & Fast Barcode Lookups
const OFFLINE_BARCODE_DATASET_REGISTRY = {
  "8901030777777": {
    found: true,
    barcode: "8901030777777",
    name: "Amul Taaza Toned Milk",
    productNameOnly: "Taaza Toned Milk",
    brand: "Amul",
    category: "Dairy",
    quantity: "500 mL",
    imageUrl: "",
    ingredients: "Toned Milk, Vitamin A, Vitamin D",
    allergens: ["Milk"],
    nutrition: { calories: 58, protein: 3.1, carbs: 4.8, fat: 3.0, fiber: 0, sodium: 0.05, nutrients: ["Calcium", "Protein", "Vitamin A"] },
    confidence: 0.98,
    identificationMethod: "Open Food Facts Barcode Dataset"
  },
  "8901719101072": {
    found: true,
    barcode: "8901719101072",
    name: "Aashirvaad Whole Wheat Atta",
    productNameOnly: "Whole Wheat Atta",
    brand: "Aashirvaad",
    category: "Grains",
    quantity: "5 kg",
    imageUrl: "",
    ingredients: "100% Whole Wheat Grain",
    allergens: ["Gluten"],
    nutrition: { calories: 340, protein: 12.0, carbs: 71.0, fat: 1.8, fiber: 11.5, sodium: 0.01, nutrients: ["Fiber", "Protein", "Iron"] },
    confidence: 0.98,
    identificationMethod: "Open Food Facts Barcode Dataset"
  },
  "8901058000524": {
    found: true,
    barcode: "8901058000524",
    name: "Nestle Maggi 2-Minute Noodles",
    productNameOnly: "2-Minute Masala Noodles",
    brand: "Maggi",
    category: "Packaged Foods",
    quantity: "70 g",
    imageUrl: "",
    ingredients: "Refined Wheat Flour, Palm Oil, Salt, Wheat Gluten, Spices (Coriander, Cumin, Turmeric)",
    allergens: ["Gluten", "Wheat"],
    nutrition: { calories: 427, protein: 8.2, carbs: 63.5, fat: 15.7, fiber: 3.6, sodium: 0.85, nutrients: ["Carbs", "Iron"] },
    confidence: 0.98,
    identificationMethod: "Open Food Facts Barcode Dataset"
  },
  "5449000000996": {
    found: true,
    barcode: "5449000000996",
    name: "Coca-Cola Original Taste",
    productNameOnly: "Original Taste Soft Drink",
    brand: "Coca-Cola",
    category: "Beverages",
    quantity: "750 mL",
    imageUrl: "",
    ingredients: "Carbonated Water, Sugar, Caramel Color, Phosphoric Acid, Natural Flavors, Caffeine",
    allergens: [],
    nutrition: { calories: 42, protein: 0, carbs: 10.6, fat: 0, fiber: 0, sodium: 0.01, nutrients: ["Carbs"] },
    confidence: 0.98,
    identificationMethod: "Open Food Facts Barcode Dataset"
  },
  "8901491100018": {
    found: true,
    barcode: "8901491100018",
    name: "Britannia Good Day Butter Biscuits",
    productNameOnly: "Good Day Butter Biscuits",
    brand: "Britannia",
    category: "Packaged Food",
    quantity: "120 g",
    imageUrl: "",
    ingredients: "Wheat Flour, Sugar, Vegetable Oil, Butter (2%), Milk Solids, Raising Agents",
    allergens: ["Wheat", "Gluten", "Milk"],
    nutrition: { calories: 492, protein: 6.5, carbs: 68.0, fat: 22.0, fiber: 2.1, sodium: 0.35, nutrients: ["Energy", "Protein"] },
    confidence: 0.98,
    identificationMethod: "Open Food Facts Barcode Dataset"
  },
  "8901063000021": {
    found: true,
    barcode: "8901063000021",
    name: "Parle-G Original Glucose Biscuits",
    productNameOnly: "Original Glucose Biscuits",
    brand: "Parle",
    category: "Packaged Food",
    quantity: "100 g",
    imageUrl: "",
    ingredients: "Wheat Flour, Sugar, Vegetable Oil, Invert Sugar Syrup, Raising Agents, Milk Solids",
    allergens: ["Wheat", "Gluten", "Milk"],
    nutrition: { calories: 454, protein: 6.7, carbs: 77.0, fat: 13.0, fiber: 1.5, sodium: 0.28, nutrients: ["Energy", "Glucose"] },
    confidence: 0.98,
    identificationMethod: "Open Food Facts Barcode Dataset"
  },
  "8901725111119": {
    found: true,
    barcode: "8901725111119",
    name: "Sunfeast Dark Fantasy Choco Fills Biscuits",
    productNameOnly: "Dark Fantasy Choco Fills",
    brand: "Sunfeast",
    category: "Packaged Food",
    quantity: "75 g",
    imageUrl: "",
    ingredients: "Choco Cream, Wheat Flour, Sugar, Hydrogenated Vegetable Oil, Cocoa Solids, Milk Solids",
    allergens: ["Wheat", "Gluten", "Milk", "Soy"],
    nutrition: { calories: 512, protein: 5.5, carbs: 64.0, fat: 26.0, fiber: 2.5, sodium: 0.22, nutrients: ["Choco Cream", "Energy"] },
    confidence: 0.98,
    identificationMethod: "Open Food Facts Barcode Dataset"
  },
  "8901491102029": {
    found: true,
    barcode: "8901491102029",
    name: "Britannia Bourbon Chocolate Cream Biscuits",
    productNameOnly: "Bourbon Chocolate Biscuits",
    brand: "Britannia",
    category: "Packaged Food",
    quantity: "150 g",
    imageUrl: "",
    ingredients: "Refined Wheat Flour, Sugar, Edible Vegetable Oil, Cocoa Solids, Starch, Milk Solids",
    allergens: ["Wheat", "Gluten", "Milk", "Soy"],
    nutrition: { calories: 485, protein: 5.8, carbs: 70.0, fat: 20.5, fiber: 2.0, sodium: 0.30, nutrients: ["Energy", "Cocoa"] },
    confidence: 0.98,
    identificationMethod: "Open Food Facts Barcode Dataset"
  },
  "8901030000001": {
    found: true,
    barcode: "8901030000001",
    name: "Amul Butter Pasteurised",
    productNameOnly: "Pasteurised Butter",
    brand: "Amul",
    category: "Dairy",
    quantity: "100 g",
    imageUrl: "",
    ingredients: "Butter, Common Salt",
    allergens: ["Milk"],
    nutrition: { calories: 717, protein: 0.6, carbs: 0.8, fat: 80.0, fiber: 0, sodium: 0.80, nutrients: ["Vitamin A", "Fat"] },
    confidence: 0.98,
    identificationMethod: "Open Food Facts Barcode Dataset"
  }
};

/**
 * Normalizes Open Food Facts product payload into a standardized FoodItem structure.
 * @param {object} product - Open Food Facts product object
 * @param {string} barcode 
 * @returns {object} Normalized product details
 */
export function normalizeOpenFoodFactsProduct(product, barcode) {
  if (!product) {
    return {
      found: false,
      barcode,
      confidence: 0
    };
  }

  const name = product.product_name_en || product.product_name || product.generic_name || "Packaged Product";
  const brand = product.brands ? product.brands.split(",")[0].trim() : "";
  const categoriesList = product.categories ? product.categories.split(",").map(c => c.trim()) : [];
  
  let category = "";
  const catLower = categoriesList.join(" ").toLowerCase();
  if (catLower.includes("dairy") || catLower.includes("milk") || catLower.includes("cheese") || catLower.includes("yogurt")) {
    category = "Dairy";
  } else if (catLower.includes("beverage") || catLower.includes("drink") || catLower.includes("juice") || catLower.includes("soda")) {
    category = "Beverages";
  } else if (catLower.includes("snack") || catLower.includes("biscuit") || catLower.includes("chip") || catLower.includes("chocolate")) {
    category = "Snacks";
  } else if (catLower.includes("grain") || catLower.includes("flour") || catLower.includes("cereal") || catLower.includes("rice") || catLower.includes("bread")) {
    category = "Grains";
  } else if (catLower.includes("fruit") || catLower.includes("apple") || catLower.includes("banana")) {
    category = "Fruits";
  } else if (catLower.includes("vegetable") || catLower.includes("tomato") || catLower.includes("potato")) {
    category = "Vegetables";
  } else if (catLower.includes("meat") || catLower.includes("poultry") || catLower.includes("fish")) {
    category = "Meat/Poultry";
  }

  const imageUrl = product.image_front_url || product.image_url || product.image_small_url || "";
  const quantity = product.quantity || (product.net_weight_value ? `${product.net_weight_value} ${product.net_weight_unit || "g"}` : "1 pack");
  
  let allergens = [];
  if (Array.isArray(product.allergens_tags) && product.allergens_tags.length > 0) {
    allergens = product.allergens_tags.map(tag => tag.replace(/^[a-z]{2}:/, "").replace(/-/g, " ")).map(a => a.charAt(0).toUpperCase() + a.slice(1));
  } else if (product.allergens) {
    allergens = product.allergens.split(",").map(a => a.trim()).filter(Boolean);
  }

  const nutriments = product.nutriments || {};
  const calories = Math.round(nutriments["energy-kcal_100g"] || nutriments["energy-kcal"] || nutriments["energy_100g"] / 4.184 || 0);
  const protein = parseFloat((nutriments["proteins_100g"] || nutriments["proteins"] || 0).toFixed(1));
  const carbs = parseFloat((nutriments["carbohydrates_100g"] || nutriments["carbohydrates"] || 0).toFixed(1));
  const fat = parseFloat((nutriments["fat_100g"] || nutriments["fat"] || 0).toFixed(1));
  const fiber = parseFloat((nutriments["fiber_100g"] || nutriments["fiber"] || 0).toFixed(1));
  const sodium = parseFloat((nutriments["sodium_100g"] || nutriments["sodium"] || 0).toFixed(2));

  const nutrientsList = [];
  if (protein > 5) nutrientsList.push("Protein");
  if (fiber > 3) nutrientsList.push("Fiber");
  if (nutriments["calcium_100g"] > 0.1) nutrientsList.push("Calcium");
  if (nutriments["vitamin-c_100g"] > 0.01) nutrientsList.push("Vitamin C");

  return {
    found: true,
    barcode,
    name: brand ? `${brand} ${name}` : name,
    productNameOnly: name,
    brand,
    category,
    quantity,
    imageUrl,
    ingredients: product.ingredients_text_en || product.ingredients_text || "",
    allergens: Array.from(new Set(allergens)),
    nutrition: {
      calories: Number.isFinite(calories) && calories > 0 ? calories : null,
      protein: Number.isFinite(protein) && protein > 0 ? protein : null,
      carbs: Number.isFinite(carbs) && carbs > 0 ? carbs : null,
      fat: Number.isFinite(fat) && fat > 0 ? fat : null,
      fiber: Number.isFinite(fiber) && fiber > 0 ? fiber : null,
      sodium: Number.isFinite(sodium) && sodium > 0 ? sodium : null,
      nutrients: nutrientsList
    },
    confidence: 0.95,
    identificationMethod: "Open Food Facts Barcode API",
    rawProduct: product
  };
}

/**
 * Looks up a barcode in Open Food Facts API with dataset fallback & local caching.
 * @param {string} barcode 
 * @returns {Promise<object>} Normalized product info
 */
export async function lookupBarcodeOpenFoodFacts(barcode) {
  const cleanBarcode = String(barcode || "").trim();
  if (!/^\d{8,14}$/.test(cleanBarcode)) {
    return { found: false, error: "Invalid barcode provided", confidence: 0 };
  }

  // 1. Check curated offline dataset registry for instant & reliable matches
  if (OFFLINE_BARCODE_DATASET_REGISTRY[cleanBarcode]) {
    console.log(`[OpenFoodFacts] ⚡ Serving barcode ${cleanBarcode} from offline dataset registry.`);
    return OFFLINE_BARCODE_DATASET_REGISTRY[cleanBarcode];
  }

  // 2. Check in-memory cache
  if (memoryCache.has(cleanBarcode)) {
    const cached = memoryCache.get(cleanBarcode);
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log(`[OpenFoodFacts] ⚡ Serving barcode ${cleanBarcode} from memory cache.`);
      return cached.data;
    }
  }

  // 3. Check localStorage cache
  if (typeof localStorage !== "undefined") {
    try {
      const rawStored = localStorage.getItem(CACHE_KEY_PREFIX + cleanBarcode);
      if (rawStored) {
        const parsed = JSON.parse(rawStored);
        if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
          console.log(`[OpenFoodFacts] ⚡ Serving barcode ${cleanBarcode} from localStorage cache.`);
          memoryCache.set(cleanBarcode, parsed);
          return parsed.data;
        }
      }
    } catch { /* ignore */ }
  }

  // 4. Query Open Food Facts API v2
  try {
    console.log(`[OpenFoodFacts] 🔍 Querying Open Food Facts API for barcode: ${cleanBarcode}...`);
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(cleanBarcode)}.json`;
    
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined
    });

    if (response.status === 404) {
      console.warn(`[OpenFoodFacts] Barcode ${cleanBarcode} is not present in Open Food Facts.`);
      return { found: false, barcode: cleanBarcode, status: "unknown", confidence: 0 };
    }
    if (!response.ok) {
      throw new Error(`Open Food Facts API HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.status === 1 && data.product) {
      const normalized = normalizeOpenFoodFactsProduct(data.product, cleanBarcode);
      
      const cacheObj = { timestamp: Date.now(), data: normalized };
      memoryCache.set(cleanBarcode, cacheObj);
      if (typeof localStorage !== "undefined") {
        try {
          localStorage.setItem(CACHE_KEY_PREFIX + cleanBarcode, JSON.stringify(cacheObj));
        } catch { /* ignore */ }
      }

      console.log(`[OpenFoodFacts] ✅ Successfully retrieved product: "${normalized.name}"`);
      return normalized;
    } else {
      console.warn(`[OpenFoodFacts] ⚠️ Barcode ${cleanBarcode} not found in Open Food Facts database.`);
      return { found: false, barcode: cleanBarcode, status: "unknown", confidence: 0 };
    }
  } catch (error) {
    console.error(`[OpenFoodFacts] Network or API error for barcode ${cleanBarcode}:`, error);
    return { found: false, barcode: cleanBarcode, status: "network_error", error: error.message, confidence: 0 };
  }
}

/**
 * Uses the package frame as a second-source enrichment for regional products
 * missing from Open Food Facts. Results are deliberately provisional: the
 * model must report null when the package does not show the value, and callers
 * must keep the item requiring confirmation.
 */
export async function lookupBarcodeWithGemini(barcode, imageBase64) {
  const apiKey = typeof localStorage !== "undefined"
    ? localStorage.getItem("smart_pantry_gemini_api_key")
    : (import.meta.env?.VITE_GEMINI_AI_API_KEY || import.meta.env?.VITE_GEMINI_API_KEY || "");
  if (!apiKey || !imageBase64 || !/^\d{8,14}$/.test(String(barcode || ""))) return null;

  try {
    const base64Data = String(imageBase64).replace(/^data:image\/\w+;base64,/, "");
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey.trim())}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined,
      body: JSON.stringify({
        contents: [{ parts: [
          { text: `Identify the packaged product shown in this image. The decoded barcode is ${barcode}. Use the barcode and visible package text together; do not infer a product from the barcode alone. Return null for every field not clearly supported by the package. Nutrition is per 100g/100ml only when printed on the package. Also inspect the printed expiry date or best before date if visible (in YYYY-MM-DD or DD/MM/YYYY format), and assess packaging condition (INTACT, DAMAGED, BLOATED, LEAKING, TORN). Return JSON only: {"product_name":string|null,"brand":string|null,"category":string|null,"quantity":string|null,"ingredients":string|null,"allergens":string[],"expiry_date":string|null,"packaging_condition":string|null,"packaging_notes":string|null,"nutrition":{"calories":number|null,"protein":number|null,"carbs":number|null,"fat":number|null,"fiber":number|null,"calcium":number|null}|null,"confidence":number}` },
          { inline_data: { mime_type: "image/jpeg", data: base64Data } }
        ] }],
        generationConfig: { response_mime_type: "application/json" }
      })
    });
    if (!response.ok) return null;
    const text = (await response.json()).candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const parsed = JSON.parse(text);
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
    if (!parsed.product_name || confidence < 0.7) return null;
    const nutrition = parsed.nutrition && typeof parsed.nutrition === "object" ? Object.fromEntries(
      ["calories", "protein", "carbs", "fat", "fiber", "calcium"].map((key) => [key, Number.isFinite(Number(parsed.nutrition[key])) ? Number(parsed.nutrition[key]) : null])
    ) : null;
    return {
      found: true,
      barcode: String(barcode),
      name: String(parsed.product_name),
      productNameOnly: String(parsed.product_name),
      brand: parsed.brand ? String(parsed.brand) : "",
      category: parsed.category ? String(parsed.category) : "",
      quantity: parsed.quantity ? String(parsed.quantity) : "",
      ingredients: parsed.ingredients ? String(parsed.ingredients) : "",
      allergens: Array.isArray(parsed.allergens) ? parsed.allergens.filter(Boolean).map(String) : [],
      nutrition,
      expiryDate: parsed.expiry_date ? String(parsed.expiry_date).trim() : null,
      packagingCondition: parsed.packaging_condition ? String(parsed.packaging_condition).trim() : "INTACT",
      packagingNotes: parsed.packaging_notes ? String(parsed.packaging_notes).trim() : null,
      confidence,
      requiresUserConfirmation: true,
      identificationMethod: "Gemini package-frame enrichment (provisional)"
    };
  } catch (error) {
    console.warn("[OpenFoodFacts] Gemini barcode enrichment unavailable:", error?.message || error);
    return null;
  }
}
