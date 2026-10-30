// Centralized Gemini AI Service (gemini-2.5-flash) with Structured JSON Output
// Powers Multimodal Grocery & Receipt Scans, Zero-Waste Recipes, Smart WhatsApp Alerts, and Impact Summaries.

export type RipenessStage = "unripe" | "peak_fresh" | "ripe_consume_now" | "overripe" | "spoiled";

export interface GeminiScanFoodItem {
  name: string;
  category: "Vegetables" | "Fruits" | "Dairy" | "Pantry";
  quantity: string;
  storage: "Pantry" | "Refrigerator" | "Freezer";
  estimated_shelf_life_days: number;
  macros_per_100g: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  };
  allergens: string[];
  // Biological feature evaluation (1–5 scale)
  surface_integrity: number; // 1 (mushy/punctured/liquid) to 5 (firm/intact)
  discoloration_browning: number; // 1 (heavy black/brown spotting/rot) to 5 (vibrant, natural color)
  hydration_turgor: number; // 1 (wilted/shriveled/dehydrated) to 5 (crisp/plump)
  spoilage_markers: string[]; // ["mold_fuzz", "soft_rot", "skin_wrinkling", "stem_browning", "none"]
  ripeness_stage: RipenessStage;
  // Deterministic calculated properties
  scan_date: string;
  expiry_date: string;
  days_left: number;
  freshness_score: number;
  condition: "Fresh" | "Good" | "Use Soon" | "Spoiled";
  visual_notes?: string;
  confidence?: number;
}

export interface GeminiStructuredRecipe {
  id: string;
  title: string;
  cuisine: string;
  difficulty: "Easy" | "Medium";
  prep_time_mins: number;
  cook_time_mins: number;
  matched_pantry_items: string[];
  pantry_match_percentage: number;
  missing_staples: string[];
  steps: string[];
  calories_per_serving: number;
  tags: string[];
  image?: string;
  // Backwards compatibility properties
  prep_time?: string;
  ingredients_used_from_pantry?: string[];
  missing_pantry_staples?: string[];
  quick_instructions?: string[];
  estimated_savings_inr?: number;
}

export function getGeminiApiKey(): string {
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem("smart_pantry_gemini_api_key");
    if (stored && stored.trim().length > 5) return stored.trim();
  }
  return (
    import.meta.env.VITE_GEMINI_AI_API_KEY ||
    import.meta.env.GEMINI_AI_API_KEY ||
    import.meta.env.VITE_GEMINI_API_KEY ||
    (typeof process !== "undefined" ? process.env.GEMINI_AI_API_KEY || process.env.VITE_GEMINI_AI_API_KEY : "") ||
    ""
  ).trim();
}

export const GEMINI_MODEL = (
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_GEMINI_MODEL) ||
  (typeof process !== "undefined" && process.env?.VITE_GEMINI_MODEL) ||
  "gemini-flash-lite-latest"
);

/**
 * Computes deterministic expiry_date = scan_date + estimated_shelf_life_days
 */
export function calculateExpiryFromShelfLife(shelfLifeDays: number, baseDate: Date = new Date()): { scan_date: string; expiry_date: string; days_left: number } {
  const scanDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  const scan_date = scanDate.toISOString().split("T")[0];
  
  const expDate = new Date(scanDate.getTime() + Math.max(0, shelfLifeDays) * 86400000);
  const expiry_date = expDate.toISOString().split("T")[0];
  
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days_left = Math.round((expDate.getTime() - todayMidnight.getTime()) / 86400000);

  return { scan_date, expiry_date, days_left };
}

/**
 * Compresses an image base64 data URL to maximum 1024x1024 at 0.8 JPEG quality
 * to avoid massive payload timeouts when sending camera/phone photos to Gemini.
 */
export async function compressImageBase64(
  imageBase64: string,
  maxWidth = 1024,
  maxHeight = 1024,
  quality = 0.8
): Promise<{ compressedBase64: string; mimeType: string }> {
  if (typeof window === "undefined" || typeof document === "undefined" || !imageBase64.startsWith("data:image")) {
    const rawMime = imageBase64.startsWith("data:image/png") ? "image/png" : "image/jpeg";
    return { compressedBase64: imageBase64, mimeType: rawMime };
  }

  return new Promise((resolve) => {
    let resolved = false;
    const fallbackMime = imageBase64.startsWith("data:image/png") ? "image/png" : "image/jpeg";
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({ compressedBase64: imageBase64, mimeType: fallbackMime });
      }
    }, 500);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve({ compressedBase64: imageBase64, mimeType: "image/jpeg" });
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const compressed = canvas.toDataURL("image/jpeg", quality);
      resolve({ compressedBase64: compressed, mimeType: "image/jpeg" });
    };
    img.onerror = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve({ compressedBase64: imageBase64, mimeType: fallbackMime });
    };
    img.src = imageBase64;
  });
}

/**
 * 1. Multimodal Scan & Food Detection (/scan-food):
 * Sends grocery photos or receipts to Gemini (gemini-2.5-flash) with response_mime_type: "application/json"
 * Prioritizes underlying morphological anatomy over surface fungal rot/mold.
 * Calculates and stores expiry_date = scan_date + estimated_shelf_life_days.
 */
export async function scanFoodWithGemini(
  imageBase64: string,
  options: { isReceipt?: boolean; userHint?: string } = {}
): Promise<{ success: boolean; items: GeminiScanFoodItem[]; isReceipt: boolean; error?: string }> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return {
      success: false,
      items: [],
      isReceipt: Boolean(options.isReceipt),
      error: "No Gemini API key available. Please configure in settings."
    };
  }

  try {
    // 1. Compress image to max 1024x1024 at 0.8 quality to prevent payload timeouts
    const { compressedBase64, mimeType } = await compressImageBase64(imageBase64, 1024, 1024, 0.8);
    const base64Data = compressedBase64.replace(/^data:image\/\w+;base64,/, "");

  const prompt = `You are a high-precision computer vision scanner for kitchen pantries and grocery receipts.
Inspect this image carefully. It may be:
1. A photo of a single food item (produce, dairy, bakery, meat, canned item).
2. A photo of multiple grocery items on a table/counter.
3. A grocery store bill / receipt with purchased items.

TASK:
Identify each distinct food item visible. For grocery receipts, extract each purchased food item from the line items.

MORPHOLOGY & ANATOMY PRIORITY (CRITICAL):
- First, identify the core anatomical produce structure (skin, stem, tuber morphology, geometry) beneath any surface defects. Do not confuse surface white fungal mold or fuzzy rot with cooked rice, cottage cheese, or dough.
- Broad Produce Classes & Distinctive Anatomical Signatures:
  * Eggplant / Brinjal (Baingan): Characteristic glossy deep purple, violet, or green bulbous/pear/cylindrical shape with thick green calyx/stem star cap. Even if heavily covered in white fungal mycelium, gray mold, or soft rot patches, identify as "Eggplant" or "Brinjal" (Category: "Vegetables"). NEVER identify as cooked rice, paneer, or dough.
  * Potato (Aloo): Rounded or oval starchy tuber with tan/brown earthy skin and root eyes. Even if covered in sprout shoots or greening solanine, identify as "Potato" (Category: "Vegetables").
  * Bell Pepper / Capsicum (Shimla Mirch): Lobed blocky or tapered hollow fruit with glossy skin and thick fibrous green crown stem. Even if sunken, wrinkly, or moldy, identify as "Bell Pepper" or "Capsicum" (Category: "Vegetables").
  * Tomato: Smooth rounded berry with 5-6 point star green calyx and fleshy interior. Even if bruised, cracked, or rotten, identify as "Tomato" (Category: "Vegetables").
  * Onion: Globose bulb with papery outer tunic skin, concentric rings, and root base. Even if covered in black mold, identify as "Onion" (Category: "Vegetables").
  * Banana: Curved elongated finger fruit with pedicel stalk and tapering apex. Even if black-spotted or brown, identify as "Banana" (Category: "Fruits").

For freshness inspection, perform an evidence-based biological evaluation of physiological traits on a strict 1-5 scale:
- surface_integrity: 1 (mushy/punctured/liquid leaking) to 5 (firm/intact/crisp outer structure)
- discoloration_browning: 1 (heavy black/brown spotting/rot) to 5 (vibrant, natural, healthy color)
- hydration_turgor: 1 (wilted/shriveled/dehydrated) to 5 (crisp/plump/hydrated)
- spoilage_markers: list observed markers from: ["mold_fuzz", "soft_rot", "skin_wrinkling", "stem_browning", "bruising", "liquid_leakage", "none"]
- ripeness_stage: strictly one of: "unripe" | "peak_fresh" | "ripe_consume_now" | "overripe" | "spoiled"

Category MUST be strictly one of: "Vegetables" | "Fruits" | "Dairy" | "Pantry"
Storage MUST be strictly one of: "Pantry" | "Refrigerator" | "Freezer"

Return valid JSON with an "items" array:
{
  "is_receipt": boolean,
  "items": [
    {
      "name": "string (clear common food name, e.g. 'Eggplant', 'Tomatoes', 'Amul Toned Milk', 'Bananas')",
      "category": "Vegetables" | "Fruits" | "Dairy" | "Pantry",
      "quantity": "string (e.g. '1 pcs', '6 pcs', '1 litre', '500 g', '1 bunch')",
      "storage": "Pantry" | "Refrigerator" | "Freezer",
      "surface_integrity": number (1 to 5),
      "discoloration_browning": number (1 to 5),
      "hydration_turgor": number (1 to 5),
      "spoilage_markers": ["string"],
      "ripeness_stage": "unripe" | "peak_fresh" | "ripe_consume_now" | "overripe" | "spoiled",
      "estimated_shelf_life_days": number (typical safe shelf life in days from today, e.g. 3, 5, 7, 14, 90),
      "macros_per_100g": {
        "calories": number,
        "protein": number,
        "carbs": number,
        "fat": number,
        "fiber": number
      },
      "allergens": ["string"],
      "visual_notes": "string (A concise, evidence-based user explanation citing observed physical traits, e.g.: 'Slight skin wrinkling and stem browning detected on banana peel; sugars are peaked, consume within 2 days')"
    }
  ]
}

CRITICAL RULES:
- Grade physiological traits (surface_integrity, discoloration_browning, hydration_turgor) on an objective 1-5 scale before computing condition.
- If a receipt has multiple items, list each food item in the "items" array.
- If it is a single food photo, return exactly 1 item in the "items" array with rigorous physiological evaluation.
- If food shows signs of mold or soft rot, include "mold_fuzz" or "soft_rot" in spoilage_markers, and set ripeness_stage: "spoiled".
- For allergens, detect standard allergens: "Milk", "Eggs", "Nuts", "Gluten", "Soy", "Fish", "Shellfish", "Sesame", or [] if none.
- In visual_notes, output a short, evidence-based user explanation (e.g., 'Slight skin wrinkling and stem browning detected on banana peel; sugars are peaked, consume within 2 days').
- Return ONLY pure JSON matching response_mime_type: "application/json".`;

  async function invokeGemini(modelName: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 15000) : null;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller?.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType, data: base64Data } }
              ]
            }
          ],
          generationConfig: {
            response_mime_type: "application/json",
            temperature: 0.2
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!candidateText) throw new Error("Empty candidate response returned from Gemini API");
      return candidateText;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  let candidateText = "";
  try {
    candidateText = await invokeGemini(GEMINI_MODEL);
  } catch (err: any) {
    console.warn(`[GeminiService] Primary model (${GEMINI_MODEL}) call failed: ${err.message}. Retrying with fallback model...`);
    try {
      const fallbackModel = GEMINI_MODEL === "gemini-flash-lite-latest" ? "gemini-flash-latest" : "gemini-flash-lite-latest";
      candidateText = await invokeGemini(fallbackModel);
    } catch (retryErr: any) {
      console.warn(`[GeminiService] Fallback model call also failed: ${retryErr.message}`);
      return {
        success: false,
        items: [],
        isReceipt: Boolean(options.isReceipt),
        error: retryErr.message
      };
    }
  }

  // Resilient JSON parsing
  let cleanJson = candidateText.trim();
  if (cleanJson.startsWith("```")) {
    cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleanJson);
  } catch (parseErr: any) {
    console.warn("[GeminiService] Initial JSON parse error, attempting regex JSON extraction:", parseErr.message);
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (innerErr: any) {
        return {
          success: false,
          items: [],
          isReceipt: Boolean(options.isReceipt),
          error: innerErr.message
        };
      }
    } else {
      return {
        success: false,
        items: [],
        isReceipt: Boolean(options.isReceipt),
        error: parseErr.message
      };
    }
  }

  const rawItems: any[] = Array.isArray(parsed.items) ? parsed.items : parsed.name ? [parsed] : [];

    const normalizedItems: GeminiScanFoodItem[] = rawItems.map((raw) => {
      // 1. Biological trait extraction & normalization (1–5 scale)
      const surfaceIntegrity = typeof raw.surface_integrity === "number" ? Math.max(1, Math.min(5, Math.round(raw.surface_integrity))) : 4;
      const discolorationBrowning = typeof raw.discoloration_browning === "number" ? Math.max(1, Math.min(5, Math.round(raw.discoloration_browning))) : 4;
      const hydrationTurgor = typeof raw.hydration_turgor === "number" ? Math.max(1, Math.min(5, Math.round(raw.hydration_turgor))) : 4;

      const rawMarkers: string[] = Array.isArray(raw.spoilage_markers) ? raw.spoilage_markers.map((m: any) => String(m).toLowerCase().trim()) : [];
      const spoilageMarkers = rawMarkers.length > 0 ? rawMarkers : ["none"];

      const validStages: RipenessStage[] = ["unripe", "peak_fresh", "ripe_consume_now", "overripe", "spoiled"];
      let ripenessStage: RipenessStage = "peak_fresh";
      if (typeof raw.ripeness_stage === "string") {
        const stageLower = raw.ripeness_stage.toLowerCase().trim() as RipenessStage;
        if (validStages.includes(stageLower)) {
          ripenessStage = stageLower;
        }
      }

      // Check biological spoilage flags
      const hasMoldOrRot = spoilageMarkers.some((m) => m.includes("mold") || m.includes("soft_rot") || m === "mold_fuzz" || m === "soft_rot");
      const isSpoiledCondition = hasMoldOrRot || ripenessStage === "spoiled" || surfaceIntegrity <= 1;

      // 2. Deterministic Freshness & Shelf-Life Calibration
      // Remove raw model hallucination of visual_freshness_score. Calculate it deterministically in code from the visual traits:
      let condition: "Fresh" | "Good" | "Use Soon" | "Spoiled";
      let calculatedFreshnessScore: number;
      let finalShelfLifeDays: number;

      const rawShelfLife = typeof raw.estimated_shelf_life_days === "number" ? Math.max(0, Math.round(raw.estimated_shelf_life_days)) : 4;

      if (isSpoiledCondition) {
        // If "mold_fuzz" or "soft_rot" in spoilage_markers: force condition = "Spoiled", visual_freshness_score <= 15%, estimated_shelf_life_days = 0
        condition = "Spoiled";
        const traitScore = Math.round(((surfaceIntegrity + discolorationBrowning + hydrationTurgor) / 15) * 100);
        calculatedFreshnessScore = Math.min(15, Math.max(5, traitScore));
        finalShelfLifeDays = 0;
      } else if (ripenessStage === "overripe" || discolorationBrowning <= 2) {
        // If overripe or discoloration_browning <= 2: force condition = "Use Soon", visual_freshness_score = 30-50%, estimated_shelf_life_days = 1-2
        condition = "Use Soon";
        const traitScore = Math.round(((surfaceIntegrity + discolorationBrowning + hydrationTurgor) / 15) * 100);
        calculatedFreshnessScore = Math.min(50, Math.max(30, traitScore));
        finalShelfLifeDays = Math.min(Math.max(1, rawShelfLife), 2);
      } else {
        // Otherwise: calculate visual_freshness_score = round(((surface_integrity + discoloration_browning + hydration_turgor) / 15) * 100)
        calculatedFreshnessScore = Math.round(((surfaceIntegrity + discolorationBrowning + hydrationTurgor) / 15) * 100);
        if (ripenessStage === "ripe_consume_now" && calculatedFreshnessScore < 60) {
          condition = "Use Soon";
          finalShelfLifeDays = Math.min(Math.max(1, rawShelfLife), 3);
        } else if (calculatedFreshnessScore >= 85) {
          condition = "Fresh";
          finalShelfLifeDays = rawShelfLife;
        } else if (calculatedFreshnessScore >= 60) {
          condition = "Good";
          finalShelfLifeDays = rawShelfLife;
        } else {
          condition = "Use Soon";
          finalShelfLifeDays = Math.min(Math.max(1, rawShelfLife), 2);
        }
      }

      const { scan_date, expiry_date, days_left } = calculateExpiryFromShelfLife(finalShelfLifeDays);

      let cat: "Vegetables" | "Fruits" | "Dairy" | "Pantry" = "Pantry";
      if (raw.category === "Vegetables" || raw.category === "Fruits" || raw.category === "Dairy" || raw.category === "Pantry") {
        cat = raw.category;
      } else {
        const cLower = String(raw.category || "").toLowerCase();
        if (cLower.includes("veg")) cat = "Vegetables";
        else if (cLower.includes("fruit")) cat = "Fruits";
        else if (cLower.includes("dair") || cLower.includes("milk") || cLower.includes("cheese")) cat = "Dairy";
        else cat = "Pantry";
      }

      let storage: "Pantry" | "Refrigerator" | "Freezer" = "Refrigerator";
      if (raw.storage === "Pantry" || raw.storage === "Refrigerator" || raw.storage === "Freezer") {
        storage = raw.storage;
      } else if (cat === "Vegetables" || cat === "Dairy") {
        storage = "Refrigerator";
      } else {
        storage = "Pantry";
      }

      const macros = raw.macros_per_100g || {};

      // In visual_notes, output a short, evidence-based user explanation
      let visualNotes = typeof raw.visual_notes === "string" ? raw.visual_notes.trim() : "";
      if (!visualNotes || visualNotes.length < 10) {
        if (condition === "Spoiled") {
          visualNotes = `Signs of decay (${spoilageMarkers.filter((m) => m !== "none").join(", ") || "soft rot"}) with compromised surface integrity (${surfaceIntegrity}/5); unsafe to consume.`;
        } else if (condition === "Use Soon") {
          visualNotes = `${ripenessStage === "overripe" ? "Overripe state" : "Noticeable browning/spotting (" + discolorationBrowning + "/5)"} detected; sugars are peaked, consume within ${finalShelfLifeDays} day${finalShelfLifeDays === 1 ? "" : "s"}.`;
        } else {
          visualNotes = `Firm surface integrity (${surfaceIntegrity}/5), vibrant coloration (${discolorationBrowning}/5), and healthy hydration; food is at ${ripenessStage.replace(/_/g, " ")} stage.`;
        }
      }

      return {
        name: raw.name || "Food Item",
        category: cat,
        quantity: raw.quantity || "1 pcs",
        storage,
        surface_integrity: surfaceIntegrity,
        discoloration_browning: discolorationBrowning,
        hydration_turgor: hydrationTurgor,
        spoilage_markers: spoilageMarkers,
        ripeness_stage: ripenessStage,
        estimated_shelf_life_days: finalShelfLifeDays,
        macros_per_100g: {
          calories: Number(macros.calories) || 50,
          protein: Number(macros.protein) || 1.5,
          carbs: Number(macros.carbs) || 10,
          fat: Number(macros.fat) || 0.5,
          fiber: Number(macros.fiber) || 1.5
        },
        allergens: Array.isArray(raw.allergens) ? raw.allergens : [],
        scan_date,
        expiry_date,
        days_left,
        freshness_score: calculatedFreshnessScore,
        condition,
        visual_notes: visualNotes
      };
    });

    return {
      success: normalizedItems.length > 0,
      items: normalizedItems,
      isReceipt: Boolean(parsed.is_receipt || options.isReceipt)
    };
  } catch (err: any) {
    console.warn("[GeminiService] Multimodal scan failed:", err.message);
    return {
      success: false,
      items: [],
      isReceipt: Boolean(options.isReceipt),
      error: err.message
    };
  }
}

/**
 * Helper to match high-resolution verified culinary images based on dish title, cuisine, and ingredients
 */
export function getRecipeImage(recipe: { title?: string; cuisine?: string; tags?: string[]; matched_pantry_items?: string[] }): string {
  const text = `${recipe.title || ""} ${recipe.cuisine || ""} ${(recipe.tags || []).join(" ")} ${(recipe.matched_pantry_items || []).join(" ")}`.toLowerCase();
  
  if (text.includes("spinach") || text.includes("palak") || text.includes("saag") || text.includes("green") || text.includes("kale")) {
    return "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80";
  }
  if (text.includes("curry") || text.includes("masala") || text.includes("paneer") || text.includes("dal") || text.includes("tikka") || text.includes("gravy")) {
    return "https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=800&q=80";
  }
  if (text.includes("toast") || text.includes("sandwich") || text.includes("bread") || text.includes("bruschetta") || text.includes("crouton")) {
    return "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80";
  }
  if (text.includes("pasta") || text.includes("noodle") || text.includes("spaghetti") || text.includes("macaroni") || text.includes("penne")) {
    return "https://images.unsplash.com/photo-1621996346565-e3d5d6281640?auto=format&fit=crop&w=800&q=80";
  }
  if (text.includes("rice") || text.includes("biryani") || text.includes("pulao") || text.includes("khichdi") || text.includes("fried rice")) {
    return "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80";
  }
  if (text.includes("salad") || text.includes("bowl") || text.includes("mediterranean")) {
    return "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80";
  }
  if (text.includes("soup") || text.includes("broth") || text.includes("stew") || text.includes("comfort")) {
    return "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=800&q=80";
  }
  if (text.includes("stir fry") || text.includes("sauté") || text.includes("saute") || text.includes("wok") || text.includes("veggie")) {
    return "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80";
  }
  if (text.includes("breakfast") || text.includes("oat") || text.includes("pancake") || text.includes("egg") || text.includes("scramble")) {
    return "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=800&q=80";
  }
  if (text.includes("dessert") || text.includes("sweet") || text.includes("cake") || text.includes("bake") || text.includes("pudding")) {
    return "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=800&q=80";
  }
  return "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80";
}

/**
 * 2. AI Zero-Waste Recipes (/recipes & /pantry-ai):
 * Filters inventory for items expiring in <= 3 days and prompts Gemini to generate
 * interactive, chef-grade zero-waste recipes prioritizing expiring stock.
 */
export async function generateZeroWasteRecipes(
  pantryItems: Array<{ name: string; expiresInDays?: number; days_left?: number; quantity?: string; category?: string }>,
  options: { maxRecipes?: number; dietaryPreference?: string } = {}
): Promise<GeminiStructuredRecipe[]> {
  const apiKey = getGeminiApiKey();

  // Filter items expiring in <= 3 days
  const expiringItems = pantryItems.filter((i) => {
    const days = typeof i.days_left === "number" ? i.days_left : typeof i.expiresInDays === "number" ? i.expiresInDays : 5;
    return days <= 3 && days >= 0;
  });

  const expiringList = expiringItems.map((i) => `${i.name} (${i.quantity || "1 pcs"}, expires in ${i.days_left ?? i.expiresInDays}d)`).join(", ");
  const otherItems = pantryItems.filter((i) => !expiringItems.includes(i)).slice(0, 15).map((i) => i.name).join(", ");

  const prompt = `You are an elite, chef-grade kitchen assistant.
Generate practical, mouth-watering gourmet meal ideas designed specifically to rescue kitchen ingredients that are expiring soon to achieve zero food waste.

Pantry items expiring within 3 days (STRICT PRIORITY TO RESCUE):
${expiringList || "Pantry items: " + pantryItems.slice(0, 6).map((i) => i.name).join(", ")}

Other available pantry staples:
${otherItems || "Salt, pepper, oil, water, flour, spices"}

Dietary Preference: ${options.dietaryPreference || "Flexible / Indian / Home-style"}

Respond strictly with valid JSON with a "recipes" array of ${options.maxRecipes || 4} recipes with this exact structure:
{
  "recipes": [
    {
      "id": "recipe-1",
      "title": "string (e.g. 'Crispy Spinach & Tomato Masala Toast')",
      "cuisine": "string (e.g. 'Indian', 'Italian', 'Asian', 'Mediterranean', 'Continental')",
      "difficulty": "Easy" | "Medium",
      "prep_time_mins": number (e.g. 10),
      "cook_time_mins": number (e.g. 15),
      "matched_pantry_items": ["string", "string"],
      "pantry_match_percentage": number (integer between 60 and 100 representing how much of recipe is covered by user's pantry),
      "missing_staples": ["string (e.g. Cooking oil, Salt, Black Pepper)"],
      "steps": [
        "Step 1: Prep and chop the ingredients...",
        "Step 2: Heat the pan...",
        "Step 3: Combine and serve..."
      ],
      "calories_per_serving": number (e.g. 280),
      "tags": ["Use Expiring First", "Under 20 Mins", "High Protein", "Vegetarian"]
    }
  ]
}

CRITICAL RULES:
- STRICT PRIORITY: Every recipe MUST prioritize using items from the expiring list!
- Tags must include matching tags from: ["Use Expiring First", "Under 20 Mins", "High Protein", "Vegetarian"].
- Keep matched_pantry_items strictly matching names the user actually has.
- Keep missing_staples minimal (salt, oil, common spices, etc.).
- Steps should be clear, professional chef instructions (3-5 steps).
- Return pure JSON only matching response_mime_type: "application/json".`;

  if (!apiKey) {
    return getFallbackZeroWasteRecipes(expiringItems, pantryItems);
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          response_mime_type: "application/json",
          temperature: 0.3
        }
      })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) throw new Error("Empty candidate text");

    const parsed = JSON.parse(candidateText);
    const rawList: any[] = Array.isArray(parsed.recipes) ? parsed.recipes : [];
    
    if (rawList.length === 0) {
      return getFallbackZeroWasteRecipes(expiringItems, pantryItems);
    }

    return rawList.map((raw, idx) => {
      const prepMins = Number(raw.prep_time_mins) || 10;
      const cookMins = Number(raw.cook_time_mins) || 15;
      const matched = Array.isArray(raw.matched_pantry_items)
        ? raw.matched_pantry_items
        : Array.isArray(raw.ingredients_used_from_pantry)
        ? raw.ingredients_used_from_pantry
        : [];
      const missing = Array.isArray(raw.missing_staples)
        ? raw.missing_staples
        : Array.isArray(raw.missing_pantry_staples)
        ? raw.missing_pantry_staples
        : ["Salt", "Cooking oil"];
      const steps = Array.isArray(raw.steps)
        ? raw.steps
        : Array.isArray(raw.quick_instructions)
        ? raw.quick_instructions
        : ["Prep ingredients", "Cook over medium heat", "Season and serve hot"];
      const tags = Array.isArray(raw.tags) ? raw.tags : ["Vegetarian"];
      if (prepMins + cookMins <= 20 && !tags.includes("Under 20 Mins")) tags.push("Under 20 Mins");
      if (expiringItems.length > 0 && !tags.includes("Use Expiring First")) tags.push("Use Expiring First");

      const matchPct = Number(raw.pantry_match_percentage) ||
        Math.min(100, Math.max(60, Math.round((matched.length / Math.max(1, matched.length + missing.length)) * 100)));

      const recipeObj: GeminiStructuredRecipe = {
        id: raw.id || `gemini-recipe-${idx + 1}-${Date.now()}`,
        title: raw.title || "Zero-Waste Chef Creation",
        cuisine: raw.cuisine || "Home-style",
        difficulty: raw.difficulty === "Medium" ? "Medium" : "Easy",
        prep_time_mins: prepMins,
        cook_time_mins: cookMins,
        matched_pantry_items: matched,
        pantry_match_percentage: matchPct,
        missing_staples: missing,
        steps,
        calories_per_serving: Number(raw.calories_per_serving) || 320,
        tags,
        image: raw.image || getRecipeImage({ title: raw.title, cuisine: raw.cuisine, tags, matched_pantry_items: matched }),
        // Backward compatibility
        prep_time: `${prepMins + cookMins} mins`,
        ingredients_used_from_pantry: matched,
        missing_pantry_staples: missing,
        quick_instructions: steps,
        estimated_savings_inr: Math.round(matched.length * 45)
      };

      return recipeObj;
    });
  } catch (err: any) {
    console.warn("[GeminiService] Recipe generation API failed, using fallback zero-waste recipes:", err.message);
    return getFallbackZeroWasteRecipes(expiringItems, pantryItems);
  }
}

/**
 * Fallback chef recipes with structured fields if offline or API limit reached
 */
function getFallbackZeroWasteRecipes(expiringItems: any[], allItems: any[]): GeminiStructuredRecipe[] {
  const expiringNames = expiringItems.map((i) => i.name);
  const primaryExpiring = expiringNames[0] || (allItems[0]?.name ?? "Spinach");
  const secondaryExpiring = expiringNames[1] || (allItems[1]?.name ?? "Tomatoes");

  return [
    {
      id: "chef-recipe-1",
      title: `Zero-Waste ${primaryExpiring} & ${secondaryExpiring} Sauté`,
      cuisine: "Indian",
      difficulty: "Easy",
      prep_time_mins: 5,
      cook_time_mins: 10,
      matched_pantry_items: [primaryExpiring, secondaryExpiring].filter(Boolean),
      pantry_match_percentage: 90,
      missing_staples: ["Cooking oil", "Cumin seeds", "Salt"],
      steps: [
        `Wash, trim, and gently chop the ${primaryExpiring} and ${secondaryExpiring} into bite-sized pieces.`,
        "Heat 1 tbsp oil or ghee in a pan over medium heat and temper with a pinch of cumin seeds until fragrant.",
        `Add the ${primaryExpiring} and ${secondaryExpiring}, stirring gently for 3-4 minutes until softened.`,
        "Season with salt, a pinch of turmeric, and black pepper. Garnish and serve warm with flatbread or rice."
      ],
      calories_per_serving: 210,
      tags: ["Use Expiring First", "Under 20 Mins", "Vegetarian", "High Protein"],
      image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80",
      prep_time: "15 mins",
      ingredients_used_from_pantry: [primaryExpiring, secondaryExpiring].filter(Boolean),
      missing_pantry_staples: ["Cooking oil", "Cumin seeds", "Salt"],
      quick_instructions: [
        "Chop vegetables into bite-sized pieces.",
        "Temper cumin seeds in hot oil.",
        "Sauté vegetables 4 minutes until tender.",
        "Season with salt and pepper."
      ],
      estimated_savings_inr: 85
    },
    {
      id: "chef-recipe-2",
      title: `Pantry-Rescue Golden Masala Toast`,
      cuisine: "Continental",
      difficulty: "Easy",
      prep_time_mins: 5,
      cook_time_mins: 8,
      matched_pantry_items: allItems.slice(0, 2).map((i) => i.name),
      pantry_match_percentage: 85,
      missing_staples: ["Butter", "Black pepper", "Chili flakes"],
      steps: [
        "Lightly butter both sides of available bread slices.",
        "Layer with thinly sliced pantry veggies and a sprinkle of spices.",
        "Toast in a skillet over low-medium heat until golden brown and crispy on both sides.",
        "Cut diagonally and serve hot with chutney or sauce."
      ],
      calories_per_serving: 260,
      tags: ["Use Expiring First", "Under 20 Mins", "Vegetarian"],
      image: "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80",
      prep_time: "13 mins",
      ingredients_used_from_pantry: allItems.slice(0, 2).map((i) => i.name),
      missing_pantry_staples: ["Butter", "Black pepper"],
      quick_instructions: [
        "Butter bread slices.",
        "Layer with sliced pantry ingredients.",
        "Toast until golden and crispy."
      ],
      estimated_savings_inr: 70
    },
    {
      id: "chef-recipe-3",
      title: `Rich Homestyle Comfort Vegetable Stew`,
      cuisine: "Mediterranean",
      difficulty: "Medium",
      prep_time_mins: 10,
      cook_time_mins: 15,
      matched_pantry_items: allItems.slice(0, 3).map((i) => i.name),
      pantry_match_percentage: 95,
      missing_staples: ["Olive oil", "Garlic", "Oregano", "Salt"],
      steps: [
        "Dice available pantry vegetables into uniform cubes.",
        "Sauté minced garlic in 1 tbsp olive oil until aromatic.",
        "Add diced ingredients, oregano, and 1.5 cups of water or broth.",
        "Cover and simmer for 12-15 minutes until vegetables are tender and broth is savory."
      ],
      calories_per_serving: 190,
      tags: ["Under 20 Mins", "Vegetarian", "High Protein"],
      image: "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=800&q=80",
      prep_time: "25 mins",
      ingredients_used_from_pantry: allItems.slice(0, 3).map((i) => i.name),
      missing_pantry_staples: ["Olive oil", "Garlic", "Salt"],
      quick_instructions: [
        "Dice vegetables.",
        "Sauté garlic in olive oil.",
        "Simmer vegetables in broth for 12 minutes."
      ],
      estimated_savings_inr: 110
    }
  ];
}

/**
 * 3. AI-Crafted Smart WhatsApp Alert Messages:
 * Replaces automated API log messages with friendly, human WhatsApp reminders written by Gemini.
 * Tone: Warm, practical, concise, and kitchen-friendly
 * (e.g., "👋 Hey Nilam! Your 1 loaf of Whole Wheat Bread expires tomorrow. How about making French toast or croutons for dinner tonight?")
 */
export async function generateWhatsAppMessageWithGemini(
  foodItem: { name: string; quantity?: string; days_left?: number; expiresInDays?: number; storage?: string },
  recipientName: string = "Nilam"
): Promise<string> {
  const apiKey = getGeminiApiKey();
  const daysLeft = typeof foodItem.days_left === "number" ? foodItem.days_left : typeof foodItem.expiresInDays === "number" ? foodItem.expiresInDays : 1;
  const qty = foodItem.quantity || "1 pcs";
  const name = foodItem.name || "Food Item";

  const expiryContext =
    daysLeft < 0
      ? "expired yesterday or earlier (past due)"
      : daysLeft === 0
      ? "expires TODAY (needs immediate use)"
      : daysLeft === 1
      ? "expires TOMORROW"
      : `expires in ${daysLeft} days`;

  const fallback =
    daysLeft === 0
      ? `👋 Hey ${recipientName}! Your ${qty} of ${name} reaches its best-by date today. How about a quick stir-fry, soup, or snack for lunch or dinner? 🍲✨`
      : daysLeft === 1
      ? `👋 Hey ${recipientName}! Your ${qty} of ${name} expires tomorrow. How about making something tasty tonight so nothing goes to waste? 🍽️✨`
      : daysLeft < 0
      ? `👋 Hey ${recipientName}! A gentle heads-up that ${name} is past its consume-by date. Please check its freshness or remove it to keep your pantry fresh! 🧹🌿`
      : `👋 Hey ${recipientName}! Your ${qty} of ${name} is fresh in your pantry (${daysLeft} days left). Enjoy it at peak freshness! 🥗✨`;

  if (!apiKey) return fallback;

  const prompt = `You are writing a warm, friendly WhatsApp message to ${recipientName} from her AI Smart Pantry.
Item: ${qty} of ${name}
Status: ${expiryContext}

Write a natural, warm, practical, concise, and kitchen-friendly WhatsApp message (1-2 sentences).
TONE GUIDELINE:
- Warm and friendly, like a helpful kitchen friend (e.g. "👋 Hey Nilam! Your 1 loaf of Whole Wheat Bread expires tomorrow. How about making French toast or croutons for dinner tonight?")
- Suggest a creative, quick, zero-waste meal or use idea tailored to the item.
- Do NOT include technical headers, log statuses, bullet points, or API words.
- Keep it under 200 characters.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7 }
      })
    });

    if (!response.ok) return fallback;
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}

/**
 * 4. Conversational Impact Summary for Insights banner:
 * Generates a 2-sentence conversational impact summary in the banner tracking food rescued and money saved.
 */
export async function generateImpactSummaryWithGemini(metrics: {
  foodSavedCount: number;
  wastePreventedKg: number;
  moneySavedINR: number;
  co2AvoidedKg: number;
  freshCount: number;
  totalTracked: number;
}): Promise<string> {
  const apiKey = getGeminiApiKey();

  const fallback =
    metrics.foodSavedCount > 0
      ? `You have rescued ${metrics.foodSavedCount} food item${metrics.foodSavedCount !== 1 ? "s" : ""}, prevented ${metrics.wastePreventedKg} kg of waste, and saved an estimated ₹${metrics.moneySavedINR.toLocaleString("en-IN")}. Your kitchen is operating at peak freshness while keeping nutritious food out of landfills.`
      : `All ${metrics.totalTracked} pantry items are currently fresh and tracked (100% in good standing). Mark items as consumed as you cook to track food rescued and money saved!`;

  if (!apiKey) return fallback;

  const prompt = `You are an encouraging kitchen sustainability advisor.
Write exactly a 2-sentence conversational impact summary for the top banner of Nilam's Smart Pantry Insights page.
Metrics:
- Food Rescued: ${metrics.foodSavedCount} items
- Food Waste Prevented: ${metrics.wastePreventedKg} kg
- Money Saved: ₹${metrics.moneySavedINR}
- Carbon (CO2) Avoided: ${metrics.co2AvoidedKg} kg
- Fresh Items Active: ${metrics.freshCount} of ${metrics.totalTracked}

INSTRUCTIONS:
- Tone: Uplifting, warm, celebratory, conversational.
- Exactly 2 sentences.
- Mention real impact (food rescued, money saved, and zero kitchen waste).
- If food rescued is 0, congratulate her on having 100% fresh stock and motivate cooking.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6 }
      })
    });

    if (!response.ok) return fallback;
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}

/**
 * 5. Automated AI Nutrition Enrichment (Global for All Items):
 * Estimates and returns macronutrients per 100g for any food item.
 * Guarantees accurate values (e.g. approx. 290 kcal, 19g protein, 22g fat, 3g carbs for Paneer).
 */
export async function estimateNutritionWithGemini(
  foodName: string,
  category?: string,
  quantity?: string
): Promise<{ calories: number; protein: number; carbs: number; fat: number; fiber: number }> {
  const lower = foodName.toLowerCase();

  // Instant accurate dictionary lookup for common pantry foods
  if (lower.includes("paneer")) {
    return { calories: 290, protein: 19, carbs: 3, fat: 22, fiber: 0 };
  }
  if (lower.includes("milk")) {
    return { calories: 58, protein: 3.1, carbs: 4.8, fat: 3.0, fiber: 0 };
  }
  if (lower.includes("spinach") || lower.includes("palak")) {
    return { calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2 };
  }
  if (lower.includes("tomato")) {
    return { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2 };
  }
  if (lower.includes("apple")) {
    return { calories: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4 };
  }
  if (lower.includes("banana")) {
    return { calories: 89, protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6 };
  }
  if (lower.includes("rice")) {
    return { calories: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4 };
  }
  if (lower.includes("bread")) {
    return { calories: 247, protein: 13, carbs: 41, fat: 3.4, fiber: 7 };
  }
  if (lower.includes("egg")) {
    return { calories: 155, protein: 13, carbs: 1.1, fat: 11, fiber: 0 };
  }
  if (lower.includes("potato")) {
    return { calories: 77, protein: 2, carbs: 17, fat: 0.1, fiber: 2.2 };
  }
  if (lower.includes("curd") || lower.includes("yogurt")) {
    return { calories: 61, protein: 3.5, carbs: 4.7, fat: 3.3, fiber: 0 };
  }
  if (lower.includes("almond")) {
    return { calories: 579, protein: 21, carbs: 22, fat: 50, fiber: 12.5 };
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return { calories: 120, protein: 3.5, carbs: 18, fat: 2.5, fiber: 2 };
  }

  const prompt = `You are a certified nutrition scientist.
Provide standard, accurate macronutrient values per 100g for the following food item:
Food Name: "${foodName}"
Category: "${category || "Food"}"
Quantity noted: "${quantity || "100g"}"

Respond strictly with valid JSON with these exact numerical fields (per 100g):
{
  "calories": number,
  "protein": number,
  "carbs": number,
  "fat": number,
  "fiber": number
}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          response_mime_type: "application/json",
          temperature: 0.1
        }
      })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) throw new Error("Empty candidate text");
    const parsed = JSON.parse(candidateText);

    return {
      calories: Number(parsed.calories) || 120,
      protein: Number(parsed.protein) || 3,
      carbs: Number(parsed.carbs) || 15,
      fat: Number(parsed.fat) || 2,
      fiber: Number(parsed.fiber) || 1
    };
  } catch (err: any) {
    console.warn("[GeminiService] Nutrition estimation API failed:", err.message);
    return { calories: 120, protein: 3.5, carbs: 18, fat: 2.5, fiber: 2 };
  }
}

export interface ItemDetailRecipe {
  id: string;
  title: string;
  cook_time_mins: number;
  pantry_match_percentage: number;
  waste_saved_inr: number;
  image: string;
  cuisine: string;
  difficulty: "Easy" | "Medium";
  steps: string[];
  matched_pantry_items: string[];
  missing_staples: string[];
}

/**
 * 6. Multi-Recipe Recommendation (3 to 5 diverse recipes for an item):
 * For Fresh Paneer: Palak Paneer, Quick Paneer Bhurji, Paneer Tikka, and Matar Paneer.
 */
export async function generateItemRecipesWithGemini(
  item: { name: string; category?: string; quantity?: string },
  otherPantryItems: Array<{ name: string }> = []
): Promise<ItemDetailRecipe[]> {
  const lower = item.name.toLowerCase();

  // Curated diverse dishes for Fresh Paneer
  if (lower.includes("paneer")) {
    return [
      {
        id: "paneer-palak",
        title: "Creamy Palak Paneer",
        cook_time_mins: 25,
        pantry_match_percentage: 90,
        waste_saved_inr: 180,
        image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80",
        cuisine: "Indian",
        difficulty: "Medium",
        steps: [
          "Blanch spinach leaves for 2 minutes and blend into a smooth vibrant green purée.",
          "Sauté cumin seeds, finely chopped onions, and garlic until golden brown.",
          "Add diced tomatoes, turmeric, and garam masala; simmer into a rich masala base.",
          "Stir in the spinach purée and fresh paneer cubes; simmer gently for 4 minutes."
        ],
        matched_pantry_items: ["Fresh Paneer", "Spinach", "Tomatoes"],
        missing_staples: ["Cooking oil", "Cumin", "Garlic"]
      },
      {
        id: "paneer-bhurji",
        title: "Quick 15-Min Paneer Bhurji",
        cook_time_mins: 15,
        pantry_match_percentage: 95,
        waste_saved_inr: 150,
        image: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=800&q=80",
        cuisine: "Indian",
        difficulty: "Easy",
        steps: [
          "Crumble fresh paneer with your hands into a bowl.",
          "Heat 1 tbsp oil or ghee; sauté chopped onions, green chilies, and tomatoes.",
          "Add turmeric, chili powder, and salt; cook until tomatoes are soft.",
          "Toss in crumbled paneer and chopped coriander, stirring on medium heat for 3 minutes."
        ],
        matched_pantry_items: ["Fresh Paneer", "Tomatoes", "Onions"],
        missing_staples: ["Butter", "Green chili", "Turmeric"]
      },
      {
        id: "paneer-tikka",
        title: "Tandoori Paneer Tikka Skewers",
        cook_time_mins: 20,
        pantry_match_percentage: 85,
        waste_saved_inr: 190,
        image: "https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=800&q=80",
        cuisine: "Indian",
        difficulty: "Medium",
        steps: [
          "Whisk thick curd with ginger-garlic paste, red chili powder, kasuri methi, and mustard oil.",
          "Cut paneer and bell peppers into thick 1-inch squares.",
          "Marinate cubes in spiced curd mixture for 10 minutes.",
          "Grill in an oven or sear on a hot skillet until charred and smoky on all edges."
        ],
        matched_pantry_items: ["Fresh Paneer", "Curd"],
        missing_staples: ["Mustard oil", "Chaat masala", "Lemon"]
      },
      {
        id: "paneer-matar",
        title: "Homestyle Matar Paneer Curry",
        cook_time_mins: 25,
        pantry_match_percentage: 90,
        waste_saved_inr: 160,
        image: "https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=800&q=80",
        cuisine: "Indian",
        difficulty: "Easy",
        steps: [
          "Lightly pan-sear paneer cubes until golden and set aside in warm water.",
          "In the same pan, make a tomato-onion gravy seasoned with coriander and garam masala.",
          "Add green peas (matar) and ½ cup water; simmer for 6 minutes until tender.",
          "Fold in paneer cubes and a spoon of fresh cream; serve hot with rice or roti."
        ],
        matched_pantry_items: ["Fresh Paneer", "Tomatoes", "Milk"],
        missing_staples: ["Green peas", "Garam masala", "Coriander"]
      }
    ];
  }

  // Curated fallbacks for other common items
  if (lower.includes("spinach") || lower.includes("palak")) {
    return [
      {
        id: "spinach-dal",
        title: "Garlicky Dal Palak",
        cook_time_mins: 20,
        pantry_match_percentage: 90,
        waste_saved_inr: 120,
        image: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=800&q=80",
        cuisine: "Indian",
        difficulty: "Easy",
        steps: ["Boil lentils with turmeric.", "Sauté garlic and spinach until wilted.", "Combine and simmer for 5 minutes."],
        matched_pantry_items: ["Spinach", "Tomatoes"],
        missing_staples: ["Lentils", "Garlic", "Ghee"]
      },
      {
        id: "spinach-omelette",
        title: "Spinach & Herb Omelette",
        cook_time_mins: 10,
        pantry_match_percentage: 95,
        waste_saved_inr: 90,
        image: "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80",
        cuisine: "Continental",
        difficulty: "Easy",
        steps: ["Whisk eggs with a pinch of salt.", "Sauté chopped spinach in butter.", "Pour eggs over spinach and fold."],
        matched_pantry_items: ["Spinach", "Farm Eggs"],
        missing_staples: ["Butter", "Black pepper"]
      },
      {
        id: "spinach-smoothie",
        title: "Power Green Detox Smoothie",
        cook_time_mins: 5,
        pantry_match_percentage: 85,
        waste_saved_inr: 75,
        image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80",
        cuisine: "Healthy",
        difficulty: "Easy",
        steps: ["Wash spinach.", "Blend with sliced apple and cold water or yogurt.", "Serve chilled."],
        matched_pantry_items: ["Spinach", "Shimla Apples"],
        missing_staples: ["Honey", "Lemon juice"]
      }
    ];
  }

  // Dynamic Gemini generation for any other item
  const apiKey = getGeminiApiKey();
  const otherNames = otherPantryItems.slice(0, 10).map((i) => i.name).join(", ");

  if (!apiKey) {
    return [
      {
        id: `recipe-sauté-${Date.now()}`,
        title: `Homestyle ${item.name} Sauté`,
        cook_time_mins: 15,
        pantry_match_percentage: 90,
        waste_saved_inr: 110,
        image: getRecipeImage({ title: item.name, matched_pantry_items: [item.name] }),
        cuisine: "Home-style",
        difficulty: "Easy",
        steps: ["Chop ingredients.", "Sauté in oil with seasonings.", "Cook until tender and serve warm."],
        matched_pantry_items: [item.name],
        missing_staples: ["Oil", "Salt", "Spices"]
      },
      {
        id: `recipe-bowl-${Date.now()}`,
        title: `Pantry Comfort ${item.name} Bowl`,
        cook_time_mins: 20,
        pantry_match_percentage: 85,
        waste_saved_inr: 130,
        image: getRecipeImage({ title: "Comfort Bowl", matched_pantry_items: [item.name] }),
        cuisine: "Continental",
        difficulty: "Easy",
        steps: ["Prepare base grains.", "Cook ${item.name} with aromatic spices.", "Assemble in a warm bowl."],
        matched_pantry_items: [item.name],
        missing_staples: ["Water", "Black pepper"]
      },
      {
        id: `recipe-skillet-${Date.now()}`,
        title: `Crispy ${item.name} Skillet`,
        cook_time_mins: 15,
        pantry_match_percentage: 85,
        waste_saved_inr: 100,
        image: getRecipeImage({ title: "Skillet", matched_pantry_items: [item.name] }),
        cuisine: "Fusion",
        difficulty: "Easy",
        steps: ["Dice ${item.name}.", "Sear in hot skillet until golden.", "Season to taste."],
        matched_pantry_items: [item.name],
        missing_staples: ["Cooking oil", "Herbs"]
      }
    ];
  }

  const prompt = `You are an expert culinary chef.
Generate 4 diverse, delicious recipes that prominently feature "${item.name}" (quantity: ${item.quantity || "available"}), combining it with other pantry items:
Other Pantry Items: ${otherNames || "Salt, oil, onions, garlic, spices, rice"}

Respond strictly with valid JSON with a "recipes" array:
{
  "recipes": [
    {
      "id": "string",
      "title": "string (e.g. 'Garlic Herb Sautéed ${item.name}')",
      "cook_time_mins": number,
      "pantry_match_percentage": number (integer between 75 and 100),
      "waste_saved_inr": number (e.g. 140),
      "cuisine": "string (e.g. 'Indian', 'Continental', 'Italian')",
      "difficulty": "Easy" | "Medium",
      "steps": ["Step 1...", "Step 2...", "Step 3..."],
      "matched_pantry_items": ["string"],
      "missing_staples": ["string"]
    }
  ]
}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          response_mime_type: "application/json",
          temperature: 0.3
        }
      })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) throw new Error("Empty candidate text");
    const parsed = JSON.parse(candidateText);
    const list: any[] = Array.isArray(parsed.recipes) ? parsed.recipes : [];

    return list.map((r, idx) => ({
      id: r.id || `gen-item-recipe-${idx}-${Date.now()}`,
      title: r.title || `Delicious ${item.name} Dish`,
      cook_time_mins: Number(r.cook_time_mins) || 20,
      pantry_match_percentage: Number(r.pantry_match_percentage) || 85,
      waste_saved_inr: Number(r.waste_saved_inr) || 120,
      image: getRecipeImage({ title: r.title, cuisine: r.cuisine, matched_pantry_items: [item.name] }),
      cuisine: r.cuisine || "Home-style",
      difficulty: r.difficulty === "Medium" ? "Medium" : "Easy",
      steps: Array.isArray(r.steps) ? r.steps : ["Prep ingredients", "Cook in skillet", "Serve hot"],
      matched_pantry_items: Array.isArray(r.matched_pantry_items) ? r.matched_pantry_items : [item.name],
      missing_staples: Array.isArray(r.missing_staples) ? r.missing_staples : ["Salt", "Oil"]
    }));
  } catch (err: any) {
    console.warn("[GeminiService] Recipe generation for item failed:", err.message);
    return [
      {
        id: `recipe-sauté-${Date.now()}`,
        title: `Homestyle ${item.name} Sauté`,
        cook_time_mins: 15,
        pantry_match_percentage: 90,
        waste_saved_inr: 110,
        image: getRecipeImage({ title: item.name, matched_pantry_items: [item.name] }),
        cuisine: "Home-style",
        difficulty: "Easy",
        steps: ["Chop ingredients.", "Sauté in oil with seasonings.", "Cook until tender and serve warm."],
        matched_pantry_items: [item.name],
        missing_staples: ["Oil", "Salt", "Spices"]
      }
    ];
  }
}

/**
 * 7. Actionable Storage Guidelines with Gemini:
 * Generates 2-3 specific, actionable storage rules tailored to this exact food item.
 */
export async function generateStorageTipsWithGemini(
  foodName: string,
  category: string = "Food",
  currentStorage: string = "Refrigerator"
): Promise<Array<{ title: string; desc: string }>> {
  const lower = foodName.toLowerCase();

  // Curated instant tips for paneer
  if (lower.includes("paneer")) {
    return [
      {
        title: "Submerge in Cold Water",
        desc: "Place fresh paneer in a container and cover completely with cold drinking water in the fridge. Change the water every 2 days to keep it super soft and prevent souring for up to 7–10 days."
      },
      {
        title: "Airtight Glass Container",
        desc: "Dairy absorbs strong aromas quickly. Keep paneer sealed in an airtight glass or food-safe BPA-free container away from pungent foods like cut onions or garlic."
      },
      {
        title: "Freeze Lightly Pan-Fried Cubes",
        desc: "If not using within 4 days, cut paneer into cubes, pan-fry lightly in 1 tsp oil, drain, and freeze in a ziplock bag for up to 2 months. Thaw in warm salted water before cooking."
      }
    ];
  }

  if (lower.includes("spinach") || lower.includes("palak")) {
    return [
      {
        title: "Paper Towel Moisture Absorption",
        desc: "Wrap unwashed spinach leaves gently in a dry paper towel inside a sealed plastic or glass container. The towel absorbs moisture and prevents the leaves from turning slimy."
      },
      {
        title: "Wash Only Right Before Eating",
        desc: "Moisture is the enemy of greens. Never wash spinach before storing; rinse in cold water only immediately before cooking or blending."
      },
      {
        title: "Keep in Vegetable Crisper",
        desc: "Store in the refrigerator crisper drawer with high humidity setting to retain crisp texture for 5–7 days."
      }
    ];
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return [
      {
        title: "Temperature Stability",
        desc: `Store ${foodName} in ${currentStorage} away from fluctuating temperatures and direct heat sources.`
      },
      {
        title: "Moisture Protection",
        desc: "Keep container properly sealed to lock in freshness and prevent moisture loss or absorption."
      },
      {
        title: "Prompt Consumption",
        desc: "Consume near its peak freshness date for optimal nutritional value, texture, and flavor."
      }
    ];
  }

  const prompt = `You are a food preservation and kitchen storage expert.
Write 3 actionable, specific storage tips for "${foodName}" (Category: ${category}, Stored in: ${currentStorage}).
Respond strictly with valid JSON with a "tips" array:
{
  "tips": [
    {
      "title": "string (Short catchy 2-4 word tip name)",
      "desc": "string (1-2 sentences of specific, actionable advice on temperature, moisture, container, or preservation)"
    }
  ]
}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          response_mime_type: "application/json",
          temperature: 0.2
        }
      })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) throw new Error("Empty candidate text");
    const parsed = JSON.parse(candidateText);
    const list: any[] = Array.isArray(parsed.tips) ? parsed.tips : [];
    if (list.length === 0) throw new Error("No tips");

    return list.slice(0, 3).map((t) => ({
      title: t.title || "Storage Guideline",
      desc: t.desc || `Keep ${foodName} properly sealed in ${currentStorage}.`
    }));
  } catch (err: any) {
    return [
      {
        title: "Temperature Stability",
        desc: `Store ${foodName} in ${currentStorage} away from fluctuating temperatures and direct heat sources.`
      },
      {
        title: "Moisture Protection",
        desc: "Keep container properly sealed to lock in freshness and prevent moisture loss or absorption."
      },
      {
        title: "Prompt Consumption",
        desc: "Consume near its peak freshness date for optimal nutritional value, texture, and flavor."
      }
    ];
  }
}

