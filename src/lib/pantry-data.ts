import tomatoes from "@/assets/food/tomatoes.jpg";
import milk from "@/assets/food/milk.jpg";
import spinach from "@/assets/food/spinach.jpg";
import apples from "@/assets/food/apples.jpg";
import bananas from "@/assets/food/bananas.jpg";
import rice from "@/assets/food/rice.jpg";
import paneer from "@/assets/food/paneer.jpg";
import eggs from "@/assets/food/eggs.jpg";
import potatoes from "@/assets/food/potatoes.jpg";
import palakPaneer from "@/assets/recipe/palak-paneer.jpg";
import alooTamatar from "@/assets/recipe/aloo-tamatar.jpg";
import smoothie from "@/assets/recipe/smoothie-bowl.jpg";
import omelette from "@/assets/recipe/masala-omelette.jpg";

export const foodImages = { tomatoes, milk, spinach, apples, bananas, rice, paneer, eggs, potatoes };

export type Category =
  | "Fruits" | "Vegetables" | "Dairy" | "Meat" | "Fish" | "Grains" | "Packaged Food" | "Other";
export const categories: Category[] = ["Fruits", "Vegetables", "Dairy", "Meat", "Fish", "Grains", "Packaged Food", "Other"];

export type Storage = "Refrigerator" | "Freezer" | "Pantry shelf" | "Counter" | "Pantry";
export type Status = "Fresh" | "Good" | "Use Soon" | "Expired" | "Spoiled";

export interface Nutrition { calories: number; protein: number; carbs: number; fat: number; fiber: number; nutrients: string[] }

export interface PantryItem {
  id: string;
  name: string;
  category: Category;
  quantity: string;
  freshness: number;
  addedDaysAgo: number;
  expiresInDays: number;
  storage: Storage;
  image?: string;
  notes?: string;
  allergens: string[];
  nutrition: Nutrition;
  reminder?: boolean;
  lowStock?: boolean;
  googleCalendarEventId?: string;
  calendarEventId?: string;
  googleCalendarId?: string;
  calendarSyncStatus?: string;
  calendarLastSyncedAt?: string;
  googleCalendarError?: string;
  calendarHtmlLink?: string;
  whatsappMessageId?: string;
  whatsappStatus?: string;
  whatsappLastSentAt?: string;
  lastAiScanAt?: string;
  visualScanNotes?: string;
  consumeByDate?: string;
  purchaseDate?: string;
  printedExpiryDate?: string | null;
  estimatedConsumeByDate?: string;
  isVerifiedExpiry?: boolean;
  spoilageStatus?: string;
  spoilageRisk?: string;
  hasCriticalSpoilage?: boolean;
  requiresConfirmation?: boolean;
  storageRecommendation?: string;
  nextAlertDate?: string | null;
  scanMetadata?: any;
  status?: "active" | "consumed" | "discarded" | string;
  expiry_date?: string;
  days_left?: number;
}

export type ExpiryCategory = "Expired Items" | "Expiring Today" | "Expiring in 1–3 Days" | "Fresh Stock";

/**
 * Deterministic Expiry Calculation:
 * Calculate days_left = Math.ceil((new Date(item.expiry_date) - new Date()) / 86400000)
 */
export function calculateDaysLeft(expiryDateStr?: string | null, fallbackDays?: number): number {
  if (!expiryDateStr) return typeof fallbackDays === "number" ? fallbackDays : 3;
  try {
    const expDate = new Date(expiryDateStr.includes("T") ? expiryDateStr : `${expiryDateStr}T23:59:59`);
    const now = new Date();
    const diff = Math.ceil((expDate.getTime() - now.getTime()) / 86400000);
    return isNaN(diff) ? (typeof fallbackDays === "number" ? fallbackDays : 3) : diff;
  } catch {
    return typeof fallbackDays === "number" ? fallbackDays : 3;
  }
}

export function getDeterministicDaysLeft(item: { expiry_date?: string; consumeByDate?: string; expiresInDays?: number; days_left?: number }): number {
  if (item.expiry_date) {
    return calculateDaysLeft(item.expiry_date, item.expiresInDays);
  }
  if (item.consumeByDate) {
    return calculateDaysLeft(item.consumeByDate, item.expiresInDays);
  }
  if (typeof item.days_left === "number" && !isNaN(item.days_left)) {
    return item.days_left;
  }
  return typeof item.expiresInDays === "number" ? item.expiresInDays : 3;
}

export function getExpiryCategory(daysLeft: number): ExpiryCategory {
  if (daysLeft < 0) return "Expired Items";
  if (daysLeft === 0) return "Expiring Today";
  if (daysLeft <= 3) return "Expiring in 1–3 Days";
  return "Fresh Stock";
}

export function getExpiryBadge(daysLeft: number): { text: string; color: string; badgeClass: string } {
  if (daysLeft < 0) {
    return {
      text: "Expired (Discard)",
      color: "red",
      badgeClass: "bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30"
    };
  }
  if (daysLeft === 0) {
    return {
      text: "Use Immediately",
      color: "orange",
      badgeClass: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border border-orange-500/30"
    };
  }
  if (daysLeft <= 3) {
    return {
      text: "Expiring in 1–3 Days",
      color: "amber",
      badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"
    };
  }
  return {
    text: "Fresh Stock",
    color: "emerald",
    badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
  };
}

export function statusFor(freshness: number, days: number): Status {
  if (days < 0) return "Expired";
  if (freshness < 30) return "Spoiled";
  if (days <= 2 || freshness < 60) return "Use Soon";
  if (freshness < 85) return "Good";
  return "Fresh";
}

export function dateFromNow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function dateToIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export function daysLabel(days: number) {
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Expires today (Use now)";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

const n = (calories: number, protein: number, carbs: number, fat: number, fiber: number, nutrients: string[]): Nutrition =>
  ({ calories, protein, carbs, fat, fiber, nutrients });

export const seedPantry: PantryItem[] = [
  { id: "tomatoes", name: "Tomatoes", category: "Vegetables", quantity: "6 pcs", freshness: 92, addedDaysAgo: 2, expiresInDays: 3, days_left: 3, expiry_date: dateToIso(3), consumeByDate: dateToIso(3), storage: "Counter", image: tomatoes, allergens: [], nutrition: n(18, 0.9, 3.9, 0.2, 1.2, ["Vitamin C", "Lycopene", "Potassium"]), reminder: true, isVerifiedExpiry: false },
  { id: "milk", name: "Amul Toned Milk", category: "Dairy", quantity: "1 litre", freshness: 74, addedDaysAgo: 3, expiresInDays: 2, days_left: 2, expiry_date: dateToIso(2), consumeByDate: dateToIso(2), storage: "Refrigerator", image: milk, allergens: ["Milk"], nutrition: n(58, 3.1, 4.8, 3, 0, ["Calcium", "Vitamin B12", "Vitamin D"]), reminder: true, isVerifiedExpiry: true },
  { id: "spinach", name: "Spinach", category: "Vegetables", quantity: "1 bunch", freshness: 58, addedDaysAgo: 4, expiresInDays: 0, days_left: 0, expiry_date: dateToIso(0), consumeByDate: dateToIso(0), storage: "Refrigerator", image: spinach, allergens: [], nutrition: n(23, 2.9, 3.6, 0.4, 2.2, ["Iron", "Vitamin K", "Folate"]), isVerifiedExpiry: false },
  { id: "apples", name: "Shimla Apples", category: "Fruits", quantity: "4 pcs", freshness: 94, addedDaysAgo: 1, expiresInDays: 6, days_left: 6, expiry_date: dateToIso(6), consumeByDate: dateToIso(6), storage: "Refrigerator", image: apples, allergens: [], nutrition: n(52, 0.3, 14, 0.2, 2.4, ["Vitamin C", "Polyphenols"]), isVerifiedExpiry: false },
  { id: "bananas", name: "Bananas", category: "Fruits", quantity: "5 pcs", freshness: 66, addedDaysAgo: 3, expiresInDays: 1, days_left: 1, expiry_date: dateToIso(1), consumeByDate: dateToIso(1), storage: "Counter", image: bananas, allergens: [], nutrition: n(89, 1.1, 23, 0.3, 2.6, ["Potassium", "Vitamin B6"]), isVerifiedExpiry: false },
  { id: "rice", name: "Basmati Rice", category: "Grains", quantity: "500 g", freshness: 98, addedDaysAgo: 20, expiresInDays: 120, days_left: 120, expiry_date: dateToIso(120), consumeByDate: dateToIso(120), storage: "Pantry shelf", image: rice, allergens: [], nutrition: n(130, 2.7, 28, 0.3, 0.4, ["Manganese", "Selenium"]), lowStock: true, isVerifiedExpiry: true },
  { id: "paneer", name: "Fresh Paneer", category: "Dairy", quantity: "200 g", freshness: 81, addedDaysAgo: 2, expiresInDays: 3, days_left: 3, expiry_date: dateToIso(3), consumeByDate: dateToIso(3), storage: "Refrigerator", image: paneer, allergens: ["Milk"], nutrition: n(290, 19, 3, 22, 0, ["Calcium", "Protein", "Phosphorus", "Vitamin B12"]), isVerifiedExpiry: true },
  { id: "eggs", name: "Farm Eggs", category: "Other", quantity: "8 pcs", freshness: 88, addedDaysAgo: 5, expiresInDays: 9, days_left: 9, expiry_date: dateToIso(9), consumeByDate: dateToIso(9), storage: "Refrigerator", image: eggs, allergens: ["Eggs"], nutrition: n(155, 13, 1.1, 11, 0, ["Vitamin B12", "Choline"]), isVerifiedExpiry: true },
  { id: "potatoes", name: "Potatoes", category: "Vegetables", quantity: "1 kg", freshness: 90, addedDaysAgo: 6, expiresInDays: 14, days_left: 14, expiry_date: dateToIso(14), consumeByDate: dateToIso(14), storage: "Pantry shelf", image: potatoes, allergens: [], nutrition: n(77, 2, 17, 0.1, 2.2, ["Vitamin C", "Potassium"]), isVerifiedExpiry: false },
  { id: "bread", name: "Whole Wheat Bread", category: "Packaged Food", quantity: "1 loaf", freshness: 88, addedDaysAgo: 1, expiresInDays: 4, days_left: 4, expiry_date: dateToIso(4), consumeByDate: dateToIso(4), storage: "Counter", allergens: ["Gluten", "Soy"], nutrition: n(247, 13, 41, 3.4, 7, ["Fiber", "Iron"]), hasCriticalSpoilage: false, spoilageStatus: "FRESH", isVerifiedExpiry: true },
  { id: "curd", name: "Homemade Curd", category: "Dairy", quantity: "400 g", freshness: 70, addedDaysAgo: 2, expiresInDays: 4, days_left: 4, expiry_date: dateToIso(4), consumeByDate: dateToIso(4), storage: "Refrigerator", allergens: ["Milk"], nutrition: n(61, 3.5, 4.7, 3.3, 0, ["Probiotics", "Calcium"]), isVerifiedExpiry: false },
  { id: "almonds", name: "Almonds", category: "Packaged Food", quantity: "250 g", freshness: 96, addedDaysAgo: 10, expiresInDays: 90, days_left: 90, expiry_date: dateToIso(90), consumeByDate: dateToIso(90), storage: "Pantry shelf", allergens: ["Nuts"], nutrition: n(579, 21, 22, 50, 12.5, ["Vitamin E", "Magnesium"]), isVerifiedExpiry: true },
];

export interface Recipe {
  id: string; name: string; image: string; time: number; difficulty: "Easy" | "Medium" | "Hard";
  tags: string[]; uses: string[]; missing: string[]; steps: string[];
  nutrition: { calories: number; protein: number; carbs: number; fat: number };
  cost: number; wasteSaved: number;
}

export const recipes: Recipe[] = [
  { id: "palak-paneer", name: "Palak Paneer", image: palakPaneer, time: 35, difficulty: "Medium", tags: ["Vegetarian", "Indian", "Dinner", "Lunch"], uses: ["spinach", "paneer", "tomatoes", "milk"], missing: ["Fresh cream"], steps: ["Blanch spinach for 2 minutes, then plunge into cold water.", "Blend spinach into a smooth purée.", "Sauté cumin, garlic, onion and chopped tomatoes until soft.", "Add the purée, a splash of milk and simmer 5 minutes.", "Fold in paneer cubes, finish with cream and garam masala."], nutrition: { calories: 340, protein: 18, carbs: 12, fat: 24 }, cost: 60, wasteSaved: 180 },
  { id: "aloo-tamatar", name: "Aloo Tamatar Sabzi", image: alooTamatar, time: 25, difficulty: "Easy", tags: ["Vegetarian", "Vegan", "Indian", "Lunch", "Dinner", "Quick meals"], uses: ["potatoes", "tomatoes"], missing: ["Fresh coriander"], steps: ["Dice potatoes and tomatoes.", "Temper mustard seeds, cumin and green chilli in oil.", "Add tomatoes, turmeric and chilli; cook to a soft masala.", "Add potatoes and ½ cup water, cover and cook 12 minutes.", "Garnish with coriander and serve with roti."], nutrition: { calories: 210, protein: 4, carbs: 32, fat: 8 }, cost: 35, wasteSaved: 90 },
  { id: "smoothie-bowl", name: "Banana Apple Smoothie Bowl", image: smoothie, time: 10, difficulty: "Easy", tags: ["Vegetarian", "Breakfast", "Quick meals", "Snacks"], uses: ["bananas", "apples", "curd", "almonds"], missing: ["Rolled oats"], steps: ["Blend bananas with curd until thick.", "Pour into a bowl.", "Top with sliced apple, chopped almonds and oats."], nutrition: { calories: 290, protein: 9, carbs: 48, fat: 8 }, cost: 40, wasteSaved: 70 },
  { id: "masala-omelette", name: "Spinach Masala Omelette", image: omelette, time: 12, difficulty: "Easy", tags: ["Vegetarian", "Indian", "Breakfast", "Quick meals"], uses: ["eggs", "spinach", "tomatoes"], missing: [], steps: ["Whisk eggs with salt, pepper and turmeric.", "Fold in chopped spinach, tomato and onion.", "Cook on a buttered pan over medium heat, fold and serve."], nutrition: { calories: 240, protein: 16, carbs: 5, fat: 17 }, cost: 30, wasteSaved: 60 },
];

export interface ShopItem { id: string; name: string; qty: string; category: Category; priority: "High" | "Medium" | "Low"; section: "Need Now" | "Running Low" | "Suggested" | "Recently Purchased"; done: boolean; reason?: string }

export const seedShopping: ShopItem[] = [
  { id: "s1", name: "Whole Wheat Bread", qty: "1 loaf", category: "Packaged Food", priority: "High", section: "Need Now", done: false, reason: "Current loaf expired" },
  { id: "s2", name: "Fresh cream", qty: "200 ml", category: "Dairy", priority: "Medium", section: "Need Now", done: false, reason: "Missing for Palak Paneer" },
  { id: "s3", name: "Basmati Rice", qty: "2 kg", category: "Grains", priority: "High", section: "Running Low", done: false, reason: "Only 500 g left" },
  { id: "s4", name: "Onions", qty: "1 kg", category: "Vegetables", priority: "Medium", section: "Running Low", done: false },
  { id: "s5", name: "Rolled oats", qty: "500 g", category: "Grains", priority: "Low", section: "Suggested", done: false, reason: "Bought every 2 weeks" },
  { id: "s6", name: "Fresh coriander", qty: "1 bunch", category: "Vegetables", priority: "Low", section: "Suggested", done: false, reason: "Missing for 2 recipes" },
  { id: "s7", name: "Bananas", qty: "6 pcs", category: "Fruits", priority: "Low", section: "Recently Purchased", done: true },
  { id: "s8", name: "Shimla Apples", qty: "4 pcs", category: "Fruits", priority: "Low", section: "Recently Purchased", done: true },
];

export type NotifCat = "Expiry" | "Freshness" | "Pantry" | "Recipes" | "Shopping" | "System";
export interface Notif {
  id: string;
  cat: NotifCat;
  text: string;
  time: string;
  read: boolean;
  priority?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  foodId?: string;
  actionUrl?: string;
  dismissed?: boolean;
}

export const seedNotifs: Notif[] = [
  { id: "n1", cat: "Expiry", text: "Spinach should be consumed today.", time: "10 min ago", read: false },
  { id: "n2", cat: "Expiry", text: "Milk expires in 2 days.", time: "1 h ago", read: false },
  { id: "n3", cat: "Recipes", text: "You have enough ingredients for 3 recipes.", time: "3 h ago", read: false },
  { id: "n4", cat: "Shopping", text: "Your rice stock is running low.", time: "Yesterday", read: true },
  { id: "n5", cat: "Freshness", text: "Bananas are ripening fast — use within a day.", time: "Yesterday", read: false },
  { id: "n6", cat: "System", text: "Weekly waste report is ready.", time: "2 days ago", read: true },
];

export interface ScanRecord { id: string; name: string; image?: string; date: string; freshness: number; result: string; action: string; method: "Photo" | "Label" | "Barcode" }
export const seedHistory: ScanRecord[] = [
  { id: "h1", name: "Tomatoes", image: tomatoes, date: "Today, 9:12 AM", freshness: 92, result: "Fresh · no bruising", action: "Added to pantry", method: "Photo" },
  { id: "h2", name: "Amul Toned Milk", image: milk, date: "Yesterday, 7:40 PM", freshness: 74, result: "Expiry read from label", action: "Added to pantry", method: "Label" },
  { id: "h3", name: "Bananas", image: bananas, date: "29 Sep, 6:05 PM", freshness: 66, result: "Ripe · light spotting", action: "Added to pantry", method: "Photo" },
  { id: "h4", name: "Apples", image: apples, date: "28 Sep, 11:20 AM", freshness: 94, result: "Fresh · firm skin", action: "Added to pantry", method: "Photo" },
  { id: "h5", name: "Whole Wheat Bread", date: "27 Sep, 8:00 AM", freshness: 22, result: "Mold spots detected", action: "Discarded", method: "Photo" },
  { id: "h6", name: "Almonds", date: "23 Sep, 5:30 PM", freshness: 96, result: "Barcode matched", action: "Added to pantry", method: "Barcode" },
];

export const shelfLifeGuess: Record<string, [number, number]> = {
  Fruits: [4, 7], Vegetables: [3, 6], Dairy: [3, 5], Meat: [1, 3], Fish: [1, 2], Grains: [90, 180], "Packaged Food": [30, 120], Other: [5, 10],
};
