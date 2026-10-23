// Food Waste Analytics & Dashboard Statistics Engine
// Calculates real-time pantry metrics: item counts, freshness distribution, food rescued, money saved, and waste prevented.

const AVERAGE_ITEM_COST_INR = 70; // Configurable average cost per item in ₹
const AVERAGE_ITEM_WEIGHT_KG = 0.35; // Configurable average weight per item in kg
const CO2_PER_KG_FOOD_WASTE = 2.3; // CO2 emission factor per kg food waste avoided

/**
 * Calculates analytics based on current pantry items and history records.
 * 
 * @param {Array<object>} items - Active pantry items list
 * @param {Array<object>} [history=[]] - Historical scan & action records
 * @returns {object} Real-time dashboard and waste analytics metrics
 */
export function calculateAnalytics(items = [], history = []) {
  const total = items.length;
  let fresh = 0;
  let good = 0;
  let soon = 0;
  let expired = 0;
  let highRisk = 0;

  const expiringList = [];

  items.forEach(item => {
    const days = typeof item.expiresInDays === "number" ? item.expiresInDays : item.daysRemaining ?? 3;
    const score = item.freshnessScore ?? item.freshness ?? 85;

    if (days < 0 || item.status === "expired") {
      expired++;
    } else if (days <= 3 || item.status === "soon") {
      soon++;
      expiringList.push(item);
    } else if (score >= 80) {
      fresh++;
    } else {
      good++;
    }

    if (item.spoilageRisk === "high" || score < 60) {
      highRisk++;
    }
  });

  // Calculate rescued vs wasted items from history
  const rescuedFromHistory = history.filter(h => h.action === "Added to pantry" || h.action === "Rescued").length;
  const foodSavedCount = Math.max(total - expired, rescuedFromHistory || total);

  // Financial & environmental impact calculations
  const moneySavedINR = Math.round(foodSavedCount * AVERAGE_ITEM_COST_INR);
  const wastePreventedKg = parseFloat((foodSavedCount * AVERAGE_ITEM_WEIGHT_KG).toFixed(1));
  const co2AvoidedKg = parseFloat((wastePreventedKg * CO2_PER_KG_FOOD_WASTE).toFixed(1));
  const wasteReductionPercent = Math.min(100, Math.round(((total - expired) / Math.max(total, 1)) * 100));

  return {
    totalItems: total,
    freshCount: fresh,
    goodCount: good,
    expiringSoonCount: soon,
    expiredCount: expired,
    highRiskCount: highRisk,
    foodSavedCount,
    moneySavedINR,
    wastePreventedKg,
    co2AvoidedKg,
    wasteReductionPercent,
    expiringList: expiringList.sort((a, b) => (a.expiresInDays ?? 0) - (b.expiresInDays ?? 0)),
    assumptions: {
      avgItemCost: `₹${AVERAGE_ITEM_COST_INR}`,
      avgItemWeight: `${AVERAGE_ITEM_WEIGHT_KG} kg`,
      co2Factor: `${CO2_PER_KG_FOOD_WASTE} kg CO2/kg`
    }
  };
}
