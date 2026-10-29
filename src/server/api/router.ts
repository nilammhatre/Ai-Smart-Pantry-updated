// Backend REST API Router for AI Smart Pantry Alert & Notification System
// Handles all /api/* requests on the server with real SQLite persistence and live integrations.

import { PantryRepository, type FoodItemRecord } from "../db/repository";
import { AlertEngineService } from "../services/alertEngine";
import { getSchedulerInstance, getCurrentDateInTimezone } from "../services/scheduler";
import {
  isGoogleCalendarConfigured,
  createDualGoogleCalendarEvents,
  updateGoogleCalendarEvents,
  deleteGoogleCalendarEvents,
  refreshGoogleAccessTokenServer
} from "../services/googleCalendarBackend";
import {
  isWhatsAppConfigured,
  sendWhatsAppAlertServer
} from "../services/whatsappBackend";
import { calculatePantryAnalytics } from "../services/analyticsBackend";
import {
  getSwiggyConfig,
  registerDynamicClient,
  exchangeSwiggyToken,
  invokeSwiggyMcpTool,
  getSwiggyUserInfo
} from "../services/swiggyBackend";

const repo = new PantryRepository();
const alertEngine = new AlertEngineService(repo);

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

function errorResponse(message: string, status = 400, details?: any): Response {
  return jsonResponse({ error: message, details }, status);
}

export async function handleApiRequest(request: Request, env?: unknown): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  // CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });
  }

  try {
    // --- 1. HEALTH CHECK ---
    if (path === "/api/health" && method === "GET") {
      return jsonResponse({
        status: "ok",
        scheduler: {
          running: true,
          interval: 60000,
          status: "active"
        },
        timestamp: new Date().toISOString(),
        sqlite: true,
        calendarConfigured: isGoogleCalendarConfigured(),
        whatsappConfigured: isWhatsAppConfigured()
      });
    }

    // --- 1.5. LIVE PANTRY ANALYTICS & NUTRITION ENGINE ---
    if (path === "/api/analytics" && method === "GET") {
      const analytics = calculatePantryAnalytics(repo, "default_user");
      return jsonResponse(analytics);
    }

    // --- 2. INTEGRATIONS STATUS & LIVE DIAGNOSTICS ---
    if (path === "/api/integrations/status" && method === "GET") {
      const calConfigured = isGoogleCalendarConfigured();
      const waConfigured = isWhatsAppConfigured();
      const swiggyCfg = getSwiggyConfig();
      const settings = repo.getUserSettings();

      return jsonResponse({
        googleCalendar: {
          configured: calConfigured,
          clientIdPresent: Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.VITE_GOOGLE_CALENDAR_CLIENT_ID),
          hasRefreshToken: Boolean(process.env.GOOGLE_CALENDAR_REFRESH_TOKEN || process.env.VITE_GOOGLE_CALENDAR_REFRESH_TOKEN),
          channelActive: settings.channel_google_calendar
        },
        whatsapp: {
          configured: waConfigured,
          phoneNumberIdPresent: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.VITE_WHATSAPP_PHONE_NUMBER_ID),
          hasToken: Boolean(process.env.WHATSAPP_ACCESS_TOKEN || process.env.VITE_WHATSAPP_ACCESS_TOKEN),
          recipientConfigured: Boolean(settings.whatsapp_phone || process.env.WHATSAPP_RECIPIENT_PHONE),
          channelActive: settings.channel_whatsapp
        },
        swiggy: {
          configured: swiggyCfg.hasConfiguredCredentials,
          clientId: swiggyCfg.clientId ? swiggyCfg.clientId.slice(0, 6) + "..." : null,
          redirectUri: swiggyCfg.redirectUri,
          mcpEndpoint: swiggyCfg.mcpEndpoint
        }
      });
    }

    // --- 2.5. SWIGGY INSTAMART MCP & OAUTH API ---
    if (path === "/api/swiggy/config" && method === "GET") {
      const cfg = getSwiggyConfig();
      return jsonResponse({
        success: true,
        clientId: cfg.clientId,
        hasClientSecret: Boolean(cfg.clientSecret),
        isDynamic: cfg.isDynamic,
        hasConfiguredCredentials: cfg.hasConfiguredCredentials,
        authEndpoint: cfg.authEndpoint,
        tokenEndpoint: cfg.tokenEndpoint,
        registerEndpoint: cfg.registerEndpoint,
        mcpEndpoint: cfg.mcpEndpoint,
        redirectUri: cfg.redirectUri
      });
    }

    if (path === "/api/swiggy/register" && method === "POST") {
      const body = await request.json().catch(() => ({}));
      const res = await registerDynamicClient(body.redirectUri);
      return jsonResponse(res, res.success ? 200 : (res.status || 400));
    }

    if (path === "/api/swiggy/token" && method === "POST") {
      const body = await request.json().catch(() => ({}));
      const { code, codeVerifier, redirectUri } = body;
      if (!code || !codeVerifier) {
        return errorResponse("Missing required parameters: code and codeVerifier are required", 400);
      }
      try {
        const tokenData = await exchangeSwiggyToken(code, codeVerifier, redirectUri);
        return jsonResponse({ success: true, ...tokenData });
      } catch (err: any) {
        return errorResponse(err.message || "Failed to exchange authorization code", 400);
      }
    }

    if (path === "/api/swiggy/mcp" && method === "POST") {
      const authHeader = request.headers.get("Authorization") || "";
      let token = authHeader.replace(/^Bearer\s+/i, "").trim();
      const body = await request.json().catch(() => ({}));

      if (!token && body.token) {
        token = body.token;
      }

      if (!token) {
        return errorResponse("Authorization required: Swiggy access token missing", 401);
      }

      const { tool, arguments: toolArgs = {} } = body;
      if (!tool) {
        return errorResponse("Missing tool name in MCP request", 400);
      }

      try {
        const result = await invokeSwiggyMcpTool(tool, toolArgs, token);
        return jsonResponse({ success: true, tool, result });
      } catch (err: any) {
        return errorResponse(err.message || `MCP tool "${tool}" execution failed`, 500);
      }
    }

    if (path === "/api/integrations/calendar/refresh-token" && method === "POST") {
      const res = await refreshGoogleAccessTokenServer();
      return jsonResponse(res, res.success ? 200 : 401);
    }

    if (path === "/api/integrations/whatsapp/test" && method === "POST") {
      const body = await request.json().catch(() => ({}));
      const mockAlert = {
        id: "alert_test_" + Date.now(),
        food_id: "test_food",
        user_id: "default_user",
        rule_type: "1_DAY_BEFORE" as const,
        trigger_date: new Date().toISOString().split("T")[0],
        priority: "HIGH" as const,
        status: "PENDING" as const,
        title: "Test Alert",
        message: "This is a test alert from AI Smart Pantry.",
        created_at: new Date().toISOString()
      };
      const mockFood = {
        id: "test_food",
        user_id: "default_user",
        name: body.foodName || "Fresh Organic Spinach",
        category: "Vegetables",
        quantity: "250g",
        purchase_date: new Date().toISOString().split("T")[0],
        printed_expiry_date: null,
        estimated_consume_by_date: new Date(Date.now() + 864e5).toISOString().split("T")[0],
        consume_by_date: new Date(Date.now() + 864e5).toISOString().split("T")[0],
        is_verified_expiry: false,
        freshness_score: 85,
        spoilage_status: "GOOD" as const,
        spoilage_indicators: [],
        has_critical_spoilage: false,
        storage_method: "Refrigerator",
        storage_condition: "fridge",
        storage_advice: "Keep in crisper drawer",
        allergens: [],
        nutrition: {},
        scan_metadata: {},
        status: "active" as const,
        reminder_enabled: true,
        google_calendar_sync_status: "NOT_SYNCED" as const,
        whatsapp_status: "NOT_CONFIGURED",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const res = await sendWhatsAppAlertServer(mockAlert, mockFood, body.overridePhone);
      return jsonResponse(res, res.success ? 200 : (res.statusCode || 400));
    }

// Lifecycle hook: Auto-enrich nutrition macros per 100g whenever missing or zero
function enrichNutritionMacros(foodName: string, category?: string, currentNutrition?: any) {
  if (currentNutrition && (Number(currentNutrition.calories || 0) > 0 || Number(currentNutrition.protein || 0) > 0)) {
    return currentNutrition;
  }
  const lower = (foodName || "").toLowerCase();
  if (lower.includes("paneer")) {
    return { calories: 290, protein: 19, carbs: 3, fat: 22, fiber: 0, nutrients: ["Calcium", "Protein", "Phosphorus"] };
  }
  if (lower.includes("milk")) {
    return { calories: 58, protein: 3.1, carbs: 4.8, fat: 3.0, fiber: 0, nutrients: ["Calcium", "Vitamin D"] };
  }
  if (lower.includes("spinach") || lower.includes("palak")) {
    return { calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2, nutrients: ["Iron", "Vitamin K"] };
  }
  if (lower.includes("tomato")) {
    return { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2, nutrients: ["Vitamin C", "Lycopene"] };
  }
  if (lower.includes("apple")) {
    return { calories: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4, nutrients: ["Vitamin C", "Fiber"] };
  }
  if (lower.includes("banana")) {
    return { calories: 89, protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6, nutrients: ["Potassium", "Vitamin B6"] };
  }
  if (lower.includes("rice")) {
    return { calories: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4, nutrients: ["Manganese"] };
  }
  if (lower.includes("bread")) {
    return { calories: 247, protein: 13, carbs: 41, fat: 3.4, fiber: 7, nutrients: ["Fiber", "Iron"] };
  }
  if (lower.includes("egg")) {
    return { calories: 155, protein: 13, carbs: 1.1, fat: 11, fiber: 0, nutrients: ["Protein", "Choline"] };
  }
  if (lower.includes("potato")) {
    return { calories: 77, protein: 2, carbs: 17, fat: 0.1, fiber: 2.2, nutrients: ["Potassium", "Vitamin C"] };
  }
  if (lower.includes("curd") || lower.includes("yogurt")) {
    return { calories: 61, protein: 3.5, carbs: 4.7, fat: 3.3, fiber: 0, nutrients: ["Probiotics", "Calcium"] };
  }
  if (lower.includes("almond")) {
    return { calories: 579, protein: 21, carbs: 22, fat: 50, fiber: 12.5, nutrients: ["Vitamin E", "Magnesium"] };
  }
  return { calories: 110, protein: 3, carbs: 15, fat: 2, fiber: 1, nutrients: [] };
}

    // --- 3. FOOD ITEMS (CRUD + SYNC + CONSUMPTION) ---
    if (path === "/api/pantry" && method === "GET") {
      const items = repo.getAllFoodItems("default_user", "active");
      const enriched = items.map(item => {
        let nut = item.nutrition;
        const scanSource = item.scan_metadata?.source;
        if ((!nut || (Number(nut.calories || 0) === 0 && Number(nut.protein || 0) === 0)) && scanSource !== "barcode" && scanSource !== "label_ocr") {
          nut = enrichNutritionMacros(item.name, item.category, nut);
          repo.updateFoodItem(item.id, { nutrition: nut });
          item.nutrition = nut;
        }
        const nextAlert = alertEngine.getNextAlertDate(item.id);
        const alerts = repo.getAlertsByFoodId(item.id);
        return {
          ...item,
          nutrition: nut,
          nextAlertDate: nextAlert,
          pendingAlertsCount: alerts.filter(a => a.status === "PENDING").length
        };
      });
      return jsonResponse({ items: enriched });
    }

    if (path === "/api/pantry" && method === "POST") {
      const body = await request.json();
      if (!body.name) {
        return errorResponse("Food name is required");
      }

      const nowIso = new Date().toISOString();
      const todayStr = nowIso.split("T")[0];

      // Rule 1: Distinguish verified expiry dates from AI-estimated dates
      const printedDate = body.printedExpiryDate || body.printed_expiry_date || null;
      const estimatedDate = body.estimatedConsumeByDate || body.estimated_consume_by_date || body.consumeByDate || body.consume_by_date || body.expiryDate || "";
      const consumeByDate = printedDate || estimatedDate;

      // Rule 1: Do not invent missing dates or trust low-confidence predictions without flagging for confirmation
      const scanMeta = body.scanMetadata || body.scan_metadata || {};
      const isUncertain = Boolean(scanMeta.isUncertain || (scanMeta.confidence && scanMeta.confidence < 70));
      const requiresConfirmation = Boolean(scanMeta.requiresConfirmation || isUncertain);
      const isVerified = Boolean(!requiresConfirmation && (body.isVerifiedExpiry || body.is_verified_expiry || printedDate));

      // Determine severe spoilage
      const condition = (body.spoilageStatus || body.spoilage_status || body.condition || "FRESH").toUpperCase();
      const hasCriticalSpoilage = Boolean(
        body.hasCriticalSpoilage ||
        body.has_critical_spoilage ||
        condition === "SPOILED" ||
        (Array.isArray(body.spoilageIndicators) && body.spoilageIndicators.some((i: string) => i.toLowerCase().includes("mold") || i.toLowerCase().includes("rot")))
      );

      // Scans must preserve unavailable nutrition as unavailable; manual/legacy entries may still use enrichment.
      const isScanWithoutNutrition = scanMeta.source === "barcode" || scanMeta.source === "label_ocr";
      const enrichedNutrition = isScanWithoutNutrition
        ? (body.nutrition || null)
        : enrichNutritionMacros(body.name, body.category, body.nutrition);

      const foodRecord: FoodItemRecord = {
        id: body.id || `food_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        user_id: body.userId || body.user_id || "default_user",
        name: body.name.trim(),
        category: body.category || "",
        quantity: typeof body.quantity === "number" ? `${body.quantity} pcs` : (body.quantity || "1 pcs"),
        purchase_date: body.purchaseDate || body.purchase_date || todayStr,
        printed_expiry_date: printedDate,
        estimated_consume_by_date: estimatedDate,
        consume_by_date: consumeByDate,
        is_verified_expiry: isVerified,
        freshness_score: body.freshnessScore !== undefined ? body.freshnessScore : (body.freshness ?? null),
        spoilage_status: hasCriticalSpoilage ? "SPOILED" : condition === "USE_SOON" ? "USE_SOON" : condition === "GOOD" ? "GOOD" : "FRESH",
        spoilage_indicators: body.spoilageIndicators || body.spoilage_indicators || [],
        has_critical_spoilage: hasCriticalSpoilage,
        requires_confirmation: requiresConfirmation,
        storage_method: body.storageMethod || body.storage_method || body.storage || "Refrigerator",
        storage_condition: body.storageCondition || body.storage_condition || "fridge",
        storage_advice: body.storageAdvice || body.storage_advice || body.storageRecommendation || null,
        notes: body.notes || null,
        image: body.image || null,
        allergens: body.allergens || [],
        nutrition: enrichedNutrition,
        scan_metadata: {
          ...scanMeta,
          isUncertain,
          requiresConfirmation
        },
        status: "active",
        reminder_enabled: body.reminderEnabled !== undefined ? Boolean(body.reminderEnabled) : true,
        google_calendar_sync_status: "NOT_SYNCED",
        whatsapp_status: "NOT_CONFIGURED",
        created_at: nowIso,
        updated_at: nowIso
      };

      const inserted = repo.insertFoodItem(foodRecord);

      // Generate alerts according to Rule 2
      const { alerts, criticalSpoilageTriggered } = alertEngine.syncAlertsForFood(inserted.id, todayStr);

      // Rule 3: Calendar & WhatsApp dispatch if authorized
      if (inserted.reminder_enabled && isGoogleCalendarConfigured()) {
        createDualGoogleCalendarEvents(inserted).then(calRes => {
          if (calRes.success) {
            repo.updateFoodItem(inserted.id, {
              google_calendar_soon_event_id: calRes.soonEventId,
              google_calendar_expiry_event_id: calRes.expiryEventId,
              google_calendar_html_link: calRes.htmlLink,
              google_calendar_sync_status: "SYNCED",
              google_calendar_last_synced_at: new Date().toISOString(),
              google_calendar_error: null
            });
          } else {
            repo.updateFoodItem(inserted.id, {
              google_calendar_sync_status: "FAILED",
              google_calendar_last_synced_at: new Date().toISOString(),
              google_calendar_error: calRes.error
            });
          }
        }).catch(err => console.error("[PantryAPI] Async calendar sync error:", err));
      }

      // Automatically send WhatsApp notification on new item addition
      if (inserted.reminder_enabled && isWhatsAppConfigured()) {
        const newProductAlert = {
          id: `alert_${inserted.id}_new_product`,
          food_id: inserted.id,
          user_id: inserted.user_id,
          rule_type: "NEW_PRODUCT",
          alert_type: "NEW_PRODUCT",
          trigger_date: todayStr,
          priority: "MEDIUM" as const,
          status: "PROCESSED" as const,
          title: "New Product Added",
          message: `${inserted.name} has been added to your smart pantry.`,
          created_at: nowIso
        };

        repo.insertAlert(newProductAlert);

        sendWhatsAppAlertServer(newProductAlert, inserted).then(waRes => {
          if (waRes.success) {
            repo.updateFoodItem(inserted.id, {
              whatsapp_status: "DELIVERED",
              whatsapp_message_id: waRes.messageId,
              whatsapp_last_sent_at: new Date().toISOString()
            });
            repo.insertDelivery({
              id: `del_${newProductAlert.id}_whatsapp`,
              alert_id: newProductAlert.id,
              food_id: inserted.id,
              user_id: inserted.user_id,
              channel: "whatsapp",
              status: "SENT",
              attempts: 1,
              max_attempts: 1,
              provider_message_id: waRes.messageId,
              created_at: nowIso,
              sent_at: new Date().toISOString()
            });
            console.log(`[PantryAPI] ✅ WhatsApp notification sent for new product "${inserted.name}" (ID: ${waRes.messageId})`);
          } else {
            repo.updateFoodItem(inserted.id, {
              whatsapp_status: `FAILED: ${waRes.error}`,
              whatsapp_last_sent_at: new Date().toISOString()
            });
            console.warn(`[PantryAPI] ⚠️ WhatsApp notification failed for "${inserted.name}":`, waRes.error);
          }
        }).catch(err => console.error("[PantryAPI] Async WhatsApp error:", err));
      }

      // If critical spoilage triggered, process alert immediately!
      if (criticalSpoilageTriggered) {
        getSchedulerInstance().processDueAlerts(inserted.user_id, todayStr).catch(err => console.error(err));
      }

      return jsonResponse({
        success: true,
        item: repo.getFoodItemById(inserted.id),
        generatedAlerts: alerts,
        requiresConfirmation
      }, 201);
    }

    const pantryItemMatch = path.match(/^\/api\/pantry\/([^/]+)$/);
    if (pantryItemMatch) {
      const foodId = pantryItemMatch[1];

      if (method === "GET") {
        const item = repo.getFoodItemById(foodId);
        if (!item) return errorResponse("Item not found", 404);
        if (!item.nutrition || (Number(item.nutrition.calories || 0) === 0 && Number(item.nutrition.protein || 0) === 0)) {
          const nut = enrichNutritionMacros(item.name, item.category, item.nutrition);
          repo.updateFoodItem(foodId, { nutrition: nut });
          item.nutrition = nut;
        }
        const alerts = repo.getAlertsByFoodId(foodId);
        const deliveries = repo.getDeliveriesForFood(foodId);
        return jsonResponse({ item, alerts, deliveries });
      }

      // Rule 5: Editing food dates or storage details must recalculate alerts and update linked Calendar events
      if (method === "PUT") {
        const body = await request.json();
        const existing = repo.getFoodItemById(foodId);
        if (!existing) return errorResponse("Item not found", 404);

        const updated = repo.updateFoodItem(foodId, body);
        if (!updated) return errorResponse("Failed to update item", 500);

        // Recalculate alerts
        alertEngine.syncAlertsForFood(foodId);

        // Update Calendar events
        if (updated.reminder_enabled && isGoogleCalendarConfigured()) {
          const calRes = await updateGoogleCalendarEvents(updated);
          if (calRes.success) {
            repo.updateFoodItem(foodId, {
              google_calendar_soon_event_id: calRes.soonEventId || updated.google_calendar_soon_event_id,
              google_calendar_expiry_event_id: calRes.expiryEventId || updated.google_calendar_expiry_event_id,
              google_calendar_html_link: calRes.htmlLink || updated.google_calendar_html_link,
              google_calendar_sync_status: "SYNCED",
              google_calendar_last_synced_at: new Date().toISOString(),
              google_calendar_error: null
            });
          } else {
            repo.updateFoodItem(foodId, {
              google_calendar_sync_status: "FAILED",
              google_calendar_last_synced_at: new Date().toISOString(),
              google_calendar_error: calRes.error
            });
          }
        }

        return jsonResponse({ success: true, item: repo.getFoodItemById(foodId) });
      }

      // Rule 5: Deleting food must cancel pending jobs, cancel alerts, and delete linked Calendar event when authorized
      if (method === "DELETE") {
        const existing = repo.getFoodItemById(foodId);
        if (!existing) return errorResponse("Item not found", 404);

        // 1. Cancel alerts
        alertEngine.cancelAlertsForFood(foodId);

        // 2. Delete Calendar events
        let calendarDeletionError: string | undefined;
        if (existing.google_calendar_event_id || existing.google_calendar_soon_event_id || existing.google_calendar_expiry_event_id) {
          const calRes = await deleteGoogleCalendarEvents(existing);
          if (!calRes.success) {
            calendarDeletionError = calRes.error;
            // Record failure visibly
            repo.updateFoodItem(foodId, {
              google_calendar_sync_status: "DELETION_FAILED",
              google_calendar_error: calRes.error
            });
            console.warn(`[PantryAPI] Calendar event deletion failed for ${existing.name}: ${calRes.error}`);
          }
        }

        // Delete from database
        repo.deleteFoodItem(foodId);

        return jsonResponse({
          success: true,
          deletedId: foodId,
          calendarDeleted: !calendarDeletionError,
          calendarError: calendarDeletionError || null
        });
      }
    }

    // Rule 5: Marking food as consumed must stop future expiry reminders
    const consumeMatch = path.match(/^\/api\/pantry\/([^/]+)\/consume$/);
    if (consumeMatch && method === "POST") {
      const foodId = consumeMatch[1];
      const existing = repo.getFoodItemById(foodId);
      if (!existing) return errorResponse("Item not found", 404);

      // Stop future expiry reminders by cancelling alerts
      alertEngine.cancelAlertsForFood(foodId);

      // Update food status to consumed
      const updated = repo.updateFoodItem(foodId, {
        status: "consumed",
        consumed_at: new Date().toISOString(),
        reminder_enabled: false
      });

      // Remove or cancel calendar events
      if (existing.google_calendar_event_id || existing.google_calendar_soon_event_id || existing.google_calendar_expiry_event_id) {
        deleteGoogleCalendarEvents(existing).catch(err => console.warn(err));
      }

      return jsonResponse({
        success: true,
        message: `${existing.name} marked as consumed. Future expiry reminders stopped.`,
        item: updated
      });
    }

    // --- 4. ALERTS & SCHEDULER ENGINE ---
    if (path === "/api/alerts" && method === "GET") {
      const settings = repo.getUserSettings();
      const todayInTz = getCurrentDateInTimezone(settings.timezone);
      const allAlerts = repo.getAllAlerts();
      const activeItems = repo.getAllFoodItems("default_user", "active");

      // Group states according to Rule 6:
      // Critical, Expiring Soon, Expired/Overdue, All Clear
      const critical: any[] = [];
      const expiringSoon: any[] = [];
      const overdue: any[] = [];
      const standardUpcoming: any[] = [];

      for (const item of activeItems) {
        const expTime = new Date(item.consume_by_date + "T00:00:00").getTime();
        const nowTime = new Date(todayInTz + "T00:00:00").getTime();
        const daysDiff = Math.round((expTime - nowTime) / (864e5));
        const nextAlert = alertEngine.getNextAlertDate(item.id, todayInTz);

        const itemWithNext = { ...item, daysRemaining: daysDiff, nextAlertDate: nextAlert };

        if (item.has_critical_spoilage || item.spoilage_status === "SPOILED") {
          critical.push(itemWithNext);
        } else if (daysDiff < 0) {
          overdue.push(itemWithNext);
        } else if (daysDiff <= 3) {
          expiringSoon.push(itemWithNext);
        } else {
          standardUpcoming.push(itemWithNext);
        }
      }

      const isAllClear = critical.length === 0 && expiringSoon.length === 0 && overdue.length === 0;

      return jsonResponse({
        states: {
          critical,
          expiringSoon,
          overdue,
          standardUpcoming,
          isAllClear
        },
        counts: {
          critical: critical.length,
          expiringSoon: expiringSoon.length,
          overdue: overdue.length,
          allClear: isAllClear ? activeItems.length : 0
        },
        rawAlerts: allAlerts
      });
    }

    // Rule 4: Scheduled job trigger (for cron or manual test)
    if (path === "/api/alerts/process" && method === "POST") {
      const body = await request.json().catch(() => ({}));
      const overrideDate = body.overrideDate || undefined;
      const scheduler = getSchedulerInstance();
      const result = await scheduler.processDueAlerts("default_user", overrideDate);
      return jsonResponse({
        success: true,
        ...result,
        result
      });
    }

    // --- 5. NOTIFICATION CENTER (RULE 3) ---
    if (path === "/api/notifications" && method === "GET") {
      const includeDismissed = url.searchParams.get("includeDismissed") === "true";
      const notifs = repo.getNotifications("default_user", includeDismissed);
      const unreadCount = notifs.filter(n => !n.read && !n.dismissed).length;
      return jsonResponse({ notifications: notifs, unreadCount });
    }

    const notifReadMatch = path.match(/^\/api\/notifications\/([^/]+)\/read$/);
    if (notifReadMatch && (method === "PATCH" || method === "POST")) {
      const notifId = notifReadMatch[1];
      repo.markNotificationRead(notifId);
      return jsonResponse({ success: true, id: notifId });
    }

    if (path === "/api/notifications/mark-all-read" && method === "POST") {
      const updatedCount = repo.markAllNotificationsRead();
      return jsonResponse({ success: true, count: updatedCount });
    }

    const notifDismissMatch = path.match(/^\/api\/notifications\/([^/]+)$/);
    if (notifDismissMatch && method === "DELETE") {
      const notifId = notifDismissMatch[1];
      repo.dismissNotification(notifId);
      return jsonResponse({ success: true, dismissedId: notifId });
    }

    // --- 6. USER SETTINGS & CHANNELS ---
    if (path === "/api/settings" && method === "GET") {
      const settings = repo.getUserSettings();
      // Mask phone number for security
      const maskedPhone = settings.whatsapp_phone
        ? settings.whatsapp_phone.slice(0, 3) + "******" + settings.whatsapp_phone.slice(-2)
        : "";

      return jsonResponse({
        ...settings,
        remind_3_days_before: settings.remind_3_days_before ? 1 : 0,
        remind_1_day_before: settings.remind_1_day_before ? 1 : 0,
        remind_on_due_date: settings.remind_on_due_date ? 1 : 0,
        remind_overdue: settings.remind_overdue ? 1 : 0,
        channel_in_app: settings.channel_in_app ? 1 : 0,
        channel_google_calendar: settings.channel_google_calendar ? 1 : 0,
        channel_whatsapp: settings.channel_whatsapp ? 1 : 0,
        settings: {
          ...settings,
          whatsapp_phone_masked: maskedPhone
        },
        integrations: {
          googleCalendarConfigured: isGoogleCalendarConfigured(),
          whatsappConfigured: isWhatsAppConfigured()
        }
      });
    }

    if (path === "/api/settings" && method === "PUT") {
      const body = await request.json();
      const updated = repo.updateUserSettings("default_user", body);
      return jsonResponse({
        ...updated,
        remind_3_days_before: updated.remind_3_days_before ? 1 : 0,
        remind_1_day_before: updated.remind_1_day_before ? 1 : 0,
        remind_on_due_date: updated.remind_on_due_date ? 1 : 0,
        remind_overdue: updated.remind_overdue ? 1 : 0,
        channel_in_app: updated.channel_in_app ? 1 : 0,
        channel_google_calendar: updated.channel_google_calendar ? 1 : 0,
        channel_whatsapp: updated.channel_whatsapp ? 1 : 0,
        success: true,
        settings: updated
      });
    }

    // --- 7. SWIGGY INSTAMART MCP & OAUTH PROXY ---
    if (path === "/api/swiggy/config" && method === "GET") {
      const cfg = getSwiggyConfig();
      return jsonResponse({
        success: true,
        ...cfg
      });
    }

    if (path === "/api/swiggy/register" && method === "POST") {
      const body = await request.json().catch(() => ({}));
      const redirectUri = body.redirectUri;
      const result = await registerDynamicClient(redirectUri);
      return jsonResponse(result, result.success ? 200 : (result.status || 400));
    }

    if (path === "/api/swiggy/token" && method === "POST") {
      const body = await request.json().catch(() => ({}));
      const { code, codeVerifier, redirectUri } = body;
      try {
        const result = await exchangeSwiggyToken(code, codeVerifier, redirectUri);
        return jsonResponse({ success: true, ...result });
      } catch (err: any) {
        return errorResponse(err.message, 400);
      }
    }

    if (path === "/api/swiggy/mcp" && method === "POST") {
      const authHeader = request.headers.get("Authorization") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (!token) {
        return errorResponse("Unauthorized: Missing Authorization Bearer token", 401);
      }
      const body = await request.json().catch(() => ({}));
      const { tool, arguments: args } = body;
      if (!tool) {
        return errorResponse("Missing tool name in MCP request", 400);
      }
      try {
        const result = await invokeSwiggyMcpTool(tool, args || {}, token);
        return jsonResponse({ success: true, result });
      } catch (err: any) {
        return errorResponse(err.message, 500);
      }
    }

    if (path === "/api/swiggy/user" && method === "GET") {
      const authHeader = request.headers.get("Authorization") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (!token) {
        return errorResponse("Unauthorized: Missing Authorization Bearer token", 401);
      }
      try {
        const userInfo = await getSwiggyUserInfo(token);
        return jsonResponse({ success: true, ...userInfo });
      } catch (err: any) {
        return errorResponse(err.message, 500);
      }
    }

    if (path === "/api/swiggy/tools" && method === "GET") {
      const authHeader = request.headers.get("Authorization") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (!token) {
        return errorResponse("Unauthorized: Missing Authorization Bearer token", 401);
      }
      try {
        const result = await invokeSwiggyMcpTool("tools/list", {}, token);
        return jsonResponse({ success: true, result });
      } catch (err: any) {
        return errorResponse(err.message, 500);
      }
    }

    return errorResponse(`Endpoint not found: ${method} ${path}`, 404);
  } catch (err: any) {
    console.error(`[API Error] ${method} ${path}:`, err);
    return errorResponse(`Server error: ${err.message}`, 500);
  }
}
