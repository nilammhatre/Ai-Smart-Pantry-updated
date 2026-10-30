import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  seedPantry, seedShopping, seedNotifs, seedHistory,
  calculateDaysLeft, dateToIso, getDeterministicDaysLeft,
  type PantryItem, type ShopItem, type Notif, type ScanRecord, type Category, type Storage
} from "./pantry-data";
import { pantryDb } from "@/services/swiggy/pantryDb";
import { updateCalendarEvent, deleteCalendarEvent, createCalendarEvent } from "@/services/calendarService";
import { sendWhatsAppAlert } from "@/services/whatsappService";

interface Store {
  items: PantryItem[];
  shopping: ShopItem[];
  notifs: Notif[];
  history: ScanRecord[];
  addItem: (i: PantryItem) => Promise<any>;
  addItems: (items: PantryItem[]) => Promise<any>;
  removeItem: (id: string) => Promise<{ success: boolean; calendarDeleted?: boolean; calendarError?: string | null }>;
  consumeItem: (id: string) => Promise<any>;
  toggleReminder: (id: string) => Promise<void>;
  updateItemNutrition: (id: string, nutrition: any) => Promise<void>;
  addShop: (s: Omit<ShopItem, "id" | "done">) => void;
  toggleShop: (id: string) => void;
  markRead: (id?: string) => void;
  dismissNotif: (id: string) => void;
  addHistory: (h: ScanRecord) => void;
  dark: boolean;
  setDark: (v: boolean) => void;
  syncPantryDb: () => void;
  refreshBackendData: () => Promise<void>;
  sendWhatsAppNotification: (item: PantryItem) => Promise<any>;
  syncCalendarNotification: (item: PantryItem) => Promise<any>;
}

const Ctx = createContext<Store | null>(null);

export function mapBackendRowToPantryItem(r: any): PantryItem {
  const dateStr = r.expiry_date || r.consume_by_date || r.consumeByDate || r.printed_expiry_date || r.printedExpiryDate;
  let dynamicDays: number;
  if (dateStr) {
    dynamicDays = calculateDaysLeft(dateStr, r.daysRemaining ?? r.expiresInDays);
  } else if (r.daysRemaining !== undefined) {
    dynamicDays = Number(r.daysRemaining);
  } else if (r.expiresInDays !== undefined) {
    dynamicDays = Number(r.expiresInDays);
  } else if (r.days_left !== undefined) {
    dynamicDays = Number(r.days_left);
  } else {
    dynamicDays = 3;
  }

  const computedExpiryDate = dateStr || (dynamicDays !== undefined ? dateToIso(dynamicDays) : undefined);

  return {
    id: r.id || crypto.randomUUID(),
    name: r.name || "Food Item",
    category: (r.category || "Other") as Category,
    quantity: typeof r.quantity === "number" ? `${r.quantity} pcs` : (r.quantity || "1 pcs"),
    freshness: r.freshness_score !== undefined ? r.freshness_score : (r.freshness ?? 85),
    addedDaysAgo: r.addedDaysAgo ?? 0,
    expiresInDays: dynamicDays,
    days_left: dynamicDays,
    expiry_date: computedExpiryDate,
    storage: (r.storage_method || r.storage || "Refrigerator") as Storage,
    image: r.image,
    notes: r.notes || r.storage_advice,
    allergens: Array.isArray(r.allergens) ? r.allergens : [],
    nutrition: (() => {
      const nut = r.nutrition;
      if (nut && (Number(nut.calories || 0) > 0 || Number(nut.protein || 0) > 0)) {
        return nut;
      }
      const lower = (r.name || "").toLowerCase();
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
    })(),
    reminder: r.reminder_enabled !== undefined ? Boolean(r.reminder_enabled) : true,
    lowStock: r.lowStock || false,
    googleCalendarEventId: r.google_calendar_expiry_event_id || r.google_calendar_event_id,
    calendarEventId: r.google_calendar_expiry_event_id || r.google_calendar_event_id,
    googleCalendarId: r.google_calendar_id || "primary",
    calendarSyncStatus: r.google_calendar_sync_status || "NOT_SYNCED",
    calendarLastSyncedAt: r.google_calendar_last_synced_at,
    googleCalendarError: r.google_calendar_error,
    calendarHtmlLink: r.google_calendar_html_link,
    whatsappMessageId: r.whatsapp_message_id,
    whatsappStatus: r.whatsapp_status || "NOT_CONFIGURED",
    whatsappLastSentAt: r.whatsapp_last_sent_at,
    consumeByDate: computedExpiryDate,
    purchaseDate: r.purchase_date || r.purchaseDate,
    printedExpiryDate: r.printed_expiry_date || r.printedExpiryDate,
    estimatedConsumeByDate: r.estimated_consume_by_date || r.estimatedConsumeByDate,
    isVerifiedExpiry: Boolean(r.is_verified_expiry || r.isVerifiedExpiry),
    spoilageStatus: r.spoilage_status || r.spoilageStatus,
    hasCriticalSpoilage: Boolean(r.has_critical_spoilage || r.hasCriticalSpoilage),
    requiresConfirmation: Boolean(r.scan_metadata?.requiresConfirmation || r.requiresConfirmation),
    storageRecommendation: r.storage_advice || r.storageRecommendation,
    nextAlertDate: r.nextAlertDate,
    scanMetadata: r.scan_metadata || r.scanMetadata,
    status: r.status || "active"
  };
}

import { getActiveUserId } from "@/services/swiggy/pantryDb";

function getStoreKey() {
  const uid = getActiveUserId();
  return `smart-pantry-store_${uid}`;
}

export function PantryProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [shopping, setShopping] = useState<ShopItem[]>(seedShopping);
  const [notifs, setNotifs] = useState<Notif[]>(seedNotifs);
  const [history, setHistory] = useState<ScanRecord[]>(seedHistory);
  const [dark, setDark] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refreshBackendData = async () => {
    try {
      // 1. Fetch live food items from SQLite backend
      const pantryRes = await fetch("/api/pantry");
      if (pantryRes.ok) {
        const data = await pantryRes.json();
        if (Array.isArray(data.items) && data.items.length > 0) {
          const mapped = data.items.map(mapBackendRowToPantryItem);
          setItems(mapped);
          pantryDb.saveItems(data.items, false);
        } else {
          syncPantryDb();
        }
      } else {
        syncPantryDb();
      }

      // 2. Fetch live in-app notifications from SQLite backend
      const notifRes = await fetch("/api/notifications");
      if (notifRes.ok) {
        const data = await notifRes.json();
        if (Array.isArray(data.notifications)) {
          const mappedNotifs: Notif[] = data.notifications.map((n: any) => ({
            id: n.id,
            cat: n.category as any,
            text: n.message || n.title,
            time: formatTimeAgo(n.created_at),
            read: Boolean(n.read),
            priority: n.priority,
            foodId: n.food_id,
            actionUrl: n.action_url,
            dismissed: Boolean(n.dismissed)
          }));
          setNotifs(mappedNotifs);
        }
      }
    } catch (e) {
      console.warn("Could not fetch from backend API, falling back to local storage:", e);
      syncPantryDb();
    }
  };

  const syncPantryDb = () => {
    try {
      const dbItems = pantryDb.getItems();
      if (dbItems && dbItems.length > 0) {
        setItems(dbItems.map(mapBackendRowToPantryItem));
      }
    } catch (e) {
      console.warn("Could not sync from pantryDb:", e);
    }
  };

  const loadUserData = () => {
    try {
      syncPantryDb();
      refreshBackendData();

      const key = getStoreKey();
      const raw = localStorage.getItem(key);
      if (raw) {
        const s = JSON.parse(raw);
        setShopping(s.shopping || seedShopping);
        setHistory(s.history || seedHistory);
        if (typeof s.dark === "boolean") setDark(s.dark);
      } else {
        setShopping(seedShopping);
        setHistory(seedHistory);
      }
    } catch { /* ignore */ }
    setLoaded(true);
  };

  useEffect(() => {
    loadUserData();

    // Auto-refresh notifications and pantry items every 30 seconds
    const pollInterval = setInterval(() => {
      refreshBackendData().catch(() => {});
    }, 30000);

    const handleStorageChange = () => {
      loadUserData();
    };
    window.addEventListener("storage", handleStorageChange);

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const key = getStoreKey();
    localStorage.setItem(key, JSON.stringify({ shopping, history, dark }));
  }, [shopping, history, dark, loaded]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const sendWhatsAppNotification = async (item: PantryItem) => {
    try {
      const res = await fetch("/api/integrations/whatsapp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foodName: item.name })
      });
      const data = await res.json();
      await refreshBackendData();
      return data;
    } catch {
      // Fallback
      return sendWhatsAppAlert(item as any);
    }
  };

  const syncCalendarNotification = async (item: PantryItem) => {
    try {
      const res = await fetch(`/api/pantry/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reminder_enabled: true })
      });
      const data = await res.json();
      await refreshBackendData();
      return data;
    } catch {
      return updateCalendarEvent(item as any);
    }
  };

  const addItemHandler = async (i: PantryItem) => {
    // 1. Optimistic local update
    setItems((p) => [i, ...p.filter((x) => x.id !== i.id)]);

    try {
      // 2. Persist to server SQLite backend
      const res = await fetch("/api/pantry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: i.id,
          name: i.name,
          category: i.category,
          quantity: i.quantity,
          purchaseDate: i.purchaseDate || new Date().toISOString().split("T")[0],
          printedExpiryDate: i.printedExpiryDate || null,
          estimatedConsumeByDate: i.estimatedConsumeByDate || i.consumeByDate,
          consumeByDate: i.consumeByDate || i.printedExpiryDate || i.estimatedConsumeByDate,
          isVerifiedExpiry: i.isVerifiedExpiry || false,
          freshnessScore: i.freshness,
          spoilageStatus: i.hasCriticalSpoilage ? "SPOILED" : (i.spoilageStatus || (i.freshness < 30 ? "SPOILED" : i.expiresInDays <= 2 ? "USE_SOON" : "GOOD")),
          hasCriticalSpoilage: i.hasCriticalSpoilage || false,
          storageMethod: i.storage,
          storageCondition: i.storage.toLowerCase().includes("refrigerator") ? "fridge" : i.storage.toLowerCase().includes("freezer") ? "freezer" : "ambient",
          storageAdvice: i.storageRecommendation || i.notes,
          notes: i.notes,
          image: i.image,
          allergens: i.allergens,
          nutrition: i.nutrition,
          scanMetadata: {
            ...i.scanMetadata,
            requiresConfirmation: i.requiresConfirmation || false
          },
          reminderEnabled: i.reminder !== undefined ? i.reminder : true
        })
      });

      if (res.ok) {
        const result = await res.json();
        await refreshBackendData();
        return result;
      }
    } catch (e) {
      console.warn("Could not persist to server backend API, triggering client-side integrations:", e);
      try {
        const { sendWhatsAppAlert } = await import("@/services/whatsappService.js");
        sendWhatsAppAlert(i as any, { alertType: "NEW_PRODUCT" }).catch(() => {});
        const { createCalendarEvent } = await import("@/services/calendarService.js");
        createCalendarEvent(i as any).catch(() => {});
      } catch {}
    }
  };

  const addItemsHandler = async (newItems: PantryItem[]) => {
    if (!Array.isArray(newItems) || newItems.length === 0) return [];

    const nonDuplicates = newItems.filter((newItem) => {
      const exists = items.some(
        (existing) =>
          (newItem.orderId &&
            existing.orderId === newItem.orderId &&
            existing.name.toLowerCase().trim() === newItem.name.toLowerCase().trim()) ||
          existing.id === newItem.id
      );
      return !exists;
    });

    if (nonDuplicates.length === 0) return [];

    setItems((p) => [...nonDuplicates, ...p]);
    pantryDb.addItems(nonDuplicates as any, false);

    for (const item of nonDuplicates) {
      createCalendarEvent(item as any).catch(() => {});
      sendWhatsAppAlert(item as any, { alertType: "NEW_PRODUCT" }).catch(() => {});
    }

    return nonDuplicates;
  };

  const removeItemHandler = async (id: string) => {
    // 1. Optimistic local update
    setItems((p) => p.filter((x) => x.id !== id));

    try {
      // 2. Send to backend DELETE endpoint (cancels alerts, deletes calendar event, records failures)
      const res = await fetch(`/api/pantry/${id}`, { method: "DELETE" });
      const data = await res.json();
      await refreshBackendData();
      return data;
    } catch (err: any) {
      await pantryDb.deleteItemWithCalendarSync(id);
      return { success: true, calendarDeleted: false, calendarError: err.message };
    }
  };

  const consumeItemHandler = async (id: string) => {
    // 1. Optimistic local update: remove from active pantry list
    setItems((p) => p.filter((x) => x.id !== id));

    try {
      // 2. Call backend consume endpoint (stops future expiry reminders, cancels pending alerts)
      const res = await fetch(`/api/pantry/${id}/consume`, { method: "POST" });
      const data = await res.json();
      await refreshBackendData();
      return data;
    } catch (err) {
      console.warn("Error marking item consumed:", err);
    }
  };

  const toggleReminderHandler = async (id: string) => {
    const item = items.find((x) => x.id === id);
    if (!item) return;

    const newReminder = !item.reminder;
    setItems((p) => p.map((x) => (x.id === id ? { ...x, reminder: newReminder } : x)));

    try {
      await fetch(`/api/pantry/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reminder_enabled: newReminder })
      });
      await refreshBackendData();
    } catch {
      // Fallback
    }
  };

  const markReadHandler = async (id?: string) => {
    setNotifs((p) => p.map((x) => (!id || x.id === id ? { ...x, read: true } : x)));
    try {
      if (id) {
        await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      } else {
        await fetch("/api/notifications/mark-all-read", { method: "POST" });
      }
    } catch { /* ignore */ }
  };

  const dismissNotifHandler = async (id: string) => {
    setNotifs((p) => p.filter((x) => x.id !== id));
    try {
      await fetch(`/api/notifications/${id}`, { method: "DELETE" });
    } catch { /* ignore */ }
  };

  const updateItemNutritionHandler = async (id: string, nutrition: any) => {
    setItems((p) => p.map((x) => (x.id === id ? { ...x, nutrition } : x)));
    try {
      await fetch(`/api/pantry/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nutrition })
      });
      await refreshBackendData();
    } catch { /* ignore */ }
  };

  const value = useMemo<Store>(() => ({
    items, shopping, notifs, history, dark, setDark, syncPantryDb,
    refreshBackendData, sendWhatsAppNotification, syncCalendarNotification,
    addItem: addItemHandler,
    addItems: addItemsHandler,
    removeItem: removeItemHandler,
    consumeItem: consumeItemHandler,
    toggleReminder: toggleReminderHandler,
    updateItemNutrition: updateItemNutritionHandler,
    addShop: (s) => setShopping((p) => p.some((x) => x.name === s.name && !x.done) ? p : [{ ...s, id: crypto.randomUUID(), done: false }, ...p]),
    toggleShop: (id) => setShopping((p) => p.map((x) => (x.id === id ? { ...x, done: !x.done } : x))),
    markRead: markReadHandler,
    dismissNotif: dismissNotifHandler,
    addHistory: (h) => setHistory((p) => [h, ...p]),
  }), [items, shopping, notifs, history, dark]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePantry() {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePantry outside provider");
  return c;
}

function formatTimeAgo(isoString: string): string {
  if (!isoString) return "Recently";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours} h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} d ago`;
}

