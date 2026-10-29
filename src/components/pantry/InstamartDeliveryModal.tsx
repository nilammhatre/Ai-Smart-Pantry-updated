import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { usePantry } from "@/lib/pantry-store";
import { swiggyService } from "@/services/swiggy/swiggyService";
import { normalizeSwiggyItem } from "@/services/swiggy/normalizer";
import { calculateShelfLife } from "@/services/shelfLifeEngine";
import { type Category, type Storage, type PantryItem } from "@/lib/pantry-data";
import { toast } from "sonner";
import {
  ShoppingBag,
  Sparkles,
  Calendar,
  Warehouse,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Ban,
  ArrowRight,
  ShieldCheck,
  RefreshCw
} from "lucide-react";

interface NormalizedItemState {
  id: string;
  originalName: string;
  name: string;
  quantity: number;
  unit: string;
  category: Category;
  isFood: boolean;
  price: number;
  selected: boolean;
  shelfLifeDays: number;
  expiryDate: string;
  storage: Storage;
}

function getDefaultShelfLifeAndStorage(
  name: string,
  category: string
): { days: number; storage: Storage; cat: Category } {
  const normName = (name || "").toLowerCase();
  const normCat = (category || "").toLowerCase();

  let cat: Category = "Packaged Food";
  let storage: Storage = "Pantry shelf";
  let days = 7;

  if (normCat.includes("veg") || normName.includes("tomato") || normName.includes("spinach") || normName.includes("potato") || normName.includes("onion")) {
    cat = "Vegetables";
    days = normName.includes("spinach") || normName.includes("palak") ? 4 : normName.includes("potato") || normName.includes("onion") ? 21 : 6;
    storage = normName.includes("potato") || normName.includes("onion") ? "Pantry shelf" : "Refrigerator";
  } else if (normCat.includes("fruit") || normName.includes("apple") || normName.includes("banana") || normName.includes("mango")) {
    cat = "Fruits";
    days = normName.includes("banana") ? 5 : normName.includes("apple") ? 14 : 7;
    storage = normName.includes("banana") ? "Counter" : "Refrigerator";
  } else if (normCat.includes("dairy") || normName.includes("milk") || normName.includes("paneer") || normName.includes("curd") || normName.includes("cheese")) {
    cat = "Dairy";
    days = normName.includes("milk") ? 4 : normName.includes("paneer") ? 4 : 5;
    storage = "Refrigerator";
  } else if (normCat.includes("meat") || normCat.includes("egg") || normName.includes("egg") || normName.includes("chicken")) {
    cat = normName.includes("egg") ? "Dairy" : "Meat";
    days = normName.includes("egg") ? 14 : 3;
    storage = "Refrigerator";
  } else if (normCat.includes("grain") || normCat.includes("atta") || normCat.includes("rice") || normCat.includes("dal")) {
    cat = "Grains";
    days = 90;
    storage = "Pantry shelf";
  } else if (normCat.includes("bakery") || normName.includes("bread") || normName.includes("pav") || normName.includes("bun")) {
    cat = "Packaged Food";
    days = 4;
    storage = "Pantry shelf";
  }

  // Double check with shelfLifeEngine if available
  try {
    const calc = calculateShelfLife({
      name,
      category: cat,
      storageCondition: storage === "Refrigerator" ? "fridge" : storage === "Freezer" ? "freezer" : "ambient",
      receivedAt: new Date().toISOString()
    });
    if (calc && calc.adjustedShelfLifeDays) {
      days = Math.max(1, Math.round(calc.adjustedShelfLifeDays));
    }
  } catch {}

  return { days, storage, cat };
}

export function InstamartDeliveryModal() {
  const { addItems, syncPantryDb } = usePantry();
  const [open, setOpen] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<any>(null);
  const [itemsState, setItemsState] = useState<NormalizedItemState[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Poll for delivered orders that have not been imported yet
  const checkForDeliveredOrders = useCallback(() => {
    if (typeof window === "undefined") return;
    const pendingOrders = swiggyService.getPendingDeliveredOrders();
    if (pendingOrders.length > 0 && !open) {
      const targetOrder = pendingOrders[0];
      initModalWithOrder(targetOrder);
    }
  }, [open]);

  const initModalWithOrder = (order: any) => {
    setCurrentOrder(order);

    const rawItems: any[] = order.items || [];
    const formatted: NormalizedItemState[] = rawItems.map((raw, idx) => {
      const normalized = normalizeSwiggyItem(raw);
      const { days, storage, cat } = getDefaultShelfLifeAndStorage(normalized.name, normalized.category);

      const expDate = new Date();
      expDate.setDate(expDate.getDate() + days);

      return {
        id: `im_item_${order.orderId}_${idx}`,
        originalName: raw.name,
        name: normalized.name,
        quantity: normalized.quantity || 1,
        unit: normalized.unit || "unit",
        category: cat,
        isFood: normalized.isFood,
        price: normalized.price || 0,
        selected: normalized.isFood, // checked by default if food, unchecked if non-food
        shelfLifeDays: days,
        expiryDate: expDate.toISOString().split("T")[0],
        storage
      };
    });

    setItemsState(formatted);
    setOpen(true);
  };

  useEffect(() => {
    // Initial check
    checkForDeliveredOrders();

    // Listen for custom order changes
    const handleOrderChange = () => {
      checkForDeliveredOrders();
    };

    window.addEventListener("swiggy_orders_changed", handleOrderChange);
    const interval = setInterval(checkForDeliveredOrders, 4000);

    return () => {
      window.removeEventListener("swiggy_orders_changed", handleOrderChange);
      clearInterval(interval);
    };
  }, [checkForDeliveredOrders]);

  const toggleItemSelection = (id: string) => {
    setItemsState((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  const updateItemStorage = (id: string, storage: Storage) => {
    setItemsState((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        // recalculate days for new storage
        try {
          const calc = calculateShelfLife({
            name: item.name,
            category: item.category,
            storageCondition: storage === "Refrigerator" ? "fridge" : storage === "Freezer" ? "freezer" : "ambient",
            receivedAt: new Date().toISOString()
          });
          const newDays = calc?.adjustedShelfLifeDays ? Math.max(1, Math.round(calc.adjustedShelfLifeDays)) : item.shelfLifeDays;
          const exp = new Date();
          exp.setDate(exp.getDate() + newDays);
          return {
            ...item,
            storage,
            shelfLifeDays: newDays,
            expiryDate: exp.toISOString().split("T")[0]
          };
        } catch {
          return { ...item, storage };
        }
      })
    );
  };

  const updateItemDays = (id: string, daysStr: string) => {
    const days = parseInt(daysStr, 10) || 1;
    setItemsState((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const exp = new Date();
        exp.setDate(exp.getDate() + days);
        return {
          ...item,
          shelfLifeDays: days,
          expiryDate: exp.toISOString().split("T")[0]
        };
      })
    );
  };

  const handleSelectAllFood = (check: boolean) => {
    setItemsState((prev) =>
      prev.map((item) => (item.isFood ? { ...item, selected: check } : item))
    );
  };

  const selectedCount = useMemo(() => itemsState.filter((i) => i.selected && i.isFood).length, [itemsState]);
  const nonFoodCount = useMemo(() => itemsState.filter((i) => !i.isFood).length, [itemsState]);

  const handleConfirmImport = async () => {
    if (!currentOrder) return;
    const toImport = itemsState.filter((i) => i.selected && i.isFood);

    if (toImport.length === 0) {
      toast.info("Please select at least one food item to add to your pantry.");
      return;
    }

    setIsSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const nowDate = nowIso.split("T")[0];

      const pantryItems: PantryItem[] = toImport.map((i) => ({
        id: crypto.randomUUID(),
        name: i.name,
        category: i.category,
        quantity: `${i.quantity} ${i.unit}`,
        freshness: 95,
        addedDaysAgo: 0,
        expiresInDays: i.shelfLifeDays,
        days_left: i.shelfLifeDays,
        storage: i.storage,
        expiry_date: i.expiryDate,
        consumeByDate: i.expiryDate,
        purchaseDate: nowDate,
        receivedAt: nowIso,
        orderId: currentOrder.orderId,
        source: "Swiggy Instamart",
        allergens: [],
        nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, nutrients: [] },
        reminder: true,
        scanMetadata: {
          source: "instamart_import",
          orderId: currentOrder.orderId,
          shelfLifeDays: i.shelfLifeDays
        }
      }));

      // 1. Add directly to React Context PantryProvider
      await addItems(pantryItems);

      // 2. Mark order as imported to prevent duplicate prompts
      swiggyService.markOrderImported(currentOrder.orderId);

      // 3. Sync database & update
      syncPantryDb();

      toast.success(
        `🎉 Added ${pantryItems.length} Instamart food item${pantryItems.length > 1 ? "s" : ""} to Smart Pantry!`,
        {
          description: "Smart shelf-life tracking, expiry calendar reminders, and WhatsApp alerts scheduled."
        }
      );

      setOpen(false);
      setCurrentOrder(null);
    } catch (err: any) {
      toast.error(`Failed to import items: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDismissOrder = () => {
    if (currentOrder?.orderId) {
      swiggyService.markOrderImported(currentOrder.orderId);
    }
    setOpen(false);
    setCurrentOrder(null);
    toast.info("Order import skipped.");
  };

  if (!open || !currentOrder) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-3xl border-border bg-card">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-orange-500 p-5 text-white">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center text-2xl shadow-inner shrink-0">
                🛵
              </div>
              <div>
                <DialogTitle className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                  Swiggy Instamart Order Delivered!
                  <span className="inline-flex items-center rounded-full bg-emerald-500/90 text-white text-[11px] font-bold px-2 py-0.5">
                    Order #{currentOrder.orderId}
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs text-white/90 mt-0.5">
                  Your order has arrived! Confirm the grocery items and storage locations below to add them to your pantry.
                </DialogDescription>
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-foreground">
                Food & Grocery Items ({itemsState.filter((i) => i.isFood).length})
              </span>
              {nonFoodCount > 0 && (
                <span className="text-[11px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full font-medium">
                  {nonFoodCount} non-food item{nonFoodCount > 1 ? "s" : ""} auto-excluded
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => handleSelectAllFood(true)}
                className="text-primary hover:underline font-semibold"
              >
                Select all food
              </button>
              <span className="text-muted-foreground">·</span>
              <button
                type="button"
                onClick={() => handleSelectAllFood(false)}
                className="text-muted-foreground hover:underline"
              >
                Clear all
              </button>
            </div>
          </div>

          {/* Items Checklist Table */}
          <div className="space-y-2">
            {itemsState.map((item) => {
              if (!item.isFood) {
                // Non-food item: rendered greyed out and auto-excluded
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-2xl border border-dashed border-border/60 bg-muted/30 opacity-60 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <Ban className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <span className="font-medium text-muted-foreground line-through">
                          {item.originalName}
                        </span>
                        <span className="block text-[10px] text-muted-foreground">
                          {item.quantity} {item.unit}
                        </span>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-semibold text-muted-foreground">
                      Non-Food (Auto-Excluded)
                    </Badge>
                  </div>
                );
              }

              return (
                <div
                  key={item.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-2xl border transition-all gap-3 ${
                    item.selected
                      ? "border-primary/40 bg-primary/5 shadow-xs"
                      : "border-border/60 bg-surface/50 opacity-70"
                  }`}
                >
                  {/* Left: Checkbox & Name */}
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={item.selected}
                      onCheckedChange={() => toggleItemSelection(item.id)}
                      id={item.id}
                      className="rounded-md"
                    />
                    <label htmlFor={item.id} className="cursor-pointer space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground">{item.name}</span>
                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-medium">
                          {item.category}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground block">
                        Quantity: {item.quantity} {item.unit}
                      </span>
                    </label>
                  </div>

                  {/* Right: Storage & Shelf Life */}
                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    {/* Storage selector */}
                    <div className="w-32">
                      <Select
                        value={item.storage}
                        onValueChange={(val: Storage) => updateItemStorage(item.id, val)}
                        disabled={!item.selected}
                      >
                        <SelectTrigger className="h-8 text-xs rounded-xl bg-background border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Refrigerator">Refrigerator</SelectItem>
                          <SelectItem value="Pantry shelf">Pantry shelf</SelectItem>
                          <SelectItem value="Freezer">Freezer</SelectItem>
                          <SelectItem value="Counter">Counter</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Shelf Life Days */}
                    <div className="flex items-center gap-1 text-xs bg-background border border-border rounded-xl px-2.5 h-8">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={item.shelfLifeDays}
                        onChange={(e) => updateItemDays(item.id, e.target.value)}
                        disabled={!item.selected}
                        className="w-8 text-center font-bold bg-transparent border-0 focus:outline-hidden text-xs"
                      />
                      <span className="text-muted-foreground text-[11px]">days</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* AI Predictive Notice */}
          <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-3.5 flex items-start gap-3 text-xs text-emerald-800 dark:text-emerald-300">
            <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Automated Freshness Engine</p>
              <p className="opacity-90 mt-0.5">
                Dynamic shelf-life and storage conditions are pre-calculated for each food type. Adding these items
                will instantly update your inventory, schedule calendar expiry reminders, and activate WhatsApp alerts.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <DialogFooter className="p-4 bg-muted/20 border-t border-border flex sm:justify-between items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleDismissOrder} className="text-xs text-muted-foreground">
            Skip this Order
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} className="text-xs">
              Review Later
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmImport}
              disabled={isSubmitting || selectedCount === 0}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Adding...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Confirm & Add {selectedCount} Item{selectedCount === 1 ? "" : "s"} to Pantry
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
export default InstamartDeliveryModal;

