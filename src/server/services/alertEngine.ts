import type { FoodItemRecord, AlertRecord, UserSettingsRecord } from "../db/repository";
import { PantryRepository, getPantryRepository } from "../db/repository";

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export function isShortShelfLifeFood(food: FoodItemRecord): boolean {
  const dueDate = calculateItemDueDate(food);
  if (!dueDate) return false;
  const pDateStr = food.purchase_date || new Date().toISOString().split("T")[0];
  const pDate = new Date(pDateStr + "T00:00:00").getTime();
  const cDate = new Date(dueDate + "T00:00:00").getTime();
  const totalDays = Math.round((cDate - pDate) / (1000 * 60 * 60 * 24));
  return totalDays <= 2;
}

export interface GeneratedAlerts {
  alerts: AlertRecord[];
  criticalSpoilageTriggered: boolean;
}

export function generateAlertsForFood(
  food: FoodItemRecord,
  userSettings?: UserSettingsRecord,
  todayStr: string = new Date().toISOString().split("T")[0]
): GeneratedAlerts {
  const alerts: AlertRecord[] = [];
  const now = new Date().toISOString();
  const isShortLife = isShortShelfLifeFood(food);
  let criticalSpoilageTriggered = false;

  // 1. CRITICAL SPOILAGE RULE (Independent of expiry reminders)
  // Confidently detected severe mold, rot, or spoilage triggers immediate critical alert
  const hasSpoilage = Boolean(
    food.has_critical_spoilage || 
    food.spoilage_status === "SPOILED" ||
    (Array.isArray(food.spoilage_indicators) && food.spoilage_indicators.some(i => 
      i.toLowerCase().includes("mold") || 
      i.toLowerCase().includes("rot") || 
      i.toLowerCase().includes("decay") ||
      i.toLowerCase().includes("solanine")
    )) ||
    (food.scan_metadata && Array.isArray(food.scan_metadata.visibleIssues) && food.scan_metadata.visibleIssues.some((i: string) =>
      i.toLowerCase().includes("mold") || i.toLowerCase().includes("rot")
    ))
  );

  if (hasSpoilage) {
    criticalSpoilageTriggered = true;
    alerts.push({
      id: `alert_${food.id}_CRITICAL_SPOILAGE`,
      food_id: food.id,
      user_id: food.user_id || "default_user",
      rule_type: "CRITICAL_SPOILAGE",
      alert_type: "CRITICAL_SPOILAGE",
      trigger_date: todayStr, // Trigger immediately
      priority: "CRITICAL",
      status: "PENDING",
      title: `🚨 CRITICAL SAFETY ALERT: ${food.name} is Spoiled!`,
      message: `⚠️ CRITICAL SPOILAGE: Severe mold, rot, or decomposition detected on ${food.name}. Do NOT consume. Discard immediately to prevent bacterial contamination in your pantry.`,
      action_url: `/app/pantry/${food.id}`,
      created_at: now
    });
  }

  // If item has critical spoilage, we do not need standard expiry reminders
  if (food.spoilage_status === "SPOILED" || food.has_critical_spoilage) {
    return { alerts, criticalSpoilageTriggered };
  }

  const consumeBy = calculateItemDueDate(food);
  if (!consumeBy) return { alerts, criticalSpoilageTriggered };
  const verifiedBadge = food.is_verified_expiry ? "Verified Expiry" : "AI-Estimated";

  // Calculate days remaining from todayStr
  const todayTime = new Date(todayStr + "T00:00:00").getTime();
  const expTime = new Date(consumeBy + "T00:00:00").getTime();
  const daysDiff = Math.round((expTime - todayTime) / 864e5);

  // 2. 3 DAYS BEFORE DUE DATE RULE (Only if not short shelf life and > 2 days away)
  if (!isShortLife && daysDiff > 2) {
    if (!userSettings || userSettings.remind_3_days_before) {
      const trigger3Days = addDays(consumeBy, -3);
      alerts.push({
        id: `alert_${food.id}_3_DAYS_BEFORE_${consumeBy.replace(/-/g, "")}`,
        food_id: food.id,
        user_id: food.user_id || "default_user",
        rule_type: "3_DAYS_BEFORE",
        alert_type: "EXPIRING_3_DAYS",
        trigger_date: trigger3Days,
        priority: "MEDIUM",
        status: "PENDING",
        title: `🟡 Expiring in 3 Days: ${food.name}`,
        message: `${food.name} is scheduled to expire on ${consumeBy} (${verifiedBadge}). Best consumed within the next 3 days.`,
        action_url: `/app/pantry/${food.id}`,
        created_at: now
      });
    }
  }

  // 3. 1 DAY BEFORE DUE DATE RULE
  if (!userSettings || userSettings.remind_1_day_before) {
    const trigger1Day = addDays(consumeBy, -1);
    alerts.push({
      id: `alert_${food.id}_1_DAY_BEFORE_${consumeBy.replace(/-/g, "")}`,
      food_id: food.id,
      user_id: food.user_id || "default_user",
      rule_type: "1_DAY_BEFORE",
      alert_type: "EXPIRING_1_DAY",
      trigger_date: trigger1Day,
      priority: "HIGH",
      status: "PENDING",
      title: `🟠 Expiring Tomorrow: ${food.name}`,
      message: `Heads up! ${food.name} expires tomorrow (${consumeBy}, ${verifiedBadge}). Use in today's or tomorrow's meal to prevent waste.`,
      action_url: `/app/pantry/${food.id}`,
      created_at: now
    });
  }

  // 4. ON DUE DATE RULE
  if (!userSettings || userSettings.remind_on_due_date) {
    alerts.push({
      id: `alert_${food.id}_ON_DUE_DATE_${consumeBy.replace(/-/g, "")}`,
      food_id: food.id,
      user_id: food.user_id || "default_user",
      rule_type: "ON_DUE_DATE",
      alert_type: "DUE_TODAY",
      trigger_date: consumeBy,
      priority: "HIGH",
      status: "PENDING",
      title: `🔴 Consume Today: ${food.name}`,
      message: `${food.name} reaches its consume-by date today (${consumeBy}, ${verifiedBadge}). Check freshness before preparing.`,
      action_url: `/app/pantry/${food.id}`,
      created_at: now
    });
  }

  // 5. OVERDUE RULE
  if (!userSettings || userSettings.remind_overdue) {
    const triggerOverdue = addDays(consumeBy, 1);
    alerts.push({
      id: `alert_${food.id}_OVERDUE_${consumeBy.replace(/-/g, "")}`,
      food_id: food.id,
      user_id: food.user_id || "default_user",
      rule_type: "OVERDUE",
      alert_type: "OVERDUE",
      trigger_date: triggerOverdue,
      priority: "CRITICAL",
      status: "PENDING",
      title: `⚠️ Overdue Food: ${food.name}`,
      message: `${food.name} passed its consume-by date yesterday (${consumeBy}). Inspect carefully for odor or mold before use, or discard safely.`,
      action_url: `/app/pantry/${food.id}`,
      created_at: now
    });
  }

  return { alerts, criticalSpoilageTriggered };
}

export class AlertEngineService {
  private repo: PantryRepository;

  constructor(repo?: PantryRepository) {
    this.repo = repo || getPantryRepository();
  }

  /**
   * Synchronizes all alerts for a food item (creates or updates).
   */
  syncAlertsForFood(foodId: string, todayStr?: string): GeneratedAlerts {
    const food = this.repo.getFoodItemById(foodId);
    if (!food) throw new Error(`Food item ${foodId} not found`);

    const userSettings = this.repo.getUserSettings(food.user_id || "default_user");
    const { alerts, criticalSpoilageTriggered } = generateAlertsForFood(food, userSettings, todayStr);

    // Cancel existing pending alerts to avoid stale dates
    this.repo.cancelPendingAlertsForFood(foodId);

    // Insert new generated alerts
    for (const a of alerts) {
      this.repo.insertAlert(a);
    }

    return { alerts, criticalSpoilageTriggered };
  }

  /**
   * Cancels all alerts for food upon deletion or consumption.
   */
  cancelAlertsForFood(foodId: string): number {
    return this.repo.cancelPendingAlertsForFood(foodId);
  }

  /**
   * Computes the "Next Alert Date" for a food item.
   */
  getNextAlertDate(foodId: string, todayStr: string = new Date().toISOString().split("T")[0]): string | null {
    const alerts = this.repo.getAlertsByFoodId(foodId);
    const pendingFuture = alerts.filter(a => a.status === "PENDING" && a.trigger_date >= todayStr);
    if (pendingFuture.length > 0) {
      return pendingFuture[0].trigger_date;
    }
    const anyPending = alerts.filter(a => a.status === "PENDING");
    if (anyPending.length > 0) {
      return anyPending[0].trigger_date;
    }
    return null;
  }
}

export function calculateItemDueDate(item: FoodItemRecord): string | null {
  if (item.is_verified_expiry && item.printed_expiry_date) {
    return item.printed_expiry_date;
  }
  return item.estimated_consume_by_date || item.consume_by_date || null;
}

export function generateAlertsForFoodItem(food: FoodItemRecord, repo?: PantryRepository): AlertRecord[] {
  const r = repo || getPantryRepository();
  const engine = new AlertEngineService(r);
  const { alerts } = engine.syncAlertsForFood(food.id);
  return alerts;
}

export function recalculateAlertsForFoodItem(food: FoodItemRecord, repo?: PantryRepository): AlertRecord[] {
  const r = repo || getPantryRepository();
  const engine = new AlertEngineService(r);
  const { alerts } = engine.syncAlertsForFood(food.id);
  return alerts;
}

export function cancelAlertsForFoodItem(foodId: string, reason?: string, repo?: PantryRepository): number {
  const r = repo || getPantryRepository();
  const engine = new AlertEngineService(r);
  return engine.cancelAlertsForFood(foodId);
}

export function stopFutureAlertsOnConsumed(foodId: string, repo?: PantryRepository): void {
  const r = repo || getPantryRepository();
  r.cancelPendingAlertsForFood(foodId);
  r.updateFoodItem(foodId, { status: "consumed", consumed_at: new Date().toISOString(), reminder_enabled: 0 });
}
