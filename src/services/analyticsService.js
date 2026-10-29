// Food Waste Analytics & Dashboard Statistics Engine
// Computes live inventory metrics: freshness distribution, food waste prevented, money saved, carbon impact, and pantry utilization.

import { parseQuantityInGrams } from "./analyticsCalculations";

const AVERAGE_ITEM_COST_INR = 70; // Configurable average cost per item in ₹
const CO2_PER_KG_FOOD_WASTE = 2.5; // CO2 emission factor per kg food waste avoided (2.5 kg CO2/kg)

const CATEGORY_PRICES = {
  Vegetables: 45,
  Fruits: 80,
  Dairy: 65,
  Pantry: 110,
  Grains: 90,
  Meat: 240,
  Fish: 220,
  Other: 70
};

/**
 * Calculates analytics based on live pantry inventory, consumed/wasted states, and history logs.
 * 
 * @param {Array<object>} items - Pantry items list (active, consumed, discarded)
 * @param {Array<object>} [history=[]] - Historical scan & action records
 * @returns {object} Real-time dashboard and waste analytics metrics
 */
export function calculateAnalytics(items = [], history = []) {
  const activeItems = items.filter(i => (i.status === "active" || !i.status));
  const consumedItems = items.filter(i => i.status === "consumed");
  const discardedItems = items.filter(i => i.status === "discarded");

  const totalActive = activeItems.length;
  let fresh = 0;
  let good = 0;
  let soon = 0;
  let expired = 0;
  let highRisk = 0;

  const expiringList = [];

  activeItems.forEach(item => {
    const days = typeof item.expiresInDays === "number" ? item.expiresInDays : item.daysRemaining ?? 3;
    const score = item.freshnessScore ?? item.freshness ?? 85;

    if (days < 0 || item.spoilageStatus === "SPOILED" || item.hasCriticalSpoilage) {
      expired++;
    } else if (days <= 3 || item.spoilageStatus === "USE_SOON") {
      soon++;
      expiringList.push(item);
    } else if (score >= 80) {
      fresh++;
    } else {
      good++;
    }

    if (item.spoilageRisk === "high" || score < 60 || item.hasCriticalSpoilage) {
      highRisk++;
    }
  });

  // Calculate consumed items near expiry
  // Historical actions can also count if present in history log
  const consumedFromHistory = history.filter(h => h.action === "Consumed" || h.action === "Rescued");
  const allConsumedCount = consumedItems.length + consumedFromHistory.length;

  let wastePreventedKg = 0;
  let moneySavedINR = 0;

  consumedItems.forEach(item => {
    const weightKg = parseQuantityInGrams(item.quantity, item.category, item.name) / 1000;
    wastePreventedKg += weightKg;
    const price = CATEGORY_PRICES[item.category] || AVERAGE_ITEM_COST_INR;
    moneySavedINR += price;
  });

  consumedFromHistory.forEach(h => {
    const weightKg = parseQuantityInGrams("250g", "Other", h.name) / 1000;
    wastePreventedKg += weightKg;
    moneySavedINR += AVERAGE_ITEM_COST_INR;
  });

  wastePreventedKg = parseFloat(wastePreventedKg.toFixed(1));
  moneySavedINR = Math.round(moneySavedINR);

  // Carbon Impact (kg CO2) = estimated emissions factor * saved weight
  const co2AvoidedKg = parseFloat((wastePreventedKg * CO2_PER_KG_FOOD_WASTE).toFixed(1));

  // Pantry Health & Utilization: If items are fresh and 0 are wasted, pantry health is 100% Fresh / In Good Standing.
  // Only penalize utilization when items actually spoil or are discarded.
  const wastedCount = expired + discardedItems.length;
  const totalTracked = totalActive + consumedItems.length + discardedItems.length + consumedFromHistory.length;
  const utilizationPercent = totalTracked > 0
    ? Math.max(0, Math.min(100, Math.round(((totalTracked - wastedCount) / totalTracked) * 100)))
    : 100;

  return {
    totalItems: totalActive,
    totalTracked,
    freshCount: fresh,
    goodCount: good,
    expiringSoonCount: soon,
    expiredCount: expired,
    highRiskCount: highRisk,
    foodSavedCount: allConsumedCount,
    moneySavedINR,
    wastePreventedKg,
    co2AvoidedKg,
    pantryUtilizationPercent: utilizationPercent,
    wasteReductionPercent: utilizationPercent,
    expiringList: expiringList.sort((a, b) => (a.expiresInDays ?? 0) - (b.expiresInDays ?? 0)),
    assumptions: {
      avgItemCost: `₹${AVERAGE_ITEM_COST_INR}`,
      co2Factor: `${CO2_PER_KG_FOOD_WASTE} kg CO2/kg`
    }
  };
}
