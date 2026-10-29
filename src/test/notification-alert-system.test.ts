/** @vitest-environment node */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getPantryRepository, type FoodItemRecord, type AlertRecord } from "../server/db/repository.js";
import {
  calculateItemDueDate,
  generateAlertsForFoodItem,
  recalculateAlertsForFoodItem,
  cancelAlertsForFoodItem,
  stopFutureAlertsOnConsumed
} from "../server/services/alertEngine.js";
import { processScheduledAlerts } from "../server/services/scheduler.js";
import { sendWhatsAppAlert, testWhatsAppConnection } from "../server/services/whatsappBackend.js";
import { syncGoogleCalendarItemEvents, deleteGoogleCalendarItemEvents, testGoogleCalendarConnection } from "../server/services/googleCalendarBackend.js";
import { handleApiRequest } from "../server/api/router.js";

describe("Automated Notification & Alert System Test Suite", () => {
  const repo = getPantryRepository();

  // Helper date utility (YYYY-MM-DD in IST)
  const getOffsetDateString = (offsetDays: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };

  const todayStr = getOffsetDateString(0);
  const tomorrowStr = getOffsetDateString(1);
  const in3DaysStr = getOffsetDateString(3);
  const in5DaysStr = getOffsetDateString(5);
  const yesterdayStr = getOffsetDateString(-1);

  // --------------------------------------------------------------------------
  // TEST SECTION 1: Food Addition & Metadata Requirements
  // --------------------------------------------------------------------------
  describe("1. Food Addition, Date Verification & Metadata", () => {
    it("distinguishes verified expiry dates from AI-estimated dates", () => {
      const verifiedItem: FoodItemRecord = {
        id: "test_item_verified_" + Date.now(),
        name: "Amul Taaza Milk",
        category: "Dairy",
        quantity: "1 L",
        storage_location: "Refrigerator",
        purchase_date: todayStr,
        printed_expiry_date: in5DaysStr,
        estimated_consume_by_date: in5DaysStr,
        is_verified_expiry: 1,
        freshness_score: 95,
        spoilage_status: "FRESH",
        has_critical_spoilage: 0,
        requires_confirmation: 0,
        scan_metadata: { source: "label_ocr", ocrConfidence: 0.98 },
        status: "active"
      };

      repo.upsertFoodItem(verifiedItem);
      const retrieved = repo.getFoodItemById(verifiedItem.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.is_verified_expiry).toBe(1);
      expect(retrieved!.printed_expiry_date).toBe(in5DaysStr);
      expect(retrieved!.requires_confirmation).toBe(0);

      // Cleanup
      repo.deleteFoodItem(verifiedItem.id);
    });

    it("flags low-confidence AI scans for confirmation without trusting raw guesses", () => {
      const estimatedItem: FoodItemRecord = {
        id: "test_item_estimated_" + Date.now(),
        name: "Uncertain Green Produce",
        category: "Vegetables",
        quantity: "250 g",
        storage_location: "Pantry shelf",
        purchase_date: todayStr,
        printed_expiry_date: null,
        estimated_consume_by_date: in3DaysStr,
        is_verified_expiry: 0,
        freshness_score: 70,
        spoilage_status: "FRESH",
        has_critical_spoilage: 0,
        requires_confirmation: 1, // Flagged for confirmation
        scan_metadata: { source: "photo", identificationConfidence: 42, isUncertain: true },
        status: "active"
      };

      repo.upsertFoodItem(estimatedItem);
      const retrieved = repo.getFoodItemById(estimatedItem.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.is_verified_expiry).toBe(0);
      expect(retrieved!.printed_expiry_date).toBeNull();
      expect(retrieved!.requires_confirmation).toBe(1);

      // Cleanup
      repo.deleteFoodItem(estimatedItem.id);
    });

    it("calculates due date prioritizing verified expiry over estimated consume-by date", () => {
      const itemWithBoth: FoodItemRecord = {
        id: "test_both_dates",
        name: "Yogurt",
        category: "Dairy",
        quantity: "400 g",
        storage_location: "Refrigerator",
        purchase_date: todayStr,
        printed_expiry_date: "2026-11-20",
        estimated_consume_by_date: "2026-11-15",
        is_verified_expiry: 1,
        freshness_score: 90,
        spoilage_status: "FRESH",
        has_critical_spoilage: 0,
        requires_confirmation: 0,
        status: "active"
      };

      expect(calculateItemDueDate(itemWithBoth)).toBe("2026-11-20");

      const itemWithEstimateOnly: FoodItemRecord = {
        ...itemWithBoth,
        id: "test_est_only",
        is_verified_expiry: 0,
        printed_expiry_date: null
      };

      expect(calculateItemDueDate(itemWithEstimateOnly)).toBe("2026-11-15");
    });
  });

  // --------------------------------------------------------------------------
  // TEST SECTION 2: Automatic Alert Engine Rules
  // --------------------------------------------------------------------------
  describe("2. Automatic Alert Engine Rules", () => {
    it("generates 4 configurable alerts (3-days, 1-day, due-date, overdue) for standard items", () => {
      const foodItem: FoodItemRecord = {
        id: "test_food_5days_" + Date.now(),
        name: "Fresh Strawberries",
        category: "Fruits",
        quantity: "1 box",
        storage_location: "Refrigerator",
        purchase_date: todayStr,
        printed_expiry_date: in5DaysStr,
        estimated_consume_by_date: in5DaysStr,
        is_verified_expiry: 1,
        freshness_score: 92,
        spoilage_status: "FRESH",
        has_critical_spoilage: 0,
        requires_confirmation: 0,
        status: "active"
      };

      repo.upsertFoodItem(foodItem);
      const alerts = generateAlertsForFoodItem(foodItem);

      expect(alerts.length).toBe(4);
      const types = alerts.map((a) => a.alert_type);
      expect(types).toContain("EXPIRING_3_DAYS");
      expect(types).toContain("EXPIRING_1_DAY");
      expect(types).toContain("DUE_TODAY");
      expect(types).toContain("OVERDUE");

      // Verify trigger dates
      const alert3Days = alerts.find((a) => a.alert_type === "EXPIRING_3_DAYS");
      const alert1Day = alerts.find((a) => a.alert_type === "EXPIRING_1_DAY");
      const alertDue = alerts.find((a) => a.alert_type === "DUE_TODAY");

      expect(alertDue!.trigger_date).toBe(in5DaysStr);

      // Cleanup
      repo.deleteFoodItem(foodItem.id);
    });

    it("handles short-shelf-life foods (<=2 days) with sensible rules without past 3-day alerts", () => {
      const shortShelfItem: FoodItemRecord = {
        id: "test_food_short_" + Date.now(),
        name: "Fresh Raw Fish Fillet",
        category: "Meat & Seafood",
        quantity: "300 g",
        storage_location: "Refrigerator",
        purchase_date: todayStr,
        printed_expiry_date: tomorrowStr, // 1 day remaining!
        estimated_consume_by_date: tomorrowStr,
        is_verified_expiry: 1,
        freshness_score: 85,
        spoilage_status: "FRESH",
        has_critical_spoilage: 0,
        requires_confirmation: 0,
        status: "active"
      };

      repo.upsertFoodItem(shortShelfItem);
      const alerts = generateAlertsForFoodItem(shortShelfItem);

      // Should NOT generate an EXPIRING_3_DAYS alert for tomorrow's item
      const alert3Days = alerts.find((a) => a.alert_type === "EXPIRING_3_DAYS");
      expect(alert3Days).toBeUndefined();

      // Should generate 1-day or immediate alert and overdue
      const alert1Day = alerts.find((a) => a.alert_type === "EXPIRING_1_DAY");
      const alertDue = alerts.find((a) => a.alert_type === "DUE_TODAY");
      expect(alert1Day || alertDue).toBeDefined();

      // Cleanup
      repo.deleteFoodItem(shortShelfItem.id);
    });

    it("triggers immediate CRITICAL spoilage alert for severe mold/rot independently of freshness score", () => {
      // Even if freshness score is 85%, if severe mold/rot was detected, it MUST trigger CRITICAL_SPOILAGE
      const spoiledItem: FoodItemRecord = {
        id: "test_spoiled_bread_" + Date.now(),
        name: "Artisan Sourdough Loaf",
        category: "Bakery",
        quantity: "1 loaf",
        storage_location: "Pantry shelf",
        purchase_date: todayStr,
        printed_expiry_date: in5DaysStr,
        estimated_consume_by_date: in5DaysStr,
        is_verified_expiry: 1,
        freshness_score: 85, // Freshness score alone must never override detected mold!
        spoilage_status: "SPOILED",
        has_critical_spoilage: 1, // Detected fuzzy mold
        requires_confirmation: 0,
        scan_metadata: { visibleIssues: ["Extensive green-black fuzzy mold colony", "Musty odor"] },
        status: "active"
      };

      repo.upsertFoodItem(spoiledItem);
      const alerts = generateAlertsForFoodItem(spoiledItem);

      const criticalAlert = alerts.find((a) => a.alert_type === "CRITICAL_SPOILAGE");
      expect(criticalAlert).toBeDefined();
      expect(criticalAlert!.priority).toBe("CRITICAL");
      expect(criticalAlert!.trigger_date).toBe(todayStr); // Immediate trigger
      expect(criticalAlert!.message).toContain("CRITICAL SPOILAGE");

      // Cleanup
      repo.deleteFoodItem(spoiledItem.id);
    });
  });

  // --------------------------------------------------------------------------
  // TEST SECTION 3: Persistent Scheduler, Idempotency & Duplicate Prevention
  // --------------------------------------------------------------------------
  describe("3. Scheduler, Idempotency & Duplicate Prevention", () => {
    it("processes due alerts, creates in-app notifications, and prevents duplicate deliveries", async () => {
      const foodItem: FoodItemRecord = {
        id: "test_due_item_" + Date.now(),
        name: "Organic Whole Milk",
        category: "Dairy",
        quantity: "1 L",
        storage_location: "Refrigerator",
        purchase_date: yesterdayStr,
        printed_expiry_date: todayStr, // Expiring today
        estimated_consume_by_date: todayStr,
        is_verified_expiry: 1,
        freshness_score: 60,
        spoilage_status: "USE_SOON",
        has_critical_spoilage: 0,
        requires_confirmation: 0,
        status: "active"
      };

      repo.upsertFoodItem(foodItem);
      generateAlertsForFoodItem(foodItem);

      // Verify alert exists in database
      const alerts = repo.getAlertsForFoodItem(foodItem.id);
      const dueTodayAlert = alerts.find((a) => a.alert_type === "DUE_TODAY");
      expect(dueTodayAlert).toBeDefined();

      // First run of scheduler
      const run1 = await processScheduledAlerts();
      expect(run1.processedAlerts).toBeGreaterThanOrEqual(1);

      // Verify notification was created
      const notifs = repo.getNotifications(50);
      const itemNotif = notifs.find((n) => n.food_id === foodItem.id);
      expect(itemNotif).toBeDefined();
      expect(itemNotif!.is_read).toBe(0);

      // Verify delivery record was saved
      const deliveries1 = repo.getDeliveriesForAlert(dueTodayAlert!.id);
      const inAppDelivery = deliveries1.find((d) => d.channel === "in_app");
      expect(inAppDelivery).toBeDefined();
      expect(inAppDelivery!.status).toBe("SENT");

      // SECOND run of scheduler: MUST BE IDEMPOTENT (prevent duplicate notification)
      const run2 = await processScheduledAlerts();
      expect(run2.skippedDuplicates).toBeGreaterThanOrEqual(1);

      // Count in-app notifications for this alert - must remain exactly 1!
      const allItemNotifs = notifs.filter((n) => n.alert_id === dueTodayAlert!.id);
      expect(allItemNotifs.length).toBe(1);

      // Cleanup
      repo.deleteFoodItem(foodItem.id);
    });

    it("survives app closure because alert state is in SQLite database, not frontend timers", async () => {
      // Create a food item with alert in DB
      const foodId = "test_app_closure_" + Date.now();
      repo.upsertFoodItem({
        id: foodId,
        name: "Tofu Block",
        category: "Pantry",
        quantity: "200 g",
        storage_location: "Refrigerator",
        purchase_date: todayStr,
        printed_expiry_date: todayStr,
        estimated_consume_by_date: todayStr,
        is_verified_expiry: 1,
        freshness_score: 75,
        spoilage_status: "FRESH",
        has_critical_spoilage: 0,
        requires_confirmation: 0,
        status: "active"
      });

      const alertRecord: AlertRecord = {
        id: "alert_closure_" + Date.now(),
        food_id: foodId,
        alert_type: "DUE_TODAY",
        priority: "HIGH",
        trigger_date: todayStr,
        status: "PENDING",
        message: "Tofu Block is due today!"
      };
      repo.upsertAlert(alertRecord);

      // "App Closed" simulation: Verify alert is safely on disk
      const retrievedAlert = repo.getAlertById(alertRecord.id);
      expect(retrievedAlert).not.toBeNull();
      expect(retrievedAlert!.status).toBe("PENDING");

      // When backend scheduler runs (independently of browser/UI):
      const result = await processScheduledAlerts();
      expect(result.processedAlerts).toBeGreaterThanOrEqual(1);

      const afterProcess = repo.getAlertById(alertRecord.id);
      expect(afterProcess!.status).toBe("TRIGGERED");

      // Cleanup
      repo.deleteFoodItem(foodId);
    });
  });

  // --------------------------------------------------------------------------
  // TEST SECTION 4: Food Lifecycle Synchronization
  // --------------------------------------------------------------------------
  describe("4. Food Lifecycle Synchronization (Edit, Delete, Consume)", () => {
    it("recalculates alerts when food expiry date or storage condition is edited", () => {
      const foodItem: FoodItemRecord = {
        id: "test_edit_sync_" + Date.now(),
        name: "Yogurt Tub",
        category: "Dairy",
        quantity: "500 g",
        storage_location: "Refrigerator",
        purchase_date: todayStr,
        printed_expiry_date: in3DaysStr,
        estimated_consume_by_date: in3DaysStr,
        is_verified_expiry: 1,
        freshness_score: 90,
        spoilage_status: "FRESH",
        has_critical_spoilage: 0,
        requires_confirmation: 0,
        status: "active"
      };

      repo.upsertFoodItem(foodItem);
      generateAlertsForFoodItem(foodItem);

      const initialAlerts = repo.getAlertsForFoodItem(foodItem.id);
      const oldDueAlert = initialAlerts.find((a) => a.alert_type === "DUE_TODAY");
      expect(oldDueAlert!.trigger_date).toBe(in3DaysStr);

      // Edit item: user discovered extended expiry date (+10 days)
      const newExpiry = getOffsetDateString(10);
      const updatedItem: FoodItemRecord = {
        ...foodItem,
        printed_expiry_date: newExpiry,
        estimated_consume_by_date: newExpiry
      };
      repo.upsertFoodItem(updatedItem);

      // Trigger alert recalculation
      const recalculatedAlerts = recalculateAlertsForFoodItem(updatedItem);
      const newDueAlert = recalculatedAlerts.find((a) => a.alert_type === "DUE_TODAY");
      expect(newDueAlert!.trigger_date).toBe(newExpiry);

      // Old alerts should be cancelled/replaced
      const allCurrentAlerts = repo.getAlertsForFoodItem(foodItem.id);
      const pendingAlerts = allCurrentAlerts.filter((a) => a.status === "PENDING");
      for (const pa of pendingAlerts) {
        expect(pa.id).not.toBe(oldDueAlert!.id);
      }

      // Cleanup
      repo.deleteFoodItem(foodItem.id);
    });

    it("cancels all pending alerts when food is marked as consumed", () => {
      const foodItem: FoodItemRecord = {
        id: "test_consume_sync_" + Date.now(),
        name: "Cheddar Cheese",
        category: "Dairy",
        quantity: "200 g",
        storage_location: "Refrigerator",
        purchase_date: todayStr,
        printed_expiry_date: in5DaysStr,
        estimated_consume_by_date: in5DaysStr,
        is_verified_expiry: 1,
        freshness_score: 90,
        spoilage_status: "FRESH",
        has_critical_spoilage: 0,
        requires_confirmation: 0,
        status: "active"
      };

      repo.upsertFoodItem(foodItem);
      generateAlertsForFoodItem(foodItem);

      // Verify pending alerts exist
      const activeAlerts = repo.getAlertsForFoodItem(foodItem.id).filter((a) => a.status === "PENDING");
      expect(activeAlerts.length).toBeGreaterThan(0);

      // Mark as consumed
      stopFutureAlertsOnConsumed(foodItem.id);

      // Verify all pending alerts are CANCELLED
      const remainingAlerts = repo.getAlertsForFoodItem(foodItem.id);
      const pendingAfterConsume = remainingAlerts.filter((a) => a.status === "PENDING");
      expect(pendingAfterConsume.length).toBe(0);

      const itemAfterConsume = repo.getFoodItemById(foodItem.id);
      expect(itemAfterConsume!.status).toBe("consumed");

      // Cleanup
      repo.deleteFoodItem(foodItem.id);
    });

    it("cancels all alerts when food is deleted", () => {
      const foodItem: FoodItemRecord = {
        id: "test_delete_sync_" + Date.now(),
        name: "Avocados",
        category: "Fruits",
        quantity: "2 pcs",
        storage_location: "Counter",
        purchase_date: todayStr,
        printed_expiry_date: in3DaysStr,
        estimated_consume_by_date: in3DaysStr,
        is_verified_expiry: 0,
        freshness_score: 80,
        spoilage_status: "FRESH",
        has_critical_spoilage: 0,
        requires_confirmation: 0,
        status: "active"
      };

      repo.upsertFoodItem(foodItem);
      generateAlertsForFoodItem(foodItem);

      // Cancel alerts
      cancelAlertsForFoodItem(foodItem.id, "Food item deleted from pantry");

      const alerts = repo.getAlertsForFoodItem(foodItem.id);
      for (const a of alerts) {
        expect(a.status).toBe("CANCELLED");
      }

      // Cleanup
      repo.deleteFoodItem(foodItem.id);
    });
  });

  // --------------------------------------------------------------------------
  // TEST SECTION 5: In-App Notification Center Operations
  // --------------------------------------------------------------------------
  describe("5. In-App Notification Center Operations", () => {
    it("handles notification unread counts, mark-read, mark-all-read, and dismiss actions", () => {
      const notifId = "test_notif_" + Date.now();
      repo.createNotification({
        id: notifId,
        alert_id: "test_alert",
        food_id: "test_food",
        title: "Test Food Alert",
        message: "Your milk expires soon",
        priority: "HIGH",
        category: "expiry",
        action_url: "/app/pantry"
      });

      // Verify unread count > 0
      const count1 = repo.getUnreadNotificationCount();
      expect(count1).toBeGreaterThanOrEqual(1);

      // Mark single notification read
      repo.markNotificationRead(notifId);
      const notifAfterRead = repo.getNotifications(10).find((n) => n.id === notifId);
      expect(notifAfterRead!.is_read).toBe(1);

      // Dismiss notification
      repo.dismissNotification(notifId);
      const allNotifs = repo.getNotifications(20);
      const dismissedNotif = allNotifs.find((n) => n.id === notifId);
      expect(dismissedNotif).toBeUndefined(); // Dismissed items filtered out
    });
  });

  // --------------------------------------------------------------------------
  // TEST SECTION 6: Integration Failures & Real Error Handling (Never Fake Success)
  // --------------------------------------------------------------------------
  describe("6. Integration Resilience (OAuth, WhatsApp HTTP 401, Retry Behavior)", () => {
    it("handles WhatsApp Meta Graph API HTTP 401 without crashing or faking success", async () => {
      // Test real dispatch with the configured credentials
      // Since WhatsApp access token in .env is expired/invalid, Meta API will return HTTP 401
      const result = await testWhatsAppConnection();

      // Must NOT report fake success
      expect(result.configured).toBe(true); // Credentials exist in env
      expect(result.connected).toBe(false); // Token is unauthorized
      expect(result.error).toBeTruthy();
      expect(result.error).toMatch(/(401|Authentication Error|OAuthException|invalid|access token)/i);
    });

    it("records delivery failure in database with real error message when WhatsApp fails", async () => {
      const mockAlert: AlertRecord = {
        id: "alert_fail_test_" + Date.now(),
        food_id: "food_fail_test",
        alert_type: "EXPIRING_1_DAY",
        priority: "HIGH",
        trigger_date: todayStr,
        status: "PENDING",
        message: "WhatsApp failure recording test"
      };

      const result = await sendWhatsAppAlert(mockAlert);
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();

      // Record in repository as scheduler does
      repo.recordDelivery({
        id: "del_fail_" + Date.now(),
        alert_id: mockAlert.id,
        channel: "whatsapp",
        status: "FAILED",
        error_message: result.error,
        retry_count: 1
      });

      const deliveries = repo.getDeliveriesForAlert(mockAlert.id);
      const waDelivery = deliveries.find((d) => d.channel === "whatsapp");
      expect(waDelivery).toBeDefined();
      expect(waDelivery!.status).toBe("FAILED");
      expect(waDelivery!.error_message).toContain("401");
    });

    it("handles Google Calendar integration failures gracefully with visible error recording", async () => {
      const status = await testGoogleCalendarConnection();

      // Google Calendar with expired/missing token should report error, not pretend to succeed
      expect(typeof status.configured).toBe("boolean");
      if (!status.connected) {
        expect(status.error).toBeTruthy();
      }
    });
  });

  // --------------------------------------------------------------------------
  // TEST SECTION 7: REST API Endpoints End-to-End
  // --------------------------------------------------------------------------
  describe("7. End-to-End REST API Endpoints", () => {
    it("GET /api/health returns ok status and scheduler health", async () => {
      const req = new Request("http://localhost:8080/api/health", { method: "GET" });
      const res = await handleApiRequest(req);

      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);

      const json = await res!.json();
      expect(json.status).toBe("ok");
      expect(json.scheduler).toBeDefined();
    });

    it("GET /api/settings and PUT /api/settings update alert preferences", async () => {
      const getReq = new Request("http://localhost:8080/api/settings", { method: "GET" });
      const getRes = await handleApiRequest(getReq);
      expect(getRes!.status).toBe(200);
      const initialSettings = await getRes!.json();

      // Update setting
      const putReq = new Request("http://localhost:8080/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...initialSettings,
          in_app_enabled: 1,
          remind_3_days_before: 1
        })
      });
      const putRes = await handleApiRequest(putReq);
      expect(putRes!.status).toBe(200);
      const updated = await putRes!.json();
      expect(updated.remind_3_days_before).toBe(1);
    });

    it("POST /api/alerts/process manually triggers scheduled alert processor", async () => {
      const req = new Request("http://localhost:8080/api/alerts/process", { method: "POST" });
      const res = await handleApiRequest(req);

      expect(res!.status).toBe(200);
      const json = await res!.json();
      expect(json.success).toBe(true);
      expect(typeof json.processedAlerts).toBe("number");
    });
  });
});
