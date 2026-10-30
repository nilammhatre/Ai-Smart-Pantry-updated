import { lookupFoodMaster } from "./foodMasterDb.js";

function getGeminiApiKey() {
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem("smart_pantry_gemini_api_key");
    if (stored && stored.trim().length > 10) return stored.trim();
  }
  return (import.meta.env?.VITE_GEMINI_AI_API_KEY || import.meta.env?.VITE_GEMINI_API_KEY || import.meta.env?.GEMINI_AI_API_KEY || "").trim();
}

/**
 * Normalizes string date representations into standard YYYY-MM-DD format.
 * Handles DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, YYYY/MM/DD, YYYY.MM.DD, DD MMM YYYY, MMM YYYY.
 * @param {string} dateStr 
 * @returns {string|null} Standardized ISO date string (YYYY-MM-DD) or null if invalid
 */
export function normalizeDateString(dateStr, { kind = "expiry" } = {}) {
  if (!dateStr || typeof dateStr !== "string") return null;
  let clean = dateStr.trim().replace(/\s+/g, " ");

  // Strip common label prefixes like 'EXP:', 'BEST BEFORE:', 'MFD', etc.
  clean = clean.replace(/^(?:EXP(?:IRY)?|USE\s*BY|USE\s*BEFORE|BEST\s*BEFORE|BEST\s*BY|B\.?B\.?E\.?|BBD|MFG|MFD|PKD|PACKED(?:\s*ON)?)\s*[:#.-]?\s*/i, "").trim();

  // Tesseract often drops the separator between MM and YYYY (15/1212028).
  const compactDate = clean.match(/^(\d{1,2})[\/. -](\d{2})(\d{4})$/);
  if (compactDate) clean = `${compactDate[1]}/${compactDate[2]}/${compactDate[3]}`;

  const makeDate = (year, month, day) => {
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
      ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
  };

  const yearValue = (year) => {
    const s = String(year);
    return s.length === 2 ? (Number(s) > 50 ? `19${s}` : `20${s}`) : s;
  };

  // 1. ISO format check (YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD)
  const isoMatch = clean.match(/^(\d{4})[\/\.-](\d{1,2})[\/\.-](\d{1,2})$/);
  if (isoMatch) {
    return makeDate(isoMatch[1], isoMatch[2], isoMatch[3]);
  }

  // 2. Month-Year without day: e.g. Nov 2026, November 2026, Nov-26, 11/2026, 11/26
  const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const textMonthYear = clean.match(/^([a-zA-Z]{3,9})\s*[\/,-]?\s*(\d{2,4})$/);
  if (textMonthYear) {
    const mIndex = monthNames.findIndex(m => textMonthYear[1].toLowerCase().startsWith(m));
    if (mIndex !== -1) {
      const year = yearValue(textMonthYear[2]);
      const month = mIndex + 1;
      const day = kind === "manufacturing" ? 1 : new Date(Number(year), month, 0).getDate();
      return makeDate(year, month, day);
    }
  }

  const numericMonthYear = clean.match(/^(\d{1,2})\s*[\/-]\s*(\d{2,4})$/);
  if (numericMonthYear) {
    const month = Number(numericMonthYear[1]);
    const year = yearValue(numericMonthYear[2]);
    if (month >= 1 && month <= 12) {
      const day = kind === "manufacturing" ? 1 : new Date(Number(year), month, 0).getDate();
      return makeDate(year, month, day);
    }
  }

  // 3. Textual day-month-year: 15 Oct 2026, 15-Oct-26, Oct 15 2026, 15th October 2026
  const textDayMatch = clean.match(/^(\d{1,2})(?:st|nd|rd|th)?\s*[-/,\s]?\s*([a-zA-Z]{3,9})\s*[-/,\s]?\s*(\d{2,4})$/i) ||
                       clean.match(/^([a-zA-Z]{3,9})\s*(\d{1,2})(?:st|nd|rd|th)?\s*[-/,\s]?\s*(\d{2,4})$/i);
  if (textDayMatch) {
    let day, monthText, yearText;
    if (isNaN(Number(textDayMatch[1]))) {
      monthText = textDayMatch[1];
      day = textDayMatch[2];
      yearText = textDayMatch[3];
    } else {
      day = textDayMatch[1];
      monthText = textDayMatch[2];
      yearText = textDayMatch[3];
    }
    const mIndex = monthNames.findIndex(m => monthText.toLowerCase().startsWith(m));
    if (mIndex !== -1) {
      return makeDate(yearValue(yearText), mIndex + 1, parseInt(day, 10));
    }
  }

  // 4. Standard separators (DD/MM/YYYY or DD-MM-YYYY or MM/DD/YYYY)
  const numericMatch = clean.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})$/);
  if (numericMatch) {
    const first = parseInt(numericMatch[1], 10);
    const second = parseInt(numericMatch[2], 10);
    const year = yearValue(numericMatch[3]);
    const day = first > 12 ? first : second > 12 ? second : first;
    const month = first > 12 ? second : second > 12 ? first : second;
    return makeDate(year, month, day);
  }

  // 5. 8-digit compact dates
  const compact8 = clean.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact8) {
    return makeDate(compact8[1], compact8[2], compact8[3]);
  }
  const compact8DmY = clean.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (compact8DmY) {
    return makeDate(compact8DmY[3], compact8DmY[2], compact8DmY[1]);
  }

  return null;
}

function findDateAfterLabel(text, labels) {
  const label = labels.join("|");
  const match = text.match(new RegExp(`(?:${label})\\s*[:#.-]?\\s*((?:\\d{4}-\\d{4})|(?:\\d{1,2}[\\/. -]\\d{6,8})|(?:\\d{8,9})|(?:(?:\\d{1,2}[\\/. -]){1,2}\\d{2,4})|\\d{1,2}\\s*[A-Za-z]{3,9}\\s*\\d{2,4}|[A-Za-z]{3,9}\\s*\\d{2,4})`, "i"));
  return match?.[1] || null;
}

function calculateExpiryFromShelfLife(text, manufacturingDate) {
  if (!manufacturingDate) return null;
  const wordToNum = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    twelve: 12, eighteen: 18, "twenty four": 24, "twenty-four": 24
  };

  const match = String(text || "").match(/(?:BEST\s*BEFORE|SHELF\s*LIFE|USE\s*WITHIN)\s*(?:[:#-])?\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|eighteen|twenty[- ]four)\s*(day|days|month|months|year|years)\s*(?:FROM|AFTER|OF)?\s*(?:MANUFACTURE|MANUFACTURING|MFG|MFD|PACK(?:ED|ING)?(?:\s*ON)?)?/i);
  if (!match) return null;

  let amount = Number(match[1]);
  if (!Number.isFinite(amount)) {
    amount = wordToNum[match[1].toLowerCase()] || null;
  }
  if (!amount) return null;

  const unit = match[2].toLowerCase();
  const date = new Date(`${manufacturingDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;

  if (unit.startsWith("month")) date.setUTCMonth(date.getUTCMonth() + amount);
  else if (unit.startsWith("year")) date.setUTCFullYear(date.getUTCFullYear() + amount);
  else date.setUTCDate(date.getUTCDate() + amount);

  return date.toISOString().slice(0, 10);
}

export function extractDatesFromLabelText(rawText) {
  const text = String(rawText || "").replace(/[|]/g, "/").replace(/\r/g, "");
  const expiryRaw = findDateAfterLabel(text, [
    "EXPIRY\\s*DATE",
    "EXP\\s*DATE",
    "EXP",
    "EXPIRY",
    "USE\\s*BY(?:\\s*DATE)?",
    "USEBY",
    "USE\\s*BEFORE"
  ]);
  const bestRaw = findDateAfterLabel(text, [
    "BEST\\s*BEFORE(?:\\s*DATE)?",
    "BEST[A-Z]{0,4}(?:BEFORE|FORE|EY)",
    "BEST\\s*BY",
    "B\\.?B\\.?E\\.?",
    "BBD"
  ]);
  const manufacturingRaw = findDateAfterLabel(text, [
    "MFG\\s*DATE",
    "MFD\\s*DATE",
    "MFG",
    "MFD",
    "MANUFACTURED(?:\\s*(?:ON|DATE))?",
    "MANUFACTURE(?:\\s*(?:ON|DATE))?",
    "PACKED\\s*ON",
    "PACK(?:ED)?\\s*DATE",
    "PKD(?:\\s*DATE)?"
  ]);
  const expiryDate = normalizeDateString(expiryRaw, { kind: "expiry" });
  const bestBeforeDate = normalizeDateString(bestRaw, { kind: "expiry" });
  const manufacturingDate = normalizeDateString(manufacturingRaw, { kind: "manufacturing" });
  const calculatedExpiryDate = expiryDate || calculateExpiryFromShelfLife(text, manufacturingDate);
  const shelfLifeMatch = text.match(/(?:BEST\s*BEFORE|SHELF\s*LIFE)[^\n]*/i);
  const productLine = text.split("\n").map((line) => line.trim()).find((line) => line && !/FOODCONTAINER LABEL/i.test(line) && !/(EXP|MFG|MFD|BEST|BBD|PACKED|PKD)/i.test(line) && !/\d{2,4}[\/-]\d{1,2}/.test(line));
  return {
    rawText: text,
    productName: productLine || null,
    manufacturingDate,
    expiryDate,
    calculatedExpiryDate,
    bestBeforeDate,
    bestBeforeText: bestRaw || null,
    shelfLifeStatement: shelfLifeMatch?.[0] || null,
    isVerifiedExpiry: Boolean(expiryDate),
    confidence: expiryDate || bestBeforeDate || manufacturingDate ? 0.78 : 0,
    requiresUserConfirmation: true
  };
}

async function runLocalOCR(imageBase64) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const result = await worker.recognize(imageBase64);
    const parsed = extractDatesFromLabelText(result.data?.text || "");
    const master = parsed.productName ? lookupFoodMaster(parsed.productName) : null;
    return {
      success: Boolean(parsed.rawText.trim()),
      ...parsed,
      brand: "",
      category: master?.category || "Packaged Foods",
      quantity: null,
      batchNumber: null,
      ingredients: null,
      allergens: [],
      nutrition: null,
      packagingCondition: "INTACT",
      packagingNotes: null,
      confidenceCategory: parsed.confidence >= 0.7 ? "MEDIUM" : "LOW"
    };
  } finally {
    await worker.terminate();
  }
}

function isSupportedImageInput(image) {
  if (typeof image !== "string" || image.length < 1000) return false;
  if (/^(blob:|https?:\/\/)/i.test(image)) return true;
  const dataUri = image.match(/^data:image\/(jpeg|jpg|png|webp|bmp|gif);base64,([a-z0-9+/=\s]+)$/i);
  if (!dataUri) return false;
  const payload = dataUri[2].replace(/\s/g, "");
  return /^(?:\/9j|iVBORw0KGgo|UklGR|Qk0|R0lGOD)/.test(payload);
}

/**
 * Extracts packaging details and expiry dates from an image using Gemini AI Vision OCR.
 * @param {string} imageBase64 - Base64 encoded image string or URL
 * @param {string} [mode="photo"] - Scan mode ('photo' | 'label' | 'barcode' | 'manual')
 * @param {object} [options={}] - Optional scan context (e.g. { barcode: string })
 * @returns {Promise<object>} Extracted label data
 */
export async function scanFoodLabelOCR(imageBase64, mode = "photo", options = {}) {
  console.log("[OCRService] 🏷️ Processing food label OCR scan...");

  const apiKey = getGeminiApiKey();
  const isValidApiKey = Boolean(apiKey && apiKey.length > 5);

  if (!isValidApiKey) {
    console.warn("[OCRService] GEMINI_AI_API_KEY absent. Running local Tesseract OCR.");
    if (!isSupportedImageInput(imageBase64)) {
      return { success: false, productName: null, manufacturingDate: null, expiryDate: null, bestBeforeDate: null, quantity: null, confidence: 0, confidenceCategory: "LOW", requiresUserConfirmation: true, error: "IMAGE_UNREADABLE" };
    }
    try {
      return await runLocalOCR(imageBase64);
    } catch (error) {
      console.warn("[OCRService] Local OCR unavailable:", error?.message || error);
      return { success: false, productName: null, manufacturingDate: null, expiryDate: null, bestBeforeDate: null, quantity: null, confidence: 0, confidenceCategory: "LOW", requiresUserConfirmation: true, error: "OCR_UNAVAILABLE" };
    }
  }

  try {
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const barcodeNote = options?.barcode ? `\nDecoded Barcode: ${options.barcode}. Use the barcode and package text to identify the product.` : "";
    const prompt = `You are a high-precision Optical Character Recognition (OCR) scanner and food packaging analyst.${barcodeNote}
Extract all visible print text from this food label image and analyze package condition.
Identify:
1. Product Name (exact product title)
2. Brand Name
3. Category (e.g. Dairy, Beverages, Snacks, Grains, Bakery, Vegetables, Fruits, Meat/Poultry, Packaged Foods)
4. Manufacturing Date (MFG / MFD / Packed On date if visible)
5. Expiry Date (EXP / Expiry / Use By date)
6. Best Before date or the complete shelf-life statement
7. Quantity or Net Content (e.g. 500g, 1L, 10 pcs)
8. Batch / Lot Number
9. Ingredient list (if visible)
10. Allergens detected in text (list of strings, e.g. ["Milk", "Gluten"])
11. Nutrition per 100g/serving if printed (calories, protein, carbs, fat, fiber)
12. Packaging Condition: "INTACT" | "DAMAGED" | "BLOATED" | "LEAKING" | "TORN"
13. Packaging Visual Notes: Concise description of package appearance & seal integrity.
14. OCR Confidence (between 0.0 and 1.0)

CRITICAL INSTRUCTIONS:
- DO NOT confuse Manufacturing Date with Expiry Date or Best Before Date.
- Return dates strictly in DD/MM/YYYY or YYYY-MM-DD string format if detected, or null if not found.
- Never turn a shelf-life statement into a printed expiry date. Preserve the statement exactly so the application can calculate a provisional date from MFG.
- If there is no text or label on the image, set productName to null.
- If packaging is damaged, punctured, or bloated, reflect that in packagingCondition.

Respond ONLY in valid JSON format:
{
  "productName": "string or null",
  "brand": "string or null",
  "category": "string or null",
  "manufacturingDate": "string or null",
  "expiryDate": "string or null",
  "bestBeforeDate": "string or null",
  "bestBeforeText": "string or null",
  "shelfLifeStatement": "string or null",
  "calculatedExpiryDate": "string or null",
  "quantity": "string or null",
  "batchNumber": "string or null",
  "ingredients": "string or null",
  "allergens": ["string"],
  "nutrition": {
    "calories": number or null,
    "protein": number or null,
    "carbs": number or null,
    "fat": number or null,
    "fiber": number or null
  },
  "packagingCondition": "INTACT" | "DAMAGED" | "BLOATED" | "LEAKING" | "TORN",
  "packagingNotes": "string or null",
  "confidence": number,
  "confidenceCategory": "HIGH" | "MEDIUM" | "LOW"
}`;

    const model = import.meta.env?.VITE_GEMINI_MODEL || "gemini-flash-lite-latest";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 10000) : null;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller?.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: base64Data
                }
              }
            ]
          }
        ],
        generationConfig: {
          response_mime_type: "application/json"
        }
      })
    });
    if (timeoutId) clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Gemini OCR API error HTTP ${response.status}`);
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) throw new Error("Empty OCR text response from Gemini API");

    const parsed = JSON.parse(candidateText);

    // Flexible key extraction (supports camelCase, snake_case, and common alternates)
    const rawProductName = parsed.productName || parsed.product_name || parsed.name || parsed.title || null;
    const rawBrand = parsed.brand || parsed.brandName || parsed.brand_name || parsed.manufacturer || "";
    const rawCategory = parsed.category || parsed.product_category || "Packaged Foods";
    const rawMfg = parsed.manufacturingDate || parsed.manufacturing_date || parsed.mfgDate || parsed.mfg_date || parsed.mfd || parsed.packedDate || parsed.packed_on || null;
    const rawExpiry = parsed.expiryDate || parsed.expiry_date || parsed.expirationDate || parsed.exp_date || parsed.useByDate || parsed.use_by || null;
    const rawBest = parsed.bestBeforeDate || parsed.best_before_date || parsed.bestBefore || parsed.best_before || parsed.bbd || null;
    const rawCalculated = parsed.calculatedExpiryDate || parsed.calculated_expiry_date || null;
    const rawQty = parsed.quantity || parsed.netQuantity || parsed.net_quantity || parsed.netWeight || parsed.net_weight || parsed.weight || null;
    const rawBatch = parsed.batchNumber || parsed.batch_number || parsed.lotNumber || parsed.lot_number || null;
    const rawIngredients = parsed.ingredients || parsed.ingredient_list || null;
    const rawAllergens = Array.isArray(parsed.allergens) ? parsed.allergens : (Array.isArray(parsed.allergen_list) ? parsed.allergen_list : []);
    const rawNutrition = parsed.nutrition || parsed.macros || parsed.nutritional_information || null;
    const rawPackagingCondition = parsed.packagingCondition || parsed.packaging_condition || "INTACT";
    const rawPackagingNotes = parsed.packagingNotes || parsed.packaging_notes || parsed.visual_notes || null;
    const shelfLifeText = parsed.shelfLifeStatement || parsed.shelf_life_statement || parsed.bestBeforeText || parsed.best_before_text || "";

    // Normalize dates
    const normalizedExpiry = normalizeDateString(rawExpiry, { kind: "expiry" });
    const normalizedMfg = normalizeDateString(rawMfg, { kind: "manufacturing" });
    const normalizedBest = normalizeDateString(rawBest, { kind: "expiry" });
    const normalizedCalculated = normalizeDateString(rawCalculated, { kind: "expiry" }) || calculateExpiryFromShelfLife(shelfLifeText, normalizedMfg);

    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence !== undefined ? parsed.confidence : 0.5) || 0));

    // Run local OCR cross-check if supported
    let localDates = null;
    try {
      if (isSupportedImageInput(imageBase64)) {
        const local = await runLocalOCR(imageBase64);
        localDates = {
          expiryDate: local.expiryDate,
          bestBeforeDate: local.bestBeforeDate,
          manufacturingDate: local.manufacturingDate,
          calculatedExpiryDate: local.calculatedExpiryDate
        };
      }
    } catch (localError) {
      console.warn("[OCRService] Local OCR cross-check unavailable:", localError?.message || localError);
    }

    // Resilient date resolution: keep Gemini's date when detected; do not drop to null if local OCR missed it
    const resolveDate = (geminiVal, localVal) => {
      if (geminiVal && localVal) {
        return { value: geminiVal, verified: geminiVal === localVal };
      }
      if (geminiVal) {
        return { value: geminiVal, verified: false };
      }
      if (localVal) {
        return { value: localVal, verified: false };
      }
      return { value: null, verified: false };
    };

    const expResolved = resolveDate(normalizedExpiry, localDates?.expiryDate);
    const bestResolved = resolveDate(normalizedBest, localDates?.bestBeforeDate);
    const mfgResolved = resolveDate(normalizedMfg, localDates?.manufacturingDate);
    const calcResolved = resolveDate(normalizedCalculated, localDates?.calculatedExpiryDate);

    const finalExpiry = expResolved.value;
    const finalBest = bestResolved.value;
    const finalMfg = mfgResolved.value;
    const finalCalculated = calcResolved.value;
    // Effective expiry: if explicit EXP was not printed, fall back to best-before date or calculated shelf-life date
    const effectiveExpiry = finalExpiry || finalBest || finalCalculated || null;
    const isVerifiedExpiry = Boolean(expResolved.verified || (finalExpiry && expResolved.value));

    // Enrich Category, Nutrition, and Allergens
    let finalCategory = (rawCategory || "").trim();
    let finalAllergens = rawAllergens.filter(Boolean).map(String);
    let finalNutrition = rawNutrition && typeof rawNutrition === "object" ? Object.fromEntries(
      ["calories", "protein", "carbs", "fat", "fiber"].map((k) => [k, Number.isFinite(Number(rawNutrition[k])) ? Number(rawNutrition[k]) : null])
    ) : null;

    if (rawProductName) {
      const master = lookupFoodMaster(rawProductName, finalCategory);
      if (!finalCategory || finalCategory === "Other") {
        finalCategory = master.category || "Packaged Foods";
      }
    }

    return {
      success: Boolean(rawProductName || effectiveExpiry || finalMfg),
      productName: rawProductName,
      brand: rawBrand,
      category: finalCategory || "Packaged Foods",
      manufacturingDate: finalMfg,
      expiryDate: effectiveExpiry,
      bestBeforeDate: finalBest,
      calculatedExpiryDate: finalCalculated,
      bestBeforeText: parsed.bestBeforeText || parsed.best_before_text || null,
      shelfLifeStatement: shelfLifeText || null,
      isVerifiedExpiry,
      quantity: rawQty,
      batchNumber: rawBatch,
      ingredients: rawIngredients,
      allergens: finalAllergens,
      nutrition: finalNutrition,
      packagingCondition: rawPackagingCondition,
      packagingNotes: rawPackagingNotes,
      confidence,
      confidenceCategory: confidence >= 0.9 ? "HIGH" : confidence >= 0.7 ? "MEDIUM" : "LOW",
      requiresUserConfirmation: true
    };
  } catch (err) {
    console.warn("[OCRService] Gemini OCR failed; running local Tesseract OCR:", err.message);
    try {
      return await runLocalOCR(imageBase64);
    } catch (localError) {
      return { success: false, productName: null, manufacturingDate: null, expiryDate: null, bestBeforeDate: null, quantity: null, confidence: 0, confidenceCategory: "LOW", requiresUserConfirmation: true, error: localError.message };
    }
  }
}
