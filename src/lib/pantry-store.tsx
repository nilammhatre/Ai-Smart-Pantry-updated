import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  seedPantry, seedShopping, seedNotifs, seedHistory,
  type PantryItem, type ShopItem, type Notif, type ScanRecord,
} from "./pantry-data";

interface Store {
  items: PantryItem[];
  shopping: ShopItem[];
  notifs: Notif[];
  history: ScanRecord[];
  addItem: (i: PantryItem) => void;
  removeItem: (id: string) => void;
  toggleReminder: (id: string) => void;
  addShop: (s: Omit<ShopItem, "id" | "done">) => void;
  toggleShop: (id: string) => void;
  markRead: (id?: string) => void;
  addHistory: (h: ScanRecord) => void;
  dark: boolean;
  setDark: (v: boolean) => void;
}

const Ctx = createContext<Store | null>(null);
const KEY = "smart-pantry-v1";

export function PantryProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState(seedPantry);
  const [shopping, setShopping] = useState(seedShopping);
  const [notifs, setNotifs] = useState(seedNotifs);
  const [history, setHistory] = useState(seedHistory);
  const [dark, setDark] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.items) setItems(s.items);
        if (s.shopping) setShopping(s.shopping);
        if (s.notifs) setNotifs(s.notifs);
        if (s.history) setHistory(s.history);
        if (typeof s.dark === "boolean") setDark(s.dark);
      }
    } catch { /* ignore */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(KEY, JSON.stringify({ items, shopping, notifs, history, dark }));
  }, [items, shopping, notifs, history, dark, loaded]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const value = useMemo<Store>(() => ({
    items, shopping, notifs, history, dark, setDark,
    addItem: (i) => setItems((p) => [i, ...p.filter((x) => x.id !== i.id)]),
    removeItem: (id) => setItems((p) => p.filter((x) => x.id !== id)),
    toggleReminder: (id) => setItems((p) => p.map((x) => (x.id === id ? { ...x, reminder: !x.reminder } : x))),
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
