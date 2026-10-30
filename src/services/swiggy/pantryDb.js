import { calculateShelfLife } from "../shelfLifeEngine.js";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "../calendarService.js";
import { sendWhatsAppAlert } from "../whatsappService.js";

let currentUserId = typeof localStorage !== "undefined" ? localStorage.getItem("smart_pantry_active_user_id") || "default_user" : "default_user";

export function getActiveUserId() {
  return currentUserId;
}

export function setActiveUserId(userId) {
  if (!userId) return;
  currentUserId = userId;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("smart_pantry_active_user_id", userId);
    window.dispatchEvent(new Event("storage"));
  }
}

function getStorageKey() {
  return `smart_pantry_items_${currentUserId}`;
}

// Pre-populated seed items with fresh products delivered recently
const DEFAULT_INITIAL_ITEMS = [
  {
    id: "pantry_seed_spinach_01",
    name: "Fresh Organic Spinach (Palak)",
    category: "Vegetables",
    quantity: 250,
    unit: "g",
    receivedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // Delivered yesterday
    storageCondition: "fridge",
    freshnessScore: 90,
    spoilageRisk: "low",
    source: "Swiggy Instamart",
    googleCalendarEventId: "gcal_auto_spinach_01",
    calendarEventId: "gcal_auto_spinach_01",
    googleCalendarId: "primary",
    calendarSyncStatus: "SYNCED",
    calendarLastSyncedAt: new Date().toISOString(),
    whatsappMessageId: "wamid.spinach_01",
    whatsappStatus: "DELIVERED_SUCCESSFULLY"
  },
  {
    id: "pantry_seed_milk_02",
    name: "Amul Taaza Toned Milk",
    category: "Dairy",
    quantity: 500,
    unit: "mL",
    receivedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // Delivered yesterday
    storageCondition: "fridge",
    freshnessScore: 92,
    spoilageRisk: "low",
    source: "Swiggy Instamart",
    googleCalendarEventId: "gcal_auto_milk_02",
    calendarEventId: "gcal_auto_milk_02",
    googleCalendarId: "primary",
    calendarSyncStatus: "SYNCED",
    calendarLastSyncedAt: new Date().toISOString(),
    whatsappMessageId: "wamid.milk_02",
    whatsappStatus: "DELIVERED_SUCCESSFULLY"
  },
  {
    id: "pantry_seed_bread_03",
    name: "Fresh Whole Wheat Bread",
    category: "Bakery",
    quantity: 1,
    unit: "pieces",
    receivedAt: new Date().toISOString(), // Delivered today
    storageCondition: "ambient",
    freshnessScore: 95,
    spoilageRisk: "low",
    source: "Swiggy Instamart",
    googleCalendarEventId: "gcal_auto_bread_03",
    calendarEventId: "gcal_auto_bread_03",
    googleCalendarId: "primary",
    calendarSyncStatus: "SYNCED",
    calendarLastSyncedAt: new Date().toISOString(),
    whatsappMessageId: "wamid.bread_03",
    whatsappStatus: "DELIVERED_SUCCESSFULLY"
  },
  {
    id: "pantry_seed_paneer_04",
    name: "Fresh Malai Paneer",
    category: "Dairy",
    quantity: 200,
    unit: "g",
    receivedAt: new Date().toISOString(), // Delivered today
    storageCondition: "fridge",
    freshnessScore: 90,
    spoilageRisk: "low",
    source: "Swiggy Instamart",
    googleCalendarEventId: "gcal_auto_paneer_04",
    calendarEventId: "gcal_auto_paneer_04",
    googleCalendarId: "primary",
    calendarSyncStatus: "SYNCED",
    calendarLastSyncedAt: new Date().toISOString(),
    whatsappMessageId: "wamid.paneer_04",
    whatsappStatus: "DELIVERED_SUCCESSFULLY"
  },
  {
    id: "pantry_seed_tomatoes_05",
    name: "Fresh Hybrid Tomatoes",
    category: "Vegetables",
    quantity: 1,
    unit: "kg",
    receivedAt: new Date().toISOString(), // Delivered today
    storageCondition: "ambient",
    freshnessScore: 98,
    spoilageRisk: "low",
    source: "Swiggy Instamart",
    googleCalendarEventId: "gcal_auto_tomatoes_05",
    calendarEventId: "gcal_auto_tomatoes_05",
    googleCalendarId: "primary",
    calendarSyncStatus: "SYNCED",
    calendarLastSyncedAt: new Date().toISOString(),
    whatsappMessageId: "wamid.tomatoes_05",
    whatsappStatus: "DELIVERED_SUCCESSFULLY"
  }
];

// Helper to trigger automated calendar & whatsapp integrations asynchronously
function autoTriggerIntegrations(items) {
  const list = Array.isArray(items) ? items : [items];
  setTimeout(async () => {
    for (const item of list) {
      try {
        const calRes = await createCalendarEvent(item);
        const waRes = await sendWhatsAppAlert(item, { alertType: "NEW_PRODUCT" });

        const updates = {};
        if (calRes.success) {
          updates.googleCalendarSoonEventId = calRes.googleCalendarSoonEventId || calRes.googleCalendarEventId;
          updates.googleCalendarExpiryEventId = calRes.googleCalendarExpiryEventId || calRes.googleCalendarEventId;
          updates.googleCalendarEventId = calRes.googleCalendarEventId || calRes.googleCalendarExpiryEventId;
          updates.calendarEventId = calRes.googleCalendarEventId || calRes.googleCalendarExpiryEventId;
          updates.googleCalendarId = calRes.googleCalendarId || "primary";
          updates.calendarSyncStatus = calRes.calendarSyncStatus || "SYNCED";
          updates.calendarLastSyncedAt = calRes.calendarLastSyncedAt || new Date().toISOString();
          updates.calendarHtmlLink = calRes.calendarHtmlLink;
        } else {
          updates.calendarSyncStatus = calRes.calendarSyncStatus || "FAILED";
          updates.calendarLastSyncedAt = calRes.calendarLastSyncedAt || new Date().toISOString();
        }

        if (waRes && waRes.success) {
          updates.whatsappMessageId = waRes.messageId;
          updates.whatsappStatus = "DELIVERED_SUCCESSFULLY";
        } else if (waRes && !waRes.success) {
          updates.whatsappStatus = `FAILED: ${waRes.error}`;
        }

        if (Object.keys(updates).length > 0) {
          pantryDb.updateItem(item.id, updates, false); // false to avoid recursive autoTrigger
        }
      } catch (err) {
        console.error(`[PantryDb] Integration trigger error for ${item.name}:`, err);
      }
    }
  }, 50);
}

/**
 * Enriches a raw pantry item with dynamic shelf life, status, and consume-by attributes.
 * @param {object} item 
 * @returns {object} Enriched pantry item
 */
export function enrichPantryItem(item) {
  if (!item) return null;

  // Use deliveredAt / receivedAt or createdAt as shelf life starting point
  const receivedAt = item.receivedAt || item.deliveredAt || item.createdAt || new Date().toISOString();
  
  // Compute shelf-life engine parameters
  const engineResult = calculateShelfLife({
    name: item.name,
    category: item.category,
    receivedAt,
    storageCondition: item.storageCondition || "fridge",
    freshnessScore: item.freshnessScore !== undefined ? item.freshnessScore : 100,
    spoilageRisk: item.spoilageRisk
  });

  // Keep explicit expiryDate if user provided one manually, else use consumeByDate
  const finalExpiryDate = item.expiryDate || item.consumeByDate || engineResult.consumeByDate;

  let computedDaysRemaining = engineResult.daysRemaining;
  if (finalExpiryDate) {
    const expTime = new Date(finalExpiryDate).getTime();
    if (!isNaN(expTime)) {
      computedDaysRemaining = Math.round((expTime - Date.now()) / (1000 * 60 * 60 * 24));
    }
  }
  const finalStatus = computedDaysRemaining <= 0 ? "expired" : computedDaysRemaining <= 3 ? "soon" : "fresh";

  const eventId = item.googleCalendarEventId || item.calendarEventId || null;
  const syncStatus = item.calendarSyncStatus || (item.calendarStatus === "CREATED_SUCCESSFULLY" ? "SYNCED" : "NOT_SYNCED");

  return {
    ...item,
    receivedAt: engineResult.receivedAt,
    storageCondition: engineResult.storageCondition,
    freshnessScore: item.freshnessScore !== undefined ? item.freshnessScore : engineResult.freshnessScore,
    estimatedShelfLifeDays: engineResult.estimatedShelfLifeDays,
    consumeByDate: finalExpiryDate,
    expiryDate: finalExpiryDate,
    daysRemaining: computedDaysRemaining,
    status: finalStatus,
    spoilageRisk: item.spoilageRisk || engineResult.spoilageRisk,
    storageRecommendation: item.storageRecommendation || engineResult.storageRecommendation,
    spoilageIndicators: engineResult.spoilageIndicators,
    googleCalendarEventId: eventId,
    calendarEventId: eventId,
    googleCalendarId: item.googleCalendarId || "primary",
    calendarSyncStatus: syncStatus,
    calendarLastSyncedAt: item.calendarLastSyncedAt || null
  };
}

export const pantryDb = {
  // Get all items with dynamic shelf life calculation
  getItems() {
    try {
      const key = getStorageKey();
      const raw = localStorage.getItem(key);
      
      // If empty or never initialized, seed with initial demo items containing expiring products
      if (!raw || JSON.parse(raw).length === 0) {
        this.saveItems(DEFAULT_INITIAL_ITEMS);
        return DEFAULT_INITIAL_ITEMS.map(enrichPantryItem);
      }

      const items = JSON.parse(raw);
      return items.map(enrichPantryItem);
    } catch (error) {
      console.error("[PantryDb] Error reading from database:", error);
      return [];
    }
  },

  // Save all items to localStorage
  saveItems(items) {
    try {
      const key = getStorageKey();
      localStorage.setItem(key, JSON.stringify(items));
      window.dispatchEvent(new Event("storage"));
      return true;
    } catch (error) {
      console.error("[PantryDb] Error saving to database:", error);
      return false;
    }
  },

  // Get a single item by id
  getItemById(id) {
    if (!id) return null;
    const items = this.getItems();
    const target = String(id).trim();
    const decoded = decodeURIComponent(target);
    return items.find((i) => String(i.id) === target || String(i.id) === decoded || (i.name && i.name.toLowerCase() === decoded.toLowerCase())) || null;
  },

  // Seed sample expiring items on demand
  seedSampleItems() {
    this.saveItems(DEFAULT_INITIAL_ITEMS);
    return this.getItems();
  },

  // Add a single item
  addItem(item, triggerAutoIntegrations = true) {
    const items = this.getItems();
    const nowIso = new Date().toISOString();
    
    const newItemRaw = {
      ...item,
      id: item.id || "pantry_" + Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
      receivedAt: item.receivedAt || item.deliveredAt || nowIso,
      createdAt: nowIso,
      storageCondition: item.storageCondition || "fridge",
      freshnessScore: item.freshnessScore !== undefined ? item.freshnessScore : 100,
      googleCalendarEventId: item.googleCalendarEventId || item.calendarEventId || null,
      googleCalendarId: item.googleCalendarId || "primary",
      calendarSyncStatus: item.calendarSyncStatus || "NOT_SYNCED",
      calendarLastSyncedAt: item.calendarLastSyncedAt || null
    };

    const enriched = enrichPantryItem(newItemRaw);
    items.push(enriched);
    this.saveItems(items);
    
    if (triggerAutoIntegrations && !enriched.googleCalendarEventId) {
      autoTriggerIntegrations(enriched);
    }
    return enriched;
  },

  // Add multiple items (e.g., from Swiggy Instamart order import)
  addItems(newItems, triggerAutoIntegrations = true) {
    const items = this.getItems();
    const nowIso = new Date().toISOString();

    // Deduplicate against existing items with matching orderId and name
    const nonDuplicates = (newItems || []).filter(newItem => {
      if (!newItem.orderId) return true;
      const exists = items.some(existing => 
        existing.orderId === newItem.orderId && 
        existing.name.toLowerCase().trim() === newItem.name.toLowerCase().trim()
      );
      return !exists;
    });

    if (nonDuplicates.length === 0) {
      console.log("[PantryDb] All items in batch already exist in pantry; duplicate import prevented.");
      return [];
    }

    const formattedItems = nonDuplicates.map(item => {
      const itemRaw = {
        ...item,
        id: item.id || "pantry_" + Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
        receivedAt: item.receivedAt || item.deliveredAt || nowIso,
        createdAt: nowIso,
        storageCondition: item.storageCondition || "fridge",
        freshnessScore: item.freshnessScore !== undefined ? item.freshnessScore : 100,
        googleCalendarEventId: item.googleCalendarEventId || item.calendarEventId || null,
        googleCalendarId: item.googleCalendarId || "primary",
        calendarSyncStatus: item.calendarSyncStatus || "NOT_SYNCED",
        calendarLastSyncedAt: item.calendarLastSyncedAt || null
      };
      return enrichPantryItem(itemRaw);
    });

    const updatedList = [...items, ...formattedItems];
    this.saveItems(updatedList);
    if (triggerAutoIntegrations) {
      autoTriggerIntegrations(formattedItems);
    }
    return formattedItems;
  },

  // Delete an item without calendar call
  deleteItem(id) {
    const items = this.getItems();
    const filtered = items.filter(item => item.id !== id);
    return this.saveItems(filtered);
  },

  // Delete an item with mandatory Google Calendar API sync check
  async deleteItemWithCalendarSync(id) {
    const items = this.getItems();
    const item = items.find(i => i.id === id);
    if (!item) return { success: false, error: "Item not found in database." };

    // Attempt to delete from Google Calendar API
    const calRes = await deleteCalendarEvent(item);
    if (!calRes.success) {
      console.error(`[PantryDb] ❌ Google Calendar API deletion failed for ${item.name}: ${calRes.error}`);
      return {
        success: false,
        error: calRes.error,
        item
      };
    }

    // Success -> Remove from DB
    const filtered = items.filter(i => i.id !== id);
    this.saveItems(filtered);
    return { success: true, item };
  },

  // Clear all items
  clearAll() {
    this.saveItems([]);
  },

  // Update item fields
  updateItem(id, updatedFields, triggerSync = true) {
    const items = this.getItems();
    const index = items.findIndex(item => item.id === id);
    if (index !== -1) {
      const merged = {
        ...items[index],
        ...updatedFields
      };
      const enriched = enrichPantryItem(merged);
      items[index] = enriched;
      this.saveItems(items);

      // Automatically update Google Calendar event if calendar fields changed & triggerSync is true
      if (triggerSync && enriched.googleCalendarEventId) {
        updateCalendarEvent(enriched).then(res => {
          if (res.success) {
            pantryDb.updateItem(id, {
              googleCalendarEventId: res.googleCalendarEventId,
              calendarEventId: res.googleCalendarEventId,
              calendarSyncStatus: "SYNCED",
              calendarLastSyncedAt: res.calendarLastSyncedAt
            }, false);
          } else {
            pantryDb.updateItem(id, {
              calendarSyncStatus: "FAILED",
              calendarLastSyncedAt: new Date().toISOString()
            }, false);
          }
        }).catch(err => {
          console.error(`[PantryDb] Error updating calendar event for ${enriched.name}:`, err);
        });
      }

      return enriched;
    }
    return null;
  },

  // Get pantry statistics
  getStats() {
    const items = this.getItems();
    const stats = {
      total: items.length,
      fresh: 0,
      soon: 0,
      expired: 0,
      highRisk: 0
    };

    items.forEach(item => {
      if (item.status === "expired") stats.expired++;
      else if (item.status === "soon") stats.soon++;
      else stats.fresh++;

      if (item.spoilageRisk === "high") stats.highRisk++;
    });

    return stats;
  }
};
