// Persistent Background Alert Scheduler
// Runs autonomously on the server. Processes due alerts even when the browser is closed.
// Idempotent, deduplicated, channel-aware, timezone-aware, with retry limits.

import { PantryRepository, type AlertRecord, type FoodItemRecord } from "../db/repository";
import { updateGoogleCalendarEvents } from "./googleCalendarBackend";
import { sendWhatsAppAlertServer, sendWhatsAppMessageText, formatDaily7pmExpiredMessage } from "./whatsappBackend";

export interface SchedulerRunResult {
  processedAlerts: number;
  inAppDelivered: number;
  calendarSynced: number;
  calendarFailed: number;
  whatsappDelivered: number;
  whatsappFailed: number;
  skippedDeliveries: number;
  skippedDuplicates: number;
  retriesAttempted: number;
  errors: string[];
}

export function getCurrentDateInTimezone(timezone: string = "Asia/Kolkata"): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    return formatter.format(new Date()); // Returns YYYY-MM-DD
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

export class BackgroundSchedulerService {
  private repo: PantryRepository;
  private intervalTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(repo?: PantryRepository) {
    this.repo = repo || new PantryRepository();
  }

  /**
   * Starts the persistent backend scheduler timer.
   * @param intervalMs default 60,000ms (1 minute)
   */
  start(intervalMs: number = 60000) {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
    }

    console.log(`[Scheduler] 🚀 Persistent background alert scheduler started (Interval: ${intervalMs / 1000}s)`);

    // Run first check after a brief 2-second warm-up delay
    setTimeout(() => {
      this.processDueAlerts().catch(err => console.error("[Scheduler] Error during initial run:", err));
    }, 2000);

    this.intervalTimer = setInterval(() => {
      this.processDueAlerts().catch(err => console.error("[Scheduler] Error during scheduled interval run:", err));
    }, intervalMs);
  }

  /**
   * Stops the background scheduler timer.
   */
  stop() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
      console.log("[Scheduler] 🛑 Persistent background alert scheduler stopped.");
    }
  }

  /**
   * Core idempotent processing job for due alerts across all configured channels.
   */
  async processDueAlerts(userId = "default_user", overrideDate?: string): Promise<SchedulerRunResult> {
    this.isProcessing = true;

    const result: SchedulerRunResult = {
      processedAlerts: 0,
      inAppDelivered: 0,
      calendarSynced: 0,
      calendarFailed: 0,
      whatsappDelivered: 0,
      whatsappFailed: 0,
      skippedDeliveries: 0,
      skippedDuplicates: 0,
      retriesAttempted: 0,
      errors: []
    };

    try {
      const settings = this.repo.getUserSettings(userId);
      const todayInTz = overrideDate || getCurrentDateInTimezone(settings.timezone);
      const nowIso = new Date().toISOString();

      const dueAlerts = this.repo.getDuePendingAlerts(todayInTz, userId);

      for (const alert of dueAlerts) {
        const food = this.repo.getFoodItemById(alert.food_id);
        if (!food || food.status !== "active") {
          // Food is consumed, discarded, or deleted; cancel alert
          this.repo.updateAlertStatus(alert.id, "CANCELLED");
          continue;
        }

        // --- CHANNEL 1: IN-APP NOTIFICATION ---
        await this.deliverInApp(alert, food, settings, result);

        // --- CHANNELS 2 & 3: GOOGLE CALENDAR & WHATSAPP (concurrent delivery) ---
        await Promise.allSettled([
          this.deliverCalendar(alert, food, settings, result),
          this.deliverWhatsApp(alert, food, settings, result)
        ]);

        // Mark alert as PROCESSED so it is never re-sent
        this.repo.updateAlertStatus(alert.id, "PROCESSED");
        result.processedAlerts++;

        // 2-second rate-limit protection for Meta Graph API between consecutive messages
        await new Promise(r => setTimeout(r, 2000));
      }

      // Check and send Daily 7:00 PM Expired Items WhatsApp message
      await this.checkDaily7pmExpiredDigest(settings, todayInTz);

      // Process any temporary failed retries whose backoff has passed
      await this.processPendingRetries(nowIso, result);

    } catch (err: any) {
      console.error("[Scheduler] Unhandled exception during alert processing:", err);
      result.errors.push(err.message);
    } finally {
      this.isProcessing = false;
    }

    return result;
  }

  private async deliverInApp(
    alert: AlertRecord,
    food: FoodItemRecord,
    settings: any,
    result: SchedulerRunResult
  ) {
    const existing = this.repo.getDelivery(alert.id, "in_app");
    if (existing && existing.status === "SENT") {
      result.skippedDuplicates++;
      result.skippedDeliveries++;
      return; // Already delivered idempotently
    }

    if (!settings.channel_in_app) {
      this.repo.insertDelivery({
        id: `del_${alert.id}_in_app`,
        alert_id: alert.id,
        food_id: food.id,
        user_id: alert.user_id || "default_user",
        channel: "in_app",
        status: "SKIPPED",
        attempts: 1,
        max_attempts: 1,
        created_at: new Date().toISOString()
      });
      result.skippedDeliveries++;
      return;
    }

    try {
      this.repo.insertNotification({
        id: `notif_${alert.id}`,
        user_id: alert.user_id || "default_user",
        alert_id: alert.id,
        food_id: food.id,
        category: (alert.rule_type === "CRITICAL_SPOILAGE" || alert.alert_type === "CRITICAL_SPOILAGE") ? "Freshness" : "Expiry",
        priority: alert.priority,
        title: alert.title || `Alert: ${food.name}`,
        message: alert.message,
        action_url: `/app/pantry/${food.id}`,
        read: false,
        dismissed: false,
        created_at: new Date().toISOString()
      });

      this.repo.insertDelivery({
        id: `del_${alert.id}_in_app`,
        alert_id: alert.id,
        food_id: food.id,
        user_id: alert.user_id || "default_user",
        channel: "in_app",
        status: "SENT",
        attempts: 1,
        max_attempts: 1,
        created_at: new Date().toISOString(),
        sent_at: new Date().toISOString()
      });

      result.inAppDelivered++;
    } catch (err: any) {
      result.errors.push(`In-App delivery error: ${err.message}`);
    }
  }

  private async deliverCalendar(
    alert: AlertRecord,
    food: FoodItemRecord,
    settings: any,
    result: SchedulerRunResult
  ) {
    const existing = this.repo.getDelivery(alert.id, "google_calendar");
    if (existing && existing.status === "SENT") {
      result.skippedDuplicates++;
      result.skippedDeliveries++;
      return;
    }

    if (!settings.channel_google_calendar || !food.reminder_enabled) {
      this.repo.insertDelivery({
        id: `del_${alert.id}_google_calendar`,
        alert_id: alert.id,
        food_id: food.id,
        user_id: alert.user_id || "default_user",
        channel: "google_calendar",
        status: "SKIPPED",
        attempts: 1,
        max_attempts: 3,
        created_at: new Date().toISOString()
      });
      result.skippedDeliveries++;
      return;
    }

    const attempts = (existing?.attempts || 0) + 1;
    const nowIso = new Date().toISOString();

    try {
      const calRes = await updateGoogleCalendarEvents(food);
      if (calRes.success) {
        this.repo.insertDelivery({
          id: `del_${alert.id}_google_calendar`,
          alert_id: alert.id,
          food_id: food.id,
          user_id: alert.user_id || "default_user",
          channel: "google_calendar",
          status: "SENT",
          attempts,
          max_attempts: 3,
          provider_message_id: calRes.expiryEventId || calRes.soonEventId,
          created_at: existing?.created_at || nowIso,
          sent_at: nowIso
        });

        this.repo.updateFoodItem(food.id, {
          google_calendar_soon_event_id: calRes.soonEventId || food.google_calendar_soon_event_id,
          google_calendar_expiry_event_id: calRes.expiryEventId || food.google_calendar_expiry_event_id,
          google_calendar_html_link: calRes.htmlLink || food.google_calendar_html_link,
          google_calendar_sync_status: "SYNCED",
          google_calendar_last_synced_at: nowIso,
          google_calendar_error: null
        });

        result.calendarSynced++;
      } else {
        const nextRetry = new Date(Date.now() + attempts * 5 * 60 * 1000).toISOString();
        this.repo.insertDelivery({
          id: `del_${alert.id}_google_calendar`,
          alert_id: alert.id,
          food_id: food.id,
          user_id: alert.user_id || "default_user",
          channel: "google_calendar",
          status: "FAILED",
          attempts,
          max_attempts: 3,
          next_retry_at: nextRetry,
          last_attempt_at: nowIso,
          error_message: calRes.error,
          created_at: existing?.created_at || nowIso
        });

        this.repo.updateFoodItem(food.id, {
          google_calendar_sync_status: "FAILED",
          google_calendar_last_synced_at: nowIso,
          google_calendar_error: calRes.error
        });

        result.calendarFailed++;
        result.errors.push(`Calendar sync failed for ${food.name}: ${calRes.error}`);
      }
    } catch (err: any) {
      result.calendarFailed++;
      result.errors.push(`Calendar exception for ${food.name}: ${err.message}`);
    }
  }

  private async deliverWhatsApp(
    alert: AlertRecord,
    food: FoodItemRecord,
    settings: any,
    result: SchedulerRunResult
  ) {
    const existing = this.repo.getDelivery(alert.id, "whatsapp");
    if (existing && existing.status === "SENT") {
      result.skippedDuplicates++;
      result.skippedDeliveries++;
      return;
    }

    if (!settings.channel_whatsapp) {
      this.repo.insertDelivery({
        id: `del_${alert.id}_whatsapp`,
        alert_id: alert.id,
        food_id: food.id,
        user_id: alert.user_id || "default_user",
        channel: "whatsapp",
        status: "SKIPPED",
        attempts: 1,
        max_attempts: 3,
        created_at: new Date().toISOString()
      });
      result.skippedDeliveries++;
      return;
    }

    const attempts = (existing?.attempts || 0) + 1;
    const nowIso = new Date().toISOString();

    try {
      const waRes = await sendWhatsAppAlertServer(alert, food, settings.whatsapp_phone);
      if (waRes.success) {
        this.repo.insertDelivery({
          id: `del_${alert.id}_whatsapp`,
          alert_id: alert.id,
          food_id: food.id,
          user_id: alert.user_id || "default_user",
          channel: "whatsapp",
          status: "SENT",
          attempts,
          max_attempts: 3,
          provider_message_id: waRes.messageId,
          created_at: existing?.created_at || nowIso,
          sent_at: nowIso
        });

        this.repo.updateFoodItem(food.id, {
          whatsapp_status: "DELIVERED",
          whatsapp_message_id: waRes.messageId,
          whatsapp_last_sent_at: nowIso
        });

        result.whatsappDelivered++;
      } else {
        const nextRetry = new Date(Date.now() + attempts * 5 * 60 * 1000).toISOString();
        this.repo.insertDelivery({
          id: `del_${alert.id}_whatsapp`,
          alert_id: alert.id,
          food_id: food.id,
          user_id: alert.user_id || "default_user",
          channel: "whatsapp",
          status: "FAILED",
          attempts,
          max_attempts: 3,
          next_retry_at: nextRetry,
          last_attempt_at: nowIso,
          error_message: waRes.error,
          created_at: existing?.created_at || nowIso
        });

        this.repo.updateFoodItem(food.id, {
          whatsapp_status: `FAILED: ${waRes.error}`,
          whatsapp_last_sent_at: nowIso
        });

        result.whatsappFailed++;
        result.errors.push(`WhatsApp delivery failed for ${food.name}: ${waRes.error}`);
      }
    } catch (err: any) {
      result.whatsappFailed++;
      result.errors.push(`WhatsApp exception for ${food.name}: ${err.message}`);
    }
  }

  private async processPendingRetries(nowIso: string, result: SchedulerRunResult) {
    const retryDeliveries = this.repo.getPendingRetryDeliveries(nowIso);
    for (const del of retryDeliveries) {
      result.retriesAttempted++;
      const food = this.repo.getFoodItemById(del.food_id || "");
      if (!food || food.status !== "active") continue;

      if (del.channel === "google_calendar") {
        const calRes = await updateGoogleCalendarEvents(food);
        if (calRes.success) {
          del.status = "SENT";
          del.sent_at = nowIso;
          del.provider_message_id = calRes.expiryEventId || calRes.soonEventId;
          this.repo.insertDelivery(del);
          result.calendarSynced++;
        } else {
          del.attempts++;
          del.last_attempt_at = nowIso;
          del.next_retry_at = new Date(Date.now() + del.attempts * 10 * 60 * 1000).toISOString();
          del.error_message = calRes.error;
          this.repo.insertDelivery(del);
        }
      }
    }
  }

  /**
   * Daily 7:00 PM Expired Items WhatsApp Message
   * Checks if local time is 19:00+ (7 PM). If active items are expired,
   * delivers a friendly, interactive cleanup message and records it for today.
   */
  async checkDaily7pmExpiredDigest(settings: any, todayInTz: string): Promise<boolean> {
    if (!settings.channel_whatsapp) return false;

    try {
      const now = new Date();
      const tzString = now.toLocaleTimeString("en-GB", { timeZone: settings.timezone || "Asia/Kolkata", hour12: false });
      const currentHour = parseInt(tzString.split(":")[0], 10);

      // Only fire at 7 PM or later (19:00 - 23:59)
      if (currentHour < 19) return false;

      const digestKey = `daily_digest_${todayInTz}_7pm`;
      const existing = this.repo.getDelivery(digestKey, "whatsapp");
      if (existing && existing.status === "SENT") {
        return false; // Already sent today
      }

      // Query active items that are expired or spoiled
      const allActive = this.repo.getAllFoodItems(settings.user_id || "default_user", "active");
      const expiredItems = allActive.filter(item => {
        if (item.has_critical_spoilage || item.spoilage_status === "SPOILED") return true;
        if (item.consume_by_date && item.consume_by_date <= todayInTz) return true;
        return false;
      });

      if (expiredItems.length === 0) return false;

      const message = formatDaily7pmExpiredMessage(expiredItems);
      const sendRes = await sendWhatsAppMessageText(message, settings.whatsapp_phone);

      if (sendRes.success) {
        this.repo.insertAlert({
          id: digestKey,
          food_id: expiredItems[0].id,
          user_id: settings.user_id || "default_user",
          rule_type: "DAILY_EXPIRED_DIGEST",
          alert_type: "DAILY_EXPIRED_DIGEST",
          trigger_date: todayInTz,
          priority: "HIGH",
          status: "PROCESSED",
          title: "Daily 7 PM Expired Cleanup Digest",
          message: `${expiredItems.length} item(s) reached or passed consume-by date.`,
          created_at: new Date().toISOString()
        });

        this.repo.insertDelivery({
          id: `del_${digestKey}_whatsapp`,
          alert_id: digestKey,
          food_id: expiredItems[0].id,
          user_id: settings.user_id || "default_user",
          channel: "whatsapp",
          status: "SENT",
          attempts: 1,
          max_attempts: 1,
          provider_message_id: sendRes.messageId,
          created_at: new Date().toISOString(),
          sent_at: new Date().toISOString()
        });
        console.log(`[Scheduler] 🌆 Sent Daily 7 PM Expired Digest to WhatsApp for ${expiredItems.length} expired item(s)!`);
        return true;
      }
    } catch (err: any) {
      console.warn("[Scheduler] Daily 7 PM digest error:", err.message);
    }

    return false;
  }
}

// Global scheduler singleton
let globalScheduler: BackgroundSchedulerService | null = null;

export function getSchedulerInstance(): BackgroundSchedulerService {
  if (!globalScheduler) {
    globalScheduler = new BackgroundSchedulerService();
  }
  return globalScheduler;
}

export async function processScheduledAlerts(userId = "default_user", overrideDate?: string): Promise<SchedulerRunResult> {
  const scheduler = getSchedulerInstance();
  return scheduler.processDueAlerts(userId, overrideDate);
}
