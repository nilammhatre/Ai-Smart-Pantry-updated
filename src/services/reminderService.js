// Scheduled Automated Reminder Service for Smart Pantry
// Executes 100% background API calls to Google Calendar API and WhatsApp Cloud API for expiring items.

import { pantryDb } from "./swiggy/pantryDb.js";
import { updateCalendarEvent } from "./calendarService.js";
import { sendWhatsAppAlert } from "./whatsappService.js";

let daemonTimerId = null;

/**
 * Automatically checks pantry items for expiring shelf life (daysRemaining <= 3) and executes API dispatches.
 * 
 * @param {object} options
 * @param {boolean} [options.sendWhatsApp=true]
 * @param {boolean} [options.syncCalendar=true]
 * @param {boolean} [options.forceReAlert=false]
 * @returns {Promise<object>} Audit summary of reminders processed
 */
export async function checkAndSendReminders({ sendWhatsApp = true, syncCalendar = true, forceReAlert = false } = {}) {
  const items = pantryDb.getItems();
  const todayStr = new Date().toISOString().split("T")[0];
  
  // Identify items expiring within 3 days (or expired) that need alerting today
  const expiringItems = items.filter(item => {
    const isExpiringSoon = item.daysRemaining <= 3;
    const notAlertedToday = forceReAlert || !item.lastAlertSentAt || !item.lastAlertSentAt.startsWith(todayStr);
    return isExpiringSoon && notAlertedToday;
  });

  console.log(`[ReminderDaemon] Checking pantry... Found ${expiringItems.length} expiring item(s) for background processing.`);

  if (expiringItems.length === 0) {
    return {
      success: true,
      expiringCount: 0,
      calendarCreated: 0,
      whatsappSent: false,
      logs: [],
      message: "All pantry items are fresh or have already received today's background API alerts!"
    };
  }

  const results = {
    success: true,
    expiringCount: expiringItems.length,
    calendarCreated: 0,
    whatsappSent: false,
    calendarResults: [],
    whatsappResults: [],
    processedAt: new Date().toISOString()
  };

  // 1. Google Calendar API: Update existing event or create if missing (Prevents duplicates)
  if (syncCalendar && expiringItems.length > 0) {
    for (const item of expiringItems) {
      try {
        const calRes = await updateCalendarEvent(item);
        results.calendarResults.push(calRes);
        
        if (calRes.success) {
          results.calendarCreated++;
          pantryDb.updateItem(item.id, {
            googleCalendarEventId: calRes.googleCalendarEventId,
            calendarEventId: calRes.googleCalendarEventId,
            googleCalendarId: calRes.googleCalendarId || "primary",
            calendarSyncStatus: "SYNCED",
            calendarLastSyncedAt: calRes.calendarLastSyncedAt || new Date().toISOString(),
            calendarHtmlLink: calRes.calendarHtmlLink
          }, false);
        } else {
          pantryDb.updateItem(item.id, {
            calendarSyncStatus: "FAILED",
            calendarLastSyncedAt: new Date().toISOString()
          }, false);
        }
      } catch (err) {
        console.error(`[ReminderDaemon] Calendar API error for ${item.name}:`, err);
      }
    }
  }

  // 2. WhatsApp Cloud API: Send alert message automatically in background
  if (sendWhatsApp && expiringItems.length > 0) {
    try {
      const waRes = await sendWhatsAppAlert(expiringItems);
      results.whatsappResults.push(waRes);

      if (waRes && waRes.success) {
        results.whatsappSent = true;
        expiringItems.forEach(item => {
          pantryDb.updateItem(item.id, {
            whatsappMessageId: waRes.messageId,
            whatsappStatus: "DELIVERED_SUCCESSFULLY",
            lastAlertSentAt: new Date().toISOString()
          }, false);
        });
      } else {
        expiringItems.forEach(item => {
          pantryDb.updateItem(item.id, {
            whatsappStatus: `FAILED: ${waRes?.error || 'Error'}`,
            lastAlertSentAt: new Date().toISOString()
          }, false);
        });
      }
    } catch (err) {
      console.error("[ReminderDaemon] WhatsApp Cloud API error:", err);
    }
  }

  return results;
}

/**
 * Starts a background daemon checking pantry items periodically.
 * @param {number} [intervalMs=60000] - Interval in milliseconds (default 1 minute)
 */
export function startScheduledReminderDaemon(intervalMs = 60000) {
  if (daemonTimerId) {
    clearInterval(daemonTimerId);
  }

  console.log(`[ReminderDaemon] Starting automated background daemon (Interval: ${intervalMs / 1000}s)`);
  
  // Initial check after 3s delay
  setTimeout(() => {
    checkAndSendReminders({ sendWhatsApp: true, syncCalendar: true, forceReAlert: false });
  }, 3000);

  daemonTimerId = setInterval(() => {
    checkAndSendReminders({ sendWhatsApp: true, syncCalendar: true, forceReAlert: false });
  }, intervalMs);
}

/**
 * Stops the background reminder daemon.
 */
export function stopScheduledReminderDaemon() {
  if (daemonTimerId) {
    clearInterval(daemonTimerId);
    daemonTimerId = null;
    console.log("[ReminderDaemon] Stopped.");
  }
}
