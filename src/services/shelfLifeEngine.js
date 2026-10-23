// Shelf-Life Calculation Engine for Smart Pantry items
import { lookupFoodMaster } from "./foodMasterDb.js";

/**
 * Calculates detailed shelf life, consume-by date, remaining days, freshness status, and spoilage risk.
 * 
 * @param {object} params
 * @param {string} params.name - Food item name
 * @param {string} params.category - Category (Vegetables, Fruits, Dairy, etc.)
 * @param {string|Date} [params.receivedAt] - Delivery/received date timestamp
 * @param {string} [params.storageCondition] - 'fridge' | 'ambient' | 'freezer'
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

  // 2. Determine baseline shelf life in days for chosen storage method
  const storageKey = (storageCondition || "fridge").toLowerCase();
  let baseDays = master.baseShelfLifeDays[storageKey];
  
  if (baseDays === undefined) {
    baseDays = master.baseShelfLifeDays.fridge || 7;
  }

  // 3. Adjust shelf life based on freshness score multiplier (score 100 = 1.0x, score 50 = 0.5x, etc.)
  const normalizedScore = Math.max(0, Math.min(100, Number(freshnessScore) || 100));
  const scoreMultiplier = normalizedScore / 100;
  
  const totalShelfLifeDays = Math.max(0.5, parseFloat((baseDays * scoreMultiplier).toFixed(1)));

  // 4. Calculate exact "Consume By" date
  const consumeByMs = startTimestamp.getTime() + totalShelfLifeDays * 24 * 60 * 60 * 1000;
  const consumeByDateObj = new Date(consumeByMs);
  const consumeByDateStr = consumeByDateObj.toISOString().split("T")[0];

  // 5. Calculate remaining days relative to TODAY
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const targetDate = new Date(consumeByDateStr);
  targetDate.setHours(0, 0, 0, 0);

  const diffMs = targetDate.getTime() - today.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  // 6. Determine freshness status badge
  let status = "fresh";
  if (daysRemaining <= 0) {
    status = "expired";
  } else if (daysRemaining <= 3) {
    status = "soon";
  }

  // 7. Spoilage risk rating
  const finalSpoilageRisk = spoilageRisk || master.spoilageRisk || "medium";

  return {
    name: name || master.name,
    category: master.category || category,
    receivedAt: startTimestamp.toISOString(),
    storageCondition: storageKey,
    freshnessScore: normalizedScore,
    baseShelfLifeDays: baseDays,
    estimatedShelfLifeDays: totalShelfLifeDays,
    consumeByDate: consumeByDateStr,
    daysRemaining,
    status,
    spoilageRisk: finalSpoilageRisk,
    storageRecommendation: master.storageAdvice,
    spoilageIndicators: master.spoilageIndicators,
    masterName: master.name
  };
}
