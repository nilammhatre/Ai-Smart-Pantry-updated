// Shelf-Life Calculation Engine for Smart Pantry items
import { lookupFoodMaster } from "./foodMasterDb.js";

/**
 * Normalizes user storage conditions to standard keys ('fridge' | 'ambient' | 'freezer').
 * Handles 'refrigerator', 'counter', 'pantry shelf', etc.
 * 
 * @param {string} storageCondition 
 * @returns {'fridge' | 'ambient' | 'freezer'}
 */
export function normalizeStorageCondition(storageCondition = "") {
  const clean = String(storageCondition || "").toLowerCase().trim();
  if (clean.includes("freez") || clean.includes("frozen")) {
    return "freezer";
  }
  if (clean.includes("refrig") || clean.includes("fridge") || clean.includes("chilled") || clean.includes("cooler") || clean.includes("crisper")) {
    return "fridge";
  }
  // Counter, Ambient, Pantry, Shelf, Room temp
  return "ambient";
}

/**
 * Calculates contextual storage multipliers based on biological food properties and storage location.
 * E.g., Leafy greens/spinach at Counter has 60% shelf life reduction compared to Refrigerator.
 * 
 * @param {string} name 
 * @param {string} category 
 * @param {string} storageCondition 
 * @param {object} [master]
 * @returns {{ hasSpecificRule: boolean, multiplier: number, storageNote: string }}
 */
export function getContextualStorageMultiplier(name = "", category = "", storageCondition = "fridge", master = null) {
  const normStorage = normalizeStorageCondition(storageCondition);
  const nameLower = String(name || master?.name || "").toLowerCase();
  const catLower = String(category || master?.category || "").toLowerCase();

  const isLeafyGreens = /spinach|palak|lettuce|coriander|mint|pudina|methi|greens|leafy|kale|salad|herbs/i.test(nameLower);
  const isDairy = catLower.includes("dairy") || /milk|doodh|paneer|curd|dahi|yogurt|cream|cheese/i.test(nameLower);
  const isMeatPoultry = catLower.includes("meat") || /chicken|poultry|meat|fish|mutton|prawn/i.test(nameLower);
  const isBerriesOrSoftFruit = /strawberr|blueberr|raspberr|blackberr|cherri|grape|cut fruit|melon/i.test(nameLower);
  const isCruciferousOrVeg = catLower.includes("veg") && !/potato|onion|garlic|tomato/i.test(nameLower);
  const isAmbientPreferredProduce = /banana|potato|onion|garlic|tomato/i.test(nameLower);
  const isBread = /bread|loaf|bun|pav/i.test(nameLower);

  // 1. Counter / Ambient storage:
  if (normStorage === "ambient") {
    if (isLeafyGreens) {
      // Rule: Leafy Greens/Spinach at Counter reduce baseline shelf life by 60% compared to Refrigerator
      return {
        hasSpecificRule: true,
        multiplier: 0.40, // 60% reduction vs fridge
        storageNote: "Leafy greens rapidly transpire and wilt at room temperature (-60% shelf life vs refrigerator)."
      };
    }
    if (isDairy) {
      return {
        hasSpecificRule: true,
        multiplier: 0.15,
        storageNote: "Dairy rapidly sours and culture separates at room temperature; refrigeration strongly advised."
      };
    }
    if (isMeatPoultry) {
      return {
        hasSpecificRule: true,
        multiplier: 0.10,
        storageNote: "Meat/poultry spoils rapidly at ambient temperature; store in refrigerator or freezer."
      };
    }
    if (isBerriesOrSoftFruit) {
      return {
        hasSpecificRule: true,
        multiplier: 0.45,
        storageNote: "Soft berries decay and mold quickly at room temperature (-55% shelf life vs refrigerator)."
      };
    }
    if (isCruciferousOrVeg) {
      return {
        hasSpecificRule: true,
        multiplier: 0.50,
        storageNote: "Vegetables lose moisture and crispness rapidly on the counter (-50% shelf life vs refrigerator)."
      };
    }
    if (isAmbientPreferredProduce || isBread) {
      return {
        hasSpecificRule: false,
        multiplier: 1.0,
        storageNote: "Optimal ambient storage condition."
      };
    }
    return {
      hasSpecificRule: false,
      multiplier: 0.60,
      storageNote: "Ambient counter storage shortens freshness compared to refrigeration."
    };
  }

  // 2. Refrigerator storage:
  if (normStorage === "fridge") {
    if (/banana/i.test(nameLower)) {
      return {
        hasSpecificRule: true,
        multiplier: 0.85,
        storageNote: "Refrigeration causes peel chilling injury (blackening), though pulp remains edible."
      };
    }
    if (isBread) {
      return {
        hasSpecificRule: true,
        multiplier: 0.70,
        storageNote: "Refrigeration accelerates starch retrogradation (staling); freeze unused slices instead."
      };
    }
    return {
      hasSpecificRule: false,
      multiplier: 1.0,
      storageNote: "Standard refrigerated preservation."
    };
  }

  // 3. Freezer storage:
  if (normStorage === "freezer") {
    if (/egg/i.test(nameLower)) {
      return {
        hasSpecificRule: true,
        multiplier: 0.1,
        storageNote: "Whole eggs in shells cannot be frozen (shells crack)."
      };
    }
    return {
      hasSpecificRule: false,
      multiplier: 1.0,
      storageNote: "Frozen storage halts microbial activity for extended preservation."
    };
  }

  return { hasSpecificRule: false, multiplier: 1.0, storageNote: "" };
}

/**
 * Calculates detailed shelf life, consume-by date, remaining days, freshness status, and spoilage risk.
 * Factors in contextual storage multipliers (Counter vs Refrigerator vs Freezer).
 * 
 * @param {object} params
 * @param {string} params.name - Food item name
 * @param {string} params.category - Category (Vegetables, Fruits, Dairy, etc.)
 * @param {string|Date} [params.receivedAt] - Delivery/received date timestamp
 * @param {string} [params.storageCondition] - 'fridge' | 'ambient' | 'counter' | 'freezer'
 * @param {number} [params.freshnessScore] - Freshness score 0 - 100 (default 100)
 * @param {string} [params.spoilageRisk] - Optional manual override ('low' | 'medium' | 'high')
 * @returns {object} Comprehensive shelf-life result
 */
export function calculateShelfLife({
  name = "",
  category = "Other",
  receivedAt = null,
  storageCondition = "fridge",
  freshnessScore = 100,
  spoilageRisk = null
}) {
  const master = lookupFoodMaster(name, category);

  // 1. Determine start timestamp
  const startDate = receivedAt ? new Date(receivedAt) : new Date();
  if (isNaN(startDate.getTime())) {
    console.warn(`[ShelfLifeEngine] Invalid receivedAt timestamp "${receivedAt}". Defaulting to now.`);
  }
  const startTimestamp = !isNaN(startDate.getTime()) ? startDate : new Date();

  // 2. Normalize storage condition and compute contextual multiplier
  const normStorage = normalizeStorageCondition(storageCondition);
  const contextual = getContextualStorageMultiplier(name, category, normStorage, master);

  // 3. Determine baseline shelf life in days
  let baseDays;
  if (normStorage === "freezer") {
    baseDays = master.baseShelfLifeDays.freezer || (master.baseShelfLifeDays.fridge ? master.baseShelfLifeDays.fridge * 6 : 60);
  } else if (normStorage === "ambient") {
    // If specific contextual rule applies (e.g. Leafy Greens at Counter reduce baseline shelf life by 60% compared to Refrigerator)
    if (contextual.hasSpecificRule) {
      const fridgeBase = master.baseShelfLifeDays.fridge || master.baseShelfLifeDays.ambient || 6;
      baseDays = Math.max(0.5, parseFloat((fridgeBase * contextual.multiplier).toFixed(1)));
    } else if (master.baseShelfLifeDays.ambient !== undefined) {
      baseDays = master.baseShelfLifeDays.ambient;
    } else {
      const fridgeBase = master.baseShelfLifeDays.fridge || 7;
      baseDays = Math.max(0.5, parseFloat((fridgeBase * contextual.multiplier).toFixed(1)));
    }
  } else {
    // fridge
    if (contextual.hasSpecificRule && contextual.multiplier !== 1.0) {
      const ambientBase = master.baseShelfLifeDays.ambient || master.baseShelfLifeDays.fridge || 5;
      baseDays = Math.max(0.5, parseFloat((ambientBase * contextual.multiplier).toFixed(1)));
    } else {
      baseDays = master.baseShelfLifeDays.fridge || master.baseShelfLifeDays.ambient || 7;
    }
  }

  // 4. Adjust shelf life based on freshness score multiplier (score 100 = 1.0x, score 50 = 0.5x, etc.)
  const normalizedScore = Math.max(0, Math.min(100, Number(freshnessScore) || 100));
  const scoreMultiplier = normalizedScore / 100;
  
  const totalShelfLifeDays = Math.max(0.5, parseFloat((baseDays * scoreMultiplier).toFixed(1)));

  // 5. Calculate exact "Consume By" date
  const consumeByMs = startTimestamp.getTime() + totalShelfLifeDays * 24 * 60 * 60 * 1000;
  const consumeByDateObj = new Date(consumeByMs);
  const consumeByDateStr = consumeByDateObj.toISOString().split("T")[0];

  // 6. Calculate remaining days relative to TODAY
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const targetDate = new Date(consumeByDateStr);
  targetDate.setHours(0, 0, 0, 0);

  const diffMs = targetDate.getTime() - today.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  // 7. Determine freshness status badge
  let status = "fresh";
  if (daysRemaining <= 0) {
    status = "expired";
  } else if (daysRemaining <= 3) {
    status = "soon";
  }

  // 8. Spoilage risk rating
  const finalSpoilageRisk = spoilageRisk || master.spoilageRisk || "medium";

  return {
    name: name || master.name,
    category: master.category || category,
    receivedAt: startTimestamp.toISOString(),
    storageCondition: normStorage,
    freshnessScore: normalizedScore,
    baseShelfLifeDays: baseDays,
    estimatedShelfLifeDays: totalShelfLifeDays,
    storageMultiplier: contextual.multiplier,
    storageImpact: contextual.storageNote,
    consumeByDate: consumeByDateStr,
    daysRemaining,
    status,
    spoilageRisk: finalSpoilageRisk,
    storageRecommendation: contextual.storageNote ? `${master.storageAdvice} ${contextual.storageNote}` : master.storageAdvice,
    spoilageIndicators: master.spoilageIndicators,
    masterName: master.name
  };
}

