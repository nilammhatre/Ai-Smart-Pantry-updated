import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  seedPantry, seedShopping, seedNotifs, seedHistory,
  type PantryItem, type ShopItem, type Notif, type ScanRecord,
} from "./pantry-data";
import { pantryDb } from "@/services/swiggy/pantryDb";
import { startScheduledReminderDaemon, stopScheduledReminderDaemon } from "@/services/reminderService";
import { updateCalendarEvent, deleteCalendarEvent, createCalendarEvent } from "@/services/calendarService";
import { sendWhatsAppAlert } from "@/services/whatsappService";

interface Store {
  items: PantryItem[];
  shopping: ShopItem[];
  notifs: Notif[];
  history: ScanRecord[];
  addItem: (i: PantryItem) => void;
  removeItem: (id: string) => Promise<void>;
  toggleReminder: (id: string) => Promise<void>;
  addShop: (s: Omit<ShopItem, "id" | "done">) => void;
  toggleShop: (id: string) => void;
  markRead: (id?: string) => void;
  addHistory: (h: ScanRecord) => void;
  dark: boolean;
  setDark: (v: boolean) => void;
  syncPantryDb: () => void;
  sendWhatsAppNotification: (item: PantryItem) => Promise<any>;
  syncCalendarNotification: (item: PantryItem) => Promise<any>;
}

const Ctx = createContext<Store | null>(null);
const KEY = "smart-pantry-v1";

function mapDbToPantryItem(dbItem: any): PantryItem {
  return {
    id: dbItem.id || crypto.randomUUID(),
    name: dbItem.name || "Food Item",
    category: dbItem.category || "Other",
    quantity: typeof dbItem.quantity === "number" ? `${dbItem.quantity} ${dbItem.unit || 'pcs'}` : (dbItem.quantity || "1 pcs"),
    freshness: dbItem.freshnessScore !== undefined ? dbItem.freshnessScore : (dbItem.freshness ?? 85),
    addedDaysAgo: dbItem.addedDaysAgo ?? 0,
    expiresInDays: dbItem.daysRemaining !== undefined ? dbItem.daysRemaining : (dbItem.expiresInDays ?? 3),
    storage: (dbItem.storageCondition === "fridge" || dbItem.storage === "Refrigerator") ? "Refrigerator" : 
             (dbItem.storageCondition === "freezer" || dbItem.storage === "Freezer") ? "Freezer" :
             (dbItem.storageCondition === "ambient" || dbItem.storage === "Pantry shelf") ? "Pantry shelf" : "Counter",
    image: dbItem.image,
    notes: dbItem.notes || dbItem.storageRecommendation,
    allergens: dbItem.allergens || [],
    nutrition: dbItem.nutrition || { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, nutrients: [] },
    reminder: !!(dbItem.googleCalendarEventId || dbItem.calendarEventId || dbItem.reminder),
    lowStock: dbItem.lowStock || false,
    googleCalendarEventId: dbItem.googleCalendarEventId || dbItem.calendarEventId,
    calendarEventId: dbItem.calendarEventId || dbItem.googleCalendarEventId,
    googleCalendarId: dbItem.googleCalendarId || "primary",
    calendarSyncStatus: dbItem.calendarSyncStatus || "NOT_SYNCED",
    calendarHtmlLink: dbItem.calendarHtmlLink,
    whatsappMessageId: dbItem.whatsappMessageId,
    whatsappStatus: dbItem.whatsappStatus,
    lastAiScanAt: dbItem.lastAiScanAt,
    visualScanNotes: dbItem.visualScanNotes || dbItem.visualNotes,
    consumeByDate: dbItem.consumeByDate || dbItem.expiryDate,
    spoilageRisk: dbItem.spoilageRisk,
    storageRecommendation: dbItem.storageRecommendation
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

  const syncPantryDb = () => {
    try {
      const dbItems = pantryDb.getItems();
      setItems(dbItems ? dbItems.map(mapDbToPantryItem) : []);
    } catch (e) {
      console.warn("Could not sync from pantryDb:", e);
    }
  };

  const loadUserData = () => {
    try {
      const dbItems = pantryDb.getItems();
      setItems(dbItems ? dbItems.map(mapDbToPantryItem) : []);

      const key = getStoreKey();
      const raw = localStorage.getItem(key);
      if (raw) {
        const s = JSON.parse(raw);
        setShopping(s.shopping || seedShopping);
        setNotifs(s.notifs || seedNotifs);
        setHistory(s.history || seedHistory);
        if (typeof s.dark === "boolean") setDark(s.dark);
      } else {
        setShopping(seedShopping);
        setNotifs(seedNotifs);
        setHistory(seedHistory);
      }
    } catch { /* ignore */ }
    setLoaded(true);
  };

  useEffect(() => {
    loadUserData();
    startScheduledReminderDaemon(60000);

    const handleStorageChange = () => {
      loadUserData();
    };
    window.addEventListener("storage", handleStorageChange);

    return () => {
      stopScheduledReminderDaemon();
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const key = getStoreKey();
    localStorage.setItem(key, JSON.stringify({ shopping, notifs, history, dark }));
  }, [shopping, notifs, history, dark, loaded]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const sendWhatsAppNotification = async (item: PantryItem) => {
    const res = await sendWhatsAppAlert({
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      daysRemaining: item.expiresInDays,
      consumeByDate: item.consumeByDate || new Date().toISOString().split("T")[0],
      status: item.expiresInDays <= 0 ? "expired" : item.expiresInDays <= 3 ? "soon" : "fresh",
      storageCondition: item.storage,
      storageRecommendation: item.storageRecommendation || item.notes || "Keep refrigerated",
      freshnessScore: item.freshness,
      nutrition: item.nutrition
    }, { alertType: "NEW_PRODUCT" });
    if (res.success && res.messageId) {
      pantryDb.updateItem(item.id, {
        whatsappMessageId: res.messageId,
        whatsappStatus: "DELIVERED_SUCCESSFULLY",
        lastAlertSentAt: new Date().toISOString()
      }, false);
      syncPantryDb();
    }
    return res;
  };

  const syncCalendarNotification = async (item: PantryItem) => {
    const dbItem = {
      ...item,
      daysRemaining: item.expiresInDays,
      consumeByDate: item.consumeByDate || new Date().toISOString().split("T")[0],
      googleCalendarId: item.googleCalendarId || "primary",
      googleCalendarEventId: item.googleCalendarEventId || item.calendarEventId
    };
    const res = await updateCalendarEvent(dbItem);
    if (res.success) {
      pantryDb.updateItem(item.id, {
        googleCalendarEventId: res.googleCalendarSoonEventId || res.googleCalendarExpiryEventId || res.googleCalendarEventId,
        calendarEventId: res.googleCalendarSoonEventId || res.googleCalendarExpiryEventId || res.googleCalendarEventId,
        calendarSyncStatus: "SYNCED",
        calendarLastSyncedAt: new Date().toISOString()
      }, false);
      syncPantryDb();
    }
    return res;
  };

  const addItemHandler = (i: PantryItem) => {
    const consumeByDate = i.consumeByDate || (i.expiresInDays !== undefined ? new Date(Date.now() + i.expiresInDays * 864e5).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]);
    const dbFormat = {
      id: i.id,
      name: i.name,
      category: i.category,
      quantity: i.quantity,
      freshnessScore: i.freshness,
      daysRemaining: i.expiresInDays,
      consumeByDate,
      expiryDate: consumeByDate,
      storageCondition: i.storage.toLowerCase().includes("refrigerator") ? "fridge" : i.storage.toLowerCase().includes("freezer") ? "freezer" : "ambient",
      image: i.image,
      notes: i.notes,
      allergens: i.allergens,
      nutrition: i.nutrition,
      googleCalendarEventId: i.googleCalendarEventId || i.calendarEventId,
      calendarEventId: i.calendarEventId || i.googleCalendarEventId,
    };
    pantryDb.addItem(dbFormat, true);
    setItems((p) => [i, ...p.filter((x) => x.id !== i.id)]);

    // Automatically generate Google Calendar Event & WhatsApp Alert based on shelf life
    syncCalendarNotification(i).catch((err) => console.warn("Auto calendar sync note:", err));
    sendWhatsAppNotification(i).catch((err) => console.warn("Auto whatsapp alert note:", err));
  };

  const removeItemHandler = async (id: string) => {
    await pantryDb.deleteItemWithCalendarSync(id);
    setItems((p) => p.filter((x) => x.id !== id));
  };

  const toggleReminderHandler = async (id: string) => {
    const item = items.find((x) => x.id === id);
    if (!item) return;

    const newReminder = !item.reminder;
    setItems((p) => p.map((x) => (x.id === id ? { ...x, reminder: newReminder } : x)));

    if (newReminder) {
      await syncCalendarNotification(item);
      await sendWhatsAppNotification(item);
    } else if (item.googleCalendarEventId || item.calendarEventId) {
      await deleteCalendarEvent({
        id: item.id,
        googleCalendarEventId: item.googleCalendarEventId || item.calendarEventId,
        googleCalendarSoonEventId: item.googleCalendarEventId || item.calendarEventId,
        googleCalendarExpiryEventId: item.googleCalendarEventId || item.calendarEventId
      });
      pantryDb.updateItem(id, {
        calendarSyncStatus: "NOT_SYNCED",
        googleCalendarEventId: null,
        calendarEventId: null
      }, false);
    }
  };

  const value = useMemo<Store>(() => ({
    items, shopping, notifs, history, dark, setDark, syncPantryDb,
    sendWhatsAppNotification, syncCalendarNotification,
    addItem: addItemHandler,
    removeItem: removeItemHandler,
    toggleReminder: toggleReminderHandler,
    addShop: (s) => setShopping((p) => p.some((x) => x.name === s.name && !x.done) ? p : [{ ...s, id: crypto.randomUUID(), done: false }, ...p]),
    toggleShop: (id) => setShopping((p) => p.map((x) => (x.id === id ? { ...x, done: !x.done } : x))),
    markRead: (id) => setNotifs((p) => p.map((x) => (!id || x.id === id ? { ...x, read: true } : x))),
    addHistory: (h) => setHistory((p) => [h, ...p]),
  }), [items, shopping, notifs, history, dark]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePantry() {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePantry outside provider");
  return c;
}
