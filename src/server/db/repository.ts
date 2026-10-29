import { getDatabase } from "./database";
import type { DatabaseSync } from "node:sqlite";

export interface FoodItemRecord {
  id: string;
  user_id?: string;
  name: string;
  category?: string;
  quantity?: string;
  purchase_date: string;
  printed_expiry_date?: string | null;
  estimated_consume_by_date?: string;
  consume_by_date?: string;
  is_verified_expiry?: boolean | number;
  freshness_score?: number | null;
  spoilage_status?: "FRESH" | "GOOD" | "USE_SOON" | "SPOILED" | string;
  spoilage_indicators?: string[];
  has_critical_spoilage?: boolean | number;
  requires_confirmation?: boolean | number;
  storage_method?: string;
  storage_location?: string;
  storage_condition?: string;
  storage_advice?: string | null;
  notes?: string | null;
  image?: string | null;
  allergens?: string[];
  nutrition?: any;
  scan_metadata?: any;
  status?: "active" | "consumed" | "discarded" | string;
  consumed_at?: string | null;
  discarded_at?: string | null;
  reminder_enabled?: boolean | number;
  google_calendar_id?: string;
  google_calendar_event_id?: string | null;
  google_calendar_soon_event_id?: string | null;
  google_calendar_expiry_event_id?: string | null;
  google_calendar_sync_status?: "NOT_SYNCED" | "SYNCED" | "FAILED" | "PENDING" | "DELETION_FAILED" | string;
  google_calendar_last_synced_at?: string | null;
  google_calendar_error?: string | null;
  google_calendar_html_link?: string | null;
  whatsapp_status?: string;
  whatsapp_message_id?: string | null;
  whatsapp_last_sent_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AlertRecord {
  id: string;
  food_id: string;
  user_id?: string;
  rule_type?: "3_DAYS_BEFORE" | "1_DAY_BEFORE" | "ON_DUE_DATE" | "OVERDUE" | "SHORT_SHELF_LIFE" | "CRITICAL_SPOILAGE" | string;
  alert_type?: "EXPIRING_3_DAYS" | "EXPIRING_1_DAY" | "DUE_TODAY" | "OVERDUE" | "SHORT_SHELF_LIFE" | "CRITICAL_SPOILAGE" | string;
  trigger_date: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  status: "PENDING" | "TRIGGERED" | "PROCESSED" | "CANCELLED" | "DISMISSED";
  title?: string;
  message: string;
  action_url?: string;
  created_at?: string;
  processed_at?: string | null;
  cancelled_at?: string | null;
}

export interface NotificationRecord {
  id: string;
  user_id?: string;
  alert_id?: string | null;
  food_id?: string | null;
  category?: string;
  priority?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | string;
  title: string;
  message: string;
  action_url?: string;
  read?: boolean;
  is_read?: number;
  dismissed?: boolean;
  created_at?: string;
  read_at?: string | null;
  dismissed_at?: string | null;
}

export interface NotificationDeliveryRecord {
  id: string;
  alert_id: string;
  food_id?: string;
  user_id?: string;
  channel: string;
  status: "PENDING" | "SENT" | "FAILED" | "SKIPPED" | string;
  attempts: number;
  max_attempts: number;
  next_retry_at?: string | null;
  last_attempt_at?: string | null;
  error_message?: string | null;
  provider_message_id?: string | null;
  created_at?: string;
  sent_at?: string | null;
  retry_count?: number;
}

export interface UserSettingsRecord {
  user_id: string;
  timezone: string;
  channel_in_app: boolean;
  channel_google_calendar: boolean;
  channel_whatsapp: boolean;
  remind_3_days_before: boolean;
  remind_1_day_before: boolean;
  remind_on_due_date: boolean;
  remind_overdue: boolean;
  reminder_time_of_day: string;
  whatsapp_phone: string;
  updated_at: string;
}

function parseFoodRow(row: any): FoodItemRecord {
  if (!row) return null as any;
  const isVerified = Boolean(row.is_verified_expiry);
  const hasCritical = Boolean(row.has_critical_spoilage);
  const reqConf = Boolean(row.requires_confirmation);
  return {
    ...row,
    is_verified_expiry: isVerified ? 1 : 0,
    has_critical_spoilage: hasCritical ? 1 : 0,
    requires_confirmation: reqConf ? 1 : 0,
    storage_location: row.storage_location || row.storage_method || "Refrigerator",
    storage_method: row.storage_method || row.storage_location || "Refrigerator",
    reminder_enabled: Boolean(row.reminder_enabled),
    spoilage_indicators: safelyParseJson(row.spoilage_indicators, []),
    allergens: safelyParseJson(row.allergens, []),
    nutrition: safelyParseJson(row.nutrition, {}),
    scan_metadata: safelyParseJson(row.scan_metadata, {}),
  };
}

function parseAlertRow(row: any): AlertRecord {
  if (!row) return null as any;
  const type = row.alert_type || row.rule_type;
  return {
    ...row,
    alert_type: type,
    rule_type: row.rule_type || type
  };
}

function parseNotificationRow(row: any): NotificationRecord {
  if (!row) return null as any;
  const isRead = Boolean(row.read);
  return {
    ...row,
    read: isRead,
    is_read: isRead ? 1 : 0,
    dismissed: Boolean(row.dismissed),
  };
}

function parseDeliveryRow(row: any): NotificationDeliveryRecord {
  if (!row) return null as any;
  return {
    ...row,
    channel: (row.channel || "").toLowerCase(),
    retry_count: row.attempts
  };
}

function parseSettingsRow(row: any): UserSettingsRecord {
  if (!row) return null as any;
  return {
    user_id: row.user_id,
    timezone: row.timezone || "Asia/Kolkata",
    channel_in_app: Boolean(row.channel_in_app),
    channel_google_calendar: Boolean(row.channel_google_calendar),
    channel_whatsapp: Boolean(row.channel_whatsapp),
    remind_3_days_before: Boolean(row.remind_3_days_before),
    remind_1_day_before: Boolean(row.remind_1_day_before),
    remind_on_due_date: Boolean(row.remind_on_due_date),
    remind_overdue: Boolean(row.remind_overdue),
    reminder_time_of_day: row.reminder_time_of_day || "09:00",
    whatsapp_phone: row.whatsapp_phone || "",
    updated_at: row.updated_at,
  };
}

function safelyParseJson<T>(raw: any, fallback: T): T {
  if (typeof raw !== "string") return raw || fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export class PantryRepository {
  private db: DatabaseSync;

  constructor(customDb?: DatabaseSync) {
    this.db = customDb || getDatabase();
  }

  // --- FOOD ITEMS ---

  getAllFoodItems(userId = "default_user", status?: string): FoodItemRecord[] {
    let sql = "SELECT * FROM food_items WHERE user_id = ?";
    const params: any[] = [userId];
    if (status) {
      sql += " AND status = ?";
      params.push(status);
    }
    sql += " ORDER BY consume_by_date ASC";
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);
    return rows.map(parseFoodRow);
  }

  getFoodItemById(id: string): FoodItemRecord | null {
    const stmt = this.db.prepare("SELECT * FROM food_items WHERE id = ?");
    const row = stmt.get(id);
    return row ? parseFoodRow(row) : null;
  }

  insertFoodItem(item: FoodItemRecord): FoodItemRecord {
    const isVerified = Boolean(item.is_verified_expiry);
    const hasCritical = Boolean(item.has_critical_spoilage);
    const reqConf = Boolean(item.requires_confirmation);
    const storageMethod = item.storage_method || item.storage_location || "Refrigerator";

    const stmt = this.db.prepare(`
      INSERT INTO food_items (
        id, user_id, name, category, quantity, purchase_date,
        printed_expiry_date, estimated_consume_by_date, consume_by_date,
        is_verified_expiry, freshness_score, spoilage_status,
        spoilage_indicators, has_critical_spoilage, requires_confirmation, storage_method,
        storage_condition, storage_advice, notes, image, allergens,
        nutrition, scan_metadata, status, consumed_at, discarded_at,
        reminder_enabled, google_calendar_id, google_calendar_event_id,
        google_calendar_soon_event_id, google_calendar_expiry_event_id,
        google_calendar_sync_status, google_calendar_last_synced_at,
        google_calendar_error, google_calendar_html_link, whatsapp_status,
        whatsapp_message_id, whatsapp_last_sent_at, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?
      )
    `);

    stmt.run(
      item.id,
      item.user_id || "default_user",
      item.name,
      item.category || "",
      item.quantity || "1 pcs",
      item.purchase_date,
      item.printed_expiry_date || null,
      item.estimated_consume_by_date || item.consume_by_date || "",
      item.consume_by_date || item.estimated_consume_by_date || "",
      isVerified ? 1 : 0,
        item.freshness_score !== undefined ? item.freshness_score : null,
      item.spoilage_status || "FRESH",
      JSON.stringify(item.spoilage_indicators || []),
      hasCritical ? 1 : 0,
      reqConf ? 1 : 0,
      storageMethod,
      item.storage_condition || "fridge",
      item.storage_advice || null,
      item.notes || null,
      item.image || null,
      JSON.stringify(item.allergens || []),
      JSON.stringify(item.nutrition ?? null),
      JSON.stringify(item.scan_metadata || {}),
      item.status || "active",
      item.consumed_at || null,
      item.discarded_at || null,
      item.reminder_enabled ? 1 : 0,
      item.google_calendar_id || "primary",
      item.google_calendar_event_id || null,
      item.google_calendar_soon_event_id || null,
      item.google_calendar_expiry_event_id || null,
      item.google_calendar_sync_status || "NOT_SYNCED",
      item.google_calendar_last_synced_at || null,
      item.google_calendar_error || null,
      item.google_calendar_html_link || null,
      item.whatsapp_status || "NOT_CONFIGURED",
      item.whatsapp_message_id || null,
      item.whatsapp_last_sent_at || null,
      item.created_at || new Date().toISOString(),
      item.updated_at || new Date().toISOString()
    );

    return this.getFoodItemById(item.id)!;
  }

  upsertFoodItem(item: Partial<FoodItemRecord> & { id: string; name: string }): FoodItemRecord {
    const existing = this.getFoodItemById(item.id);
    if (existing) {
      return this.updateFoodItem(item.id, item as any)!;
    }
    const nowIso = new Date().toISOString();
    const todayStr = nowIso.split("T")[0];
    const isVerified = Boolean(item.is_verified_expiry);
    const hasCritical = Boolean(item.has_critical_spoilage);
    const reqConf = Boolean(item.requires_confirmation);
    const fullItem: FoodItemRecord = {
      id: item.id,
      user_id: item.user_id || "default_user",
      name: item.name,
      category: item.category || "Other",
      quantity: item.quantity || "1 pcs",
      purchase_date: item.purchase_date || todayStr,
      printed_expiry_date: item.printed_expiry_date || null,
      estimated_consume_by_date: item.estimated_consume_by_date || item.consume_by_date || item.printed_expiry_date || "",
      consume_by_date: item.consume_by_date || item.printed_expiry_date || item.estimated_consume_by_date || "",
      is_verified_expiry: isVerified ? 1 : 0,
      freshness_score: item.freshness_score !== undefined ? item.freshness_score : null,
      spoilage_status: item.spoilage_status || "FRESH",
      spoilage_indicators: item.spoilage_indicators || [],
      has_critical_spoilage: hasCritical ? 1 : 0,
      requires_confirmation: reqConf ? 1 : 0,
      storage_method: item.storage_method || item.storage_location || "Refrigerator",
      storage_location: item.storage_location || item.storage_method || "Refrigerator",
      storage_condition: item.storage_condition || "fridge",
      storage_advice: item.storage_advice || null,
      notes: item.notes || null,
      image: item.image || null,
      allergens: item.allergens || [],
      nutrition: item.nutrition || {},
      scan_metadata: item.scan_metadata || {},
      status: item.status || "active",
      consumed_at: item.consumed_at || null,
      discarded_at: item.discarded_at || null,
      reminder_enabled: item.reminder_enabled !== undefined ? (Boolean(item.reminder_enabled) ? 1 : 0) : 1,
      google_calendar_id: item.google_calendar_id || "primary",
      google_calendar_event_id: item.google_calendar_event_id || null,
      google_calendar_soon_event_id: item.google_calendar_soon_event_id || null,
      google_calendar_expiry_event_id: item.google_calendar_expiry_event_id || null,
      google_calendar_sync_status: item.google_calendar_sync_status || "NOT_SYNCED",
      google_calendar_last_synced_at: item.google_calendar_last_synced_at || null,
      google_calendar_error: item.google_calendar_error || null,
      google_calendar_html_link: item.google_calendar_html_link || null,
      whatsapp_status: item.whatsapp_status || "NOT_CONFIGURED",
      whatsapp_message_id: item.whatsapp_message_id || null,
      whatsapp_last_sent_at: item.whatsapp_last_sent_at || null,
      created_at: item.created_at || nowIso,
      updated_at: item.updated_at || nowIso
    };
    return this.insertFoodItem(fullItem);
  }

  updateFoodItem(id: string, updates: Partial<FoodItemRecord>): FoodItemRecord | null {
    const existing = this.getFoodItemById(id);
    if (!existing) return null;

    const merged = { ...existing, ...updates, updated_at: new Date().toISOString() };
    const isVerified = Boolean(merged.is_verified_expiry);
    const hasCritical = Boolean(merged.has_critical_spoilage);
    const reqConf = Boolean(merged.requires_confirmation);
    const storageMethod = merged.storage_method || merged.storage_location || "Refrigerator";

    const stmt = this.db.prepare(`
      UPDATE food_items SET
        name = ?, category = ?, quantity = ?, purchase_date = ?,
        printed_expiry_date = ?, estimated_consume_by_date = ?, consume_by_date = ?,
        is_verified_expiry = ?, freshness_score = ?, spoilage_status = ?,
        spoilage_indicators = ?, has_critical_spoilage = ?, requires_confirmation = ?, storage_method = ?,
        storage_condition = ?, storage_advice = ?, notes = ?, image = ?, allergens = ?,
        nutrition = ?, scan_metadata = ?, status = ?, consumed_at = ?, discarded_at = ?,
        reminder_enabled = ?, google_calendar_id = ?, google_calendar_event_id = ?,
        google_calendar_soon_event_id = ?, google_calendar_expiry_event_id = ?,
        google_calendar_sync_status = ?, google_calendar_last_synced_at = ?,
        google_calendar_error = ?, google_calendar_html_link = ?, whatsapp_status = ?,
        whatsapp_message_id = ?, whatsapp_last_sent_at = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      merged.name ?? "",
      merged.category ?? "Other",
      merged.quantity ?? "1 pcs",
      merged.purchase_date ?? null,
      merged.printed_expiry_date ?? null,
      merged.estimated_consume_by_date ?? null,
      merged.consume_by_date ?? null,
      isVerified ? 1 : 0,
      merged.freshness_score ?? null,
      merged.spoilage_status ?? "GOOD",
      JSON.stringify(merged.spoilage_indicators || []),
      hasCritical ? 1 : 0,
      reqConf ? 1 : 0,
      storageMethod,
      merged.storage_condition ?? "fridge",
      merged.storage_advice || null,
      merged.notes || null,
      merged.image || null,
      JSON.stringify(merged.allergens || []),
      JSON.stringify(merged.nutrition || {}),
      JSON.stringify(merged.scan_metadata || {}),
      merged.status ?? "active",
      merged.consumed_at || null,
      merged.discarded_at || null,
      merged.reminder_enabled ? 1 : 0,
      merged.google_calendar_id || "primary",
      merged.google_calendar_event_id || null,
      merged.google_calendar_soon_event_id || null,
      merged.google_calendar_expiry_event_id || null,
      merged.google_calendar_sync_status ?? "NOT_SYNCED",
      merged.google_calendar_last_synced_at || null,
      merged.google_calendar_error || null,
      merged.google_calendar_html_link || null,
      merged.whatsapp_status ?? "NOT_CONFIGURED",
      merged.whatsapp_message_id || null,
      merged.whatsapp_last_sent_at || null,
      merged.updated_at,
      id
    );

    return this.getFoodItemById(id);
  }

  deleteFoodItem(id: string): boolean {
    const stmt = this.db.prepare("DELETE FROM food_items WHERE id = ?");
    stmt.run(id);
    return true;
  }

  // --- ALERTS ---

  insertAlert(alert: AlertRecord): AlertRecord {
    const ruleType = alert.rule_type || alert.alert_type || "1_DAY_BEFORE";
    const alertType = alert.alert_type || alert.rule_type || "EXPIRING_1_DAY";
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO alerts (
        id, food_id, user_id, rule_type, alert_type, trigger_date,
        priority, status, title, message, action_url,
        created_at, processed_at, cancelled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      alert.id,
      alert.food_id,
      alert.user_id || "default_user",
      ruleType,
      alertType,
      alert.trigger_date,
      alert.priority,
      alert.status || "PENDING",
      alert.title || "Food Alert",
      alert.message,
      alert.action_url || `/app/pantry/${alert.food_id}`,
      alert.created_at || new Date().toISOString(),
      alert.processed_at || null,
      alert.cancelled_at || null
    );

    return { ...alert, alert_type: alertType, rule_type: ruleType };
  }

  upsertAlert(alert: AlertRecord): AlertRecord {
    return this.insertAlert(alert);
  }

  getAlertById(alertId: string): AlertRecord | null {
    const stmt = this.db.prepare("SELECT * FROM alerts WHERE id = ?");
    const row = stmt.get(alertId);
    return row ? parseAlertRow(row) : null;
  }

  getAlertsForFoodItem(foodId: string): AlertRecord[] {
    return this.getAlertsByFoodId(foodId);
  }

  getAlertsByFoodId(foodId: string): AlertRecord[] {
    const stmt = this.db.prepare("SELECT * FROM alerts WHERE food_id = ? ORDER BY trigger_date ASC");
    const rows = stmt.all(foodId);
    return rows.map(parseAlertRow);
  }

  getDuePendingAlerts(currentDateIso: string, userId = "default_user"): AlertRecord[] {
    const stmt = this.db.prepare(`
      SELECT a.* FROM alerts a
      JOIN food_items f ON a.food_id = f.id
      WHERE a.user_id = ? 
        AND a.status = 'PENDING' 
        AND a.trigger_date <= ?
        AND f.status = 'active'
      ORDER BY 
        CASE a.priority
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          ELSE 4
        END,
        a.trigger_date ASC
    `);
    const rows = stmt.all(userId, currentDateIso);
    return rows.map(parseAlertRow);
  }

  getAllAlerts(userId = "default_user"): AlertRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM alerts 
      WHERE user_id = ? 
      ORDER BY trigger_date ASC, created_at DESC
    `);
    const rows = stmt.all(userId);
    return rows.map(parseAlertRow);
  }

  updateAlertStatus(alertId: string, status: "PENDING" | "TRIGGERED" | "PROCESSED" | "CANCELLED" | "DISMISSED"): boolean {
    const now = new Date().toISOString();
    let col = "processed_at";
    if (status === "CANCELLED") col = "cancelled_at";

    const stmt = this.db.prepare(`
      UPDATE alerts SET status = ?, ${col} = ? WHERE id = ?
    `);
    stmt.run(status, now, alertId);
    return true;
  }

  cancelPendingAlertsForFood(foodId: string): number {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE alerts SET status = 'CANCELLED', cancelled_at = ? 
      WHERE food_id = ? AND status = 'PENDING'
    `);
    const info = stmt.run(now, foodId);
    return Number(info.changes);
  }

  // --- NOTIFICATIONS ---

  insertNotification(notif: NotificationRecord): NotificationRecord {
    const isRead = notif.is_read !== undefined ? Boolean(notif.is_read) : Boolean(notif.read);
    const stmt = this.db.prepare(`
      INSERT INTO notifications (
        id, user_id, alert_id, food_id, category,
        priority, title, message, action_url, read,
        dismissed, created_at, read_at, dismissed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      notif.id,
      notif.user_id || "default_user",
      notif.alert_id || null,
      notif.food_id || null,
      notif.category || "Expiry",
      notif.priority || "MEDIUM",
      notif.title,
      notif.message,
      notif.action_url || null,
      isRead ? 1 : 0,
      notif.dismissed ? 1 : 0,
      notif.created_at || new Date().toISOString(),
      notif.read_at || null,
      notif.dismissed_at || null
    );

    return { ...notif, read: isRead, is_read: isRead ? 1 : 0 };
  }

  createNotification(notif: any): NotificationRecord {
    return this.insertNotification(notif);
  }

  getUnreadNotificationCount(userId = "default_user"): number {
    const stmt = this.db.prepare("SELECT count(*) as count FROM notifications WHERE user_id = ? AND read = 0 AND dismissed = 0");
    const row: any = stmt.get(userId);
    return row ? Number(row.count) : 0;
  }

  getNotifications(userIdOrLimit: string | number = "default_user", includeDismissed = false): NotificationRecord[] {
    let userId = "default_user";
    let limit = 50;
    if (typeof userIdOrLimit === "number") {
      limit = userIdOrLimit;
    } else if (typeof userIdOrLimit === "string") {
      userId = userIdOrLimit;
    }

    let sql = "SELECT * FROM notifications WHERE user_id = ?";
    if (!includeDismissed) {
      sql += " AND dismissed = 0";
    }
    sql += " ORDER BY created_at DESC LIMIT ?";
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(userId, limit);
    return rows.map(parseNotificationRow);
  }

  markNotificationRead(id: string): boolean {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE notifications SET read = 1, read_at = ? WHERE id = ?
    `);
    stmt.run(now, id);
    return true;
  }

  markAllNotificationsRead(userId = "default_user"): number {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE notifications SET read = 1, read_at = ? 
      WHERE user_id = ? AND read = 0
    `);
    const info = stmt.run(now, userId);
    return Number(info.changes);
  }

  dismissNotification(id: string): boolean {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE notifications SET dismissed = 1, dismissed_at = ? WHERE id = ?
    `);
    stmt.run(now, id);
    return true;
  }

  // --- DELIVERIES ---

  insertDelivery(delivery: NotificationDeliveryRecord): NotificationDeliveryRecord {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO notification_deliveries (
        id, alert_id, food_id, user_id, channel,
        status, attempts, max_attempts, next_retry_at,
        last_attempt_at, error_message, provider_message_id,
        created_at, sent_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const channelNormalized = (delivery.channel || "").toLowerCase();

    stmt.run(
      delivery.id,
      delivery.alert_id,
      delivery.food_id || "",
      delivery.user_id || "default_user",
      channelNormalized,
      delivery.status,
      delivery.attempts || 1,
      delivery.max_attempts || 3,
      delivery.next_retry_at || null,
      delivery.last_attempt_at || null,
      delivery.error_message || null,
      delivery.provider_message_id || null,
      delivery.created_at || new Date().toISOString(),
      delivery.sent_at || null
    );

    return { ...delivery, channel: channelNormalized };
  }

  getDelivery(alertId: string, channel: string): NotificationDeliveryRecord | null {
    const stmt = this.db.prepare(`
      SELECT * FROM notification_deliveries 
      WHERE alert_id = ? AND lower(channel) = lower(?)
    `);
    const row = stmt.get(alertId, channel);
    return row ? parseDeliveryRow(row) : null;
  }

  getDeliveriesForFood(foodId: string): NotificationDeliveryRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM notification_deliveries 
      WHERE food_id = ? 
      ORDER BY created_at DESC
    `);
    const rows = stmt.all(foodId);
    return rows.map(parseDeliveryRow);
  }

  getDeliveriesForAlert(alertId: string): NotificationDeliveryRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM notification_deliveries 
      WHERE alert_id = ? 
      ORDER BY created_at DESC
    `);
    const rows = stmt.all(alertId);
    return rows.map(parseDeliveryRow);
  }

  recordDelivery(delivery: any): NotificationDeliveryRecord {
    if (delivery.alert_id) {
      const existingAlert = this.getAlertById(delivery.alert_id);
      if (!existingAlert) {
        const foodId = delivery.food_id || `food_stub_${Date.now()}`;
        if (!this.getFoodItemById(foodId)) {
          this.upsertFoodItem({
            id: foodId,
            name: "Pantry Item",
            purchase_date: new Date().toISOString().split("T")[0]
          });
        }
        this.insertAlert({
          id: delivery.alert_id,
          food_id: foodId,
          user_id: delivery.user_id || "default_user",
          trigger_date: new Date().toISOString().split("T")[0],
          priority: "HIGH",
          status: "PENDING",
          message: delivery.error_message || "Alert record"
        });
      }
    }

    return this.insertDelivery({
      id: delivery.id || `del_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      alert_id: delivery.alert_id,
      food_id: delivery.food_id || "",
      user_id: delivery.user_id || "default_user",
      channel: (delivery.channel || "in_app").toLowerCase(),
      status: delivery.status || "SENT",
      attempts: delivery.attempts || delivery.retry_count || 1,
      max_attempts: delivery.max_attempts || 3,
      next_retry_at: delivery.next_retry_at || null,
      last_attempt_at: delivery.last_attempt_at || new Date().toISOString(),
      error_message: delivery.error_message || null,
      provider_message_id: delivery.provider_message_id || null,
      created_at: delivery.created_at || new Date().toISOString(),
      sent_at: delivery.sent_at || (delivery.status === "SENT" ? new Date().toISOString() : null)
    });
  }

  getPendingRetryDeliveries(currentDateIso: string): NotificationDeliveryRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM notification_deliveries 
      WHERE status = 'FAILED' 
        AND attempts < max_attempts 
        AND next_retry_at <= ?
      ORDER BY next_retry_at ASC
    `);
    const rows = stmt.all(currentDateIso);
    return rows.map(parseDeliveryRow);
  }

  // --- USER SETTINGS ---

  getUserSettings(userId = "default_user"): UserSettingsRecord {
    const stmt = this.db.prepare("SELECT * FROM user_settings WHERE user_id = ?");
    const row = stmt.get(userId);
    if (row) return parseSettingsRow(row);

    // Initialize defaults
    const now = new Date().toISOString();
    const defaults: UserSettingsRecord = {
      user_id: userId,
      timezone: "Asia/Kolkata",
      channel_in_app: true,
      channel_google_calendar: true,
      channel_whatsapp: true,
      remind_3_days_before: true,
      remind_1_day_before: true,
      remind_on_due_date: true,
      remind_overdue: true,
      reminder_time_of_day: "09:00",
      whatsapp_phone: process.env.WHATSAPP_RECIPIENT_PHONE || "",
      updated_at: now,
    };

    const insertStmt = this.db.prepare(`
      INSERT INTO user_settings (
        user_id, timezone, channel_in_app, channel_google_calendar,
        channel_whatsapp, remind_3_days_before, remind_1_day_before,
        remind_on_due_date, remind_overdue, reminder_time_of_day,
        whatsapp_phone, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      defaults.user_id,
      defaults.timezone,
      defaults.channel_in_app ? 1 : 0,
      defaults.channel_google_calendar ? 1 : 0,
      defaults.channel_whatsapp ? 1 : 0,
      defaults.remind_3_days_before ? 1 : 0,
      defaults.remind_1_day_before ? 1 : 0,
      defaults.remind_on_due_date ? 1 : 0,
      defaults.remind_overdue ? 1 : 0,
      defaults.reminder_time_of_day,
      defaults.whatsapp_phone,
      defaults.updated_at
    );

    return defaults;
  }

  updateUserSettings(userId = "default_user", updates: Partial<UserSettingsRecord>): UserSettingsRecord {
    const current = this.getUserSettings(userId);
    const merged = { ...current, ...updates, updated_at: new Date().toISOString() };

    const stmt = this.db.prepare(`
      UPDATE user_settings SET
        timezone = ?, channel_in_app = ?, channel_google_calendar = ?,
        channel_whatsapp = ?, remind_3_days_before = ?, remind_1_day_before = ?,
        remind_on_due_date = ?, remind_overdue = ?, reminder_time_of_day = ?,
        whatsapp_phone = ?, updated_at = ?
      WHERE user_id = ?
    `);

    stmt.run(
      merged.timezone,
      merged.channel_in_app ? 1 : 0,
      merged.channel_google_calendar ? 1 : 0,
      merged.channel_whatsapp ? 1 : 0,
      merged.remind_3_days_before ? 1 : 0,
      merged.remind_1_day_before ? 1 : 0,
      merged.remind_on_due_date ? 1 : 0,
      merged.remind_overdue ? 1 : 0,
      merged.reminder_time_of_day,
      merged.whatsapp_phone,
      merged.updated_at,
      userId
    );

    return this.getUserSettings(userId);
  }
}

let defaultRepoInstance: PantryRepository | null = null;
export function getPantryRepository(): PantryRepository {
  if (!defaultRepoInstance) {
    defaultRepoInstance = new PantryRepository();
  }
  return defaultRepoInstance;
}
