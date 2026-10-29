import { useState, useEffect } from "react";
import {
  INSTACART_DEMO_ORDERS,
  INSTACART_DEMO_DATA_LABEL,
} from "../../services/instacart/instacartDemoData";
import { swiggyService } from "../../services/swiggy/swiggyService";
import { pantryDb } from "../../services/swiggy/pantryDb";
import { usePantry } from "../../lib/pantry-store";
import { createCalendarEvent } from "../../services/calendarService";
import { sendWhatsAppAlert } from "../../services/whatsappService";

function ImportDemoOrder({ onImportSuccess }) {
  const { addItems, syncPantryDb } = usePantry();
  const [activeTab, setActiveTab] = useState("swiggy"); // 'swiggy' | 'instacart'
  
  // Swiggy State
  const [swiggyMode, setSwiggyMode] = useState(() => swiggyService.getMode());
  const [swiggyConnected, setSwiggyConnected] = useState(() => swiggyService.isConnected());
  const [swiggyOrders, setSwiggyOrders] = useState([]);
  const [selectedSwiggyOrderId, setSelectedSwiggyOrderId] = useState("");
  const [currentSwiggyOrder, setCurrentSwiggyOrder] = useState(null);
  const [swiggyLoading, setSwiggyLoading] = useState(false);
  const [swiggyItemSelection, setSwiggyItemSelection] = useState({});

  // Instacart State
  const [selectedInstacartOrderId, setSelectedInstacartOrderId] = useState(
    INSTACART_DEMO_ORDERS[0].order_id
  );
  const [instacartItemSelection, setInstacartItemSelection] = useState(() => {
    const initialChecked = {};
    INSTACART_DEMO_ORDERS[0].items.forEach((_, idx) => {
      initialChecked[idx] = true;
    });
    return initialChecked;
  });

  const [importing, setImporting] = useState(false);

  // Sync Swiggy Connection & Orders on mount or mode change
  useEffect(() => {
    const updateState = () => {
      setSwiggyMode(swiggyService.getMode());
      setSwiggyConnected(swiggyService.isConnected());
    };

    window.addEventListener("swiggy_mode_changed", updateState);
    window.addEventListener("swiggy_session_changed", updateState);
    return () => {
      window.removeEventListener("swiggy_mode_changed", updateState);
      window.removeEventListener("swiggy_session_changed", updateState);
    };
  }, []);

  // Auto-connect Mock mode if not connected when tab opened
  useEffect(() => {
    if (activeTab === "swiggy") {
      if (swiggyMode === "mock" && !swiggyService.isConnected()) {
        swiggyService.login().then(() => {
          setSwiggyConnected(true);
          loadSwiggyOrders();
        });
      } else if (swiggyConnected) {
        loadSwiggyOrders();
      }
    }
  }, [activeTab, swiggyMode, swiggyConnected]);

  const loadSwiggyOrders = async () => {
    setSwiggyLoading(true);
    try {
      const active = swiggyService.getActiveOrders();
      const past = (await swiggyService.getOrders()) || [];
      const activeIds = new Set(active.map((a) => a.orderId));
      const combined = [
        ...active.map((a) => ({
          orderId: a.orderId,
          createdAt: a.createdAt,
          deliveredAt: a.deliveredAt || a.createdAt,
          status: a.status || "delivered",
          totalAmount: a.totalAmount || 0,
          itemCount: (a.items || []).length,
          isActive: true
        })),
        ...past.filter((p) => !activeIds.has(p.orderId))
      ];
      setSwiggyOrders(combined);
      if (combined.length > 0) {
        const firstId = combined[0].orderId;
        setSelectedSwiggyOrderId(firstId);
        loadSwiggyOrderDetails(firstId);
      } else {
        setCurrentSwiggyOrder(null);
      }
    } catch (err) {
      console.error("[ImportDemoOrder] Error loading Swiggy orders:", err);
    } finally {
      setSwiggyLoading(false);
    }
  };

  const loadSwiggyOrderDetails = async (orderId) => {
    setSwiggyLoading(true);
    try {
      const details = await swiggyService.getOrderDetails(orderId);
      setCurrentSwiggyOrder(details);
      
      // Default check all food items, uncheck non-food
      const selection = {};
      (details.items || []).forEach((item, idx) => {
        selection[idx] = item.isFood;
      });
      setSwiggyItemSelection(selection);
    } catch (err) {
      console.error(`[ImportDemoOrder] Error loading order ${orderId}:`, err);
    } finally {
      setSwiggyLoading(false);
    }
  };

  const handleSwiggyOrderChange = (orderId) => {
    setSelectedSwiggyOrderId(orderId);
    loadSwiggyOrderDetails(orderId);
  };

  const handleToggleSwiggyMode = async () => {
    const newMode = swiggyMode === "mock" ? "real" : "mock";
    swiggyService.setMode(newMode);
    setSwiggyMode(newMode);
    const connected = swiggyService.isConnected();
    setSwiggyConnected(connected);

    if (newMode === "mock" && !connected) {
      await swiggyService.login();
      setSwiggyConnected(true);
    }
  };

  const handleSwiggyLogin = async () => {
    try {
      setSwiggyLoading(true);
      await swiggyService.login();
      setSwiggyConnected(true);
      await loadSwiggyOrders();
    } catch (err) {
      alert(`Swiggy Login Error: ${err.message}`);
    } finally {
      setSwiggyLoading(false);
    }
  };

  const handleSwiggyLogout = async () => {
    await swiggyService.logout();
    setSwiggyConnected(false);
    setSwiggyOrders([]);
    setCurrentSwiggyOrder(null);
  };

  // Instacart Order Change
  const handleInstacartOrderChange = (orderId) => {
    setSelectedInstacartOrderId(orderId);
    const target = INSTACART_DEMO_ORDERS.find((o) => o.order_id === orderId);
    if (target) {
      const selection = {};
      target.items.forEach((_, idx) => {
        selection[idx] = true;
      });
      setInstacartItemSelection(selection);
    }
  };

  // Toggle checkboxes
  const toggleSwiggyCheckbox = (index) => {
    setSwiggyItemSelection((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const toggleInstacartCheckbox = (index) => {
    setInstacartItemSelection((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  // Select all helpers
  const handleSelectAllSwiggyFood = (check) => {
    if (!currentSwiggyOrder) return;
    const updated = { ...swiggyItemSelection };
    currentSwiggyOrder.items.forEach((item, idx) => {
      if (item.isFood) updated[idx] = check;
    });
    setSwiggyItemSelection(updated);
  };

  const handleSelectAllInstacart = (check) => {
    const target = INSTACART_DEMO_ORDERS.find((o) => o.order_id === selectedInstacartOrderId);
    if (!target) return;
    const updated = {};
    target.items.forEach((_, idx) => {
      updated[idx] = check;
    });
    setInstacartItemSelection(updated);
  };

  // Import Action
  const handleImport = async () => {
    let itemsToImport = [];

    if (activeTab === "swiggy") {
      if (!currentSwiggyOrder) {
        alert("Please select a Swiggy Instamart order to import.");
        return;
      }

      itemsToImport = currentSwiggyOrder.items
        .filter((_, idx) => swiggyItemSelection[idx])
        .map((item) => {
          const dept = (item.category || "").toLowerCase();
          let shelfDays = 7;
          if (dept.includes("vegetable") || dept.includes("fruit") || dept.includes("fresh")) shelfDays = 5;
          else if (dept.includes("dairy") || dept.includes("milk")) shelfDays = 4;
          else if (dept.includes("bakery") || dept.includes("bread")) shelfDays = 4;
          else if (dept.includes("frozen")) shelfDays = 30;
          else if (dept.includes("beverage")) shelfDays = 30;
          else if (dept.includes("grain") || dept.includes("atta")) shelfDays = 90;
          else if (dept.includes("snack")) shelfDays = 60;

          const expiryObj = new Date();
          expiryObj.setDate(expiryObj.getDate() + shelfDays);
          const consumeByDate = expiryObj.toISOString().split("T")[0];

          return {
            name: item.name,
            category: item.category || "Other",
            quantity: item.quantity,
            unit: item.unit || "pcs",
            receivedAt: currentSwiggyOrder.deliveredAt || new Date().toISOString(),
            purchaseDate: (currentSwiggyOrder.createdAt || new Date().toISOString()).split("T")[0],
            expiryDate: consumeByDate,
            consumeByDate: consumeByDate,
            shelfLifeDays: shelfDays,
            source: `Swiggy Instamart (${swiggyMode.toUpperCase()})`,
            orderId: currentSwiggyOrder.orderId,
            price: item.price
          };
        });
    } else {
      const currentInstacart = INSTACART_DEMO_ORDERS.find((o) => o.order_id === selectedInstacartOrderId) || INSTACART_DEMO_ORDERS[0];
      itemsToImport = currentInstacart.items
        .filter((_, idx) => instacartItemSelection[idx])
        .map((item) => {
          const dept = (item.department || "").toLowerCase();
          let shelfDays = 7;
          if (dept.includes("produce") || dept.includes("vegetable") || dept.includes("fruit")) shelfDays = 5;
          else if (dept.includes("dairy") || dept.includes("egg")) shelfDays = 4;
          else if (dept.includes("bakery") || dept.includes("bread")) shelfDays = 4;
          else if (dept.includes("frozen")) shelfDays = 30;
          else if (dept.includes("beverage")) shelfDays = 30;
          else if (dept.includes("grain") || dept.includes("pantry")) shelfDays = 90;

          const expiryObj = new Date();
          expiryObj.setDate(expiryObj.getDate() + shelfDays);
          const consumeByDate = expiryObj.toISOString().split("T")[0];

          return {
            name: item.product_name,
            category: item.department || "Other",
            quantity: item.quantity,
            unit: item.unit,
            receivedAt: new Date().toISOString(),
            purchaseDate: new Date().toISOString().split("T")[0],
            expiryDate: consumeByDate,
            consumeByDate: consumeByDate,
            shelfLifeDays: shelfDays,
            source: "Instacart Kaggle Dataset",
            isDemoData: true,
            orderId: `instacart_${currentInstacart.order_id}`,
          };
        });
    }

    if (itemsToImport.length === 0) {
      alert("Please select at least one item to import.");
      return;
    }

    setImporting(true);

    try {
      // 1. Add items to Pantry store React Context directly for instant UI update
      await addItems(itemsToImport);
      if (activeTab === "swiggy" && currentSwiggyOrder?.orderId) {
        swiggyService.markOrderImported(currentSwiggyOrder.orderId);
      }
      syncPantryDb();

      // 2. Add items to Pantry DB
      const addedItems = pantryDb.addItems(itemsToImport, false);

      // Create Calendar Events
      let calSuccessCount = 0;
      let calFailCount = 0;

      for (const addedItem of addedItems) {
        try {
          const calRes = await createCalendarEvent(addedItem);
          if (calRes.success) {
            calSuccessCount++;
            pantryDb.updateItem(addedItem.id, {
              googleCalendarSoonEventId: calRes.googleCalendarSoonEventId || calRes.googleCalendarEventId,
              googleCalendarExpiryEventId: calRes.googleCalendarExpiryEventId || calRes.googleCalendarEventId,
              googleCalendarEventId: calRes.googleCalendarEventId || calRes.googleCalendarExpiryEventId,
              calendarEventId: calRes.googleCalendarEventId || calRes.googleCalendarExpiryEventId,
              googleCalendarId: calRes.googleCalendarId || "primary",
              calendarHtmlLink: calRes.calendarHtmlLink || "https://calendar.google.com",
              calendarSyncStatus: "SYNCED",
              calendarLastSyncedAt: calRes.calendarLastSyncedAt || new Date().toISOString()
            }, false);
          } else {
            calFailCount++;
          }
        } catch {
          calFailCount++;
        }
      }

      // Trigger WhatsApp Alert
      try {
        const waRes = await sendWhatsAppAlert(addedItems);
        if (waRes && waRes.success) {
          for (const addedItem of addedItems) {
            pantryDb.updateItem(addedItem.id, {
              whatsappMessageId: waRes.messageId,
              whatsappStatus: "DELIVERED_SUCCESSFULLY"
            }, false);
          }
        }
      } catch (waErr) {
        console.error("[ImportDemoOrder] WhatsApp Alert exception:", waErr);
      }

      setImporting(false);

      if (onImportSuccess) {
        onImportSuccess(itemsToImport);
      } else {
        if (typeof window !== "undefined") window.location.href = "/app/pantry";
      }
    } catch (err) {
      setImporting(false);
      alert(`Import failed: ${err.message}`);
    }
  };

  const currentInstacartOrder = INSTACART_DEMO_ORDERS.find((o) => o.order_id === selectedInstacartOrderId) || INSTACART_DEMO_ORDERS[0];

  return (
    <div className="import-demo-order-card text-foreground">
      {/* Tab Header */}
      <div className="flex border-b border-border mb-6 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("swiggy")}
          className={`flex items-center gap-2 px-5 py-3 font-semibold text-sm transition-colors border-b-2 ${
            activeTab === "swiggy"
              ? "border-emerald-500 text-emerald-500"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="text-lg">🛵</span>
          Swiggy Instamart API
          <span className="ml-1.5 rounded-full bg-emerald-500/10 text-emerald-500 px-2 py-0.5 text-xs font-bold">
            Live Integration
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("instacart")}
          className={`flex items-center gap-2 px-5 py-3 font-semibold text-sm transition-colors border-b-2 ${
            activeTab === "instacart"
              ? "border-amber-500 text-amber-500"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="text-lg">📦</span>
          Kaggle Instacart Dataset
        </button>
      </div>

      {/* SWIGGY TAB CONTENT */}
      {activeTab === "swiggy" && (
        <div className="space-y-6">
          {/* Swiggy Session & Provider Control Bar */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="font-bold text-sm">Mode:</span>
                <span className={`px-2.5 py-1 rounded-md text-xs font-bold tracking-wide uppercase ${
                  swiggyMode === "mock"
                    ? "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                    : "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                }`}>
                  {swiggyMode === "mock" ? "🧪 Demo / Mock Mode" : "🔑 Real Swiggy OAuth 2.1"}
                </span>

                <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${
                  swiggyConnected
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-red-500/10 text-red-500"
                }`}>
                  <span className={`h-2 w-2 rounded-full ${swiggyConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                  {swiggyConnected ? "Connected" : "Disconnected"}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleSwiggyMode}
                  className="px-3 py-1.5 rounded-lg border border-border bg-secondary text-xs font-medium hover:bg-muted transition-colors"
                >
                  Switch to {swiggyMode === "mock" ? "🔑 Real OAuth" : "🧪 Demo Mode"}
                </button>

                {!swiggyConnected ? (
                  <button
                    type="button"
                    onClick={handleSwiggyLogin}
                    disabled={swiggyLoading}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-colors"
                  >
                    {swiggyLoading ? "Connecting..." : "🔌 Connect Swiggy Instamart"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSwiggyLogout}
                    className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 text-xs font-medium transition-colors"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {swiggyMode === "mock"
                ? "Simulates real-time order retrieval and cart checkout via Swiggy Instamart mock endpoints."
                : "Connects via Builders Club OAuth 2.1 PKCE authorization & Instamart MCP SSE endpoints."}
            </p>

            {swiggyMode === "real" && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs space-y-1.5">
                <span className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  ⚠️ Swiggy Partner Approval Required
                </span>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Local applications are not whitelisted for direct Swiggy OAuth (<em>"Local Application isn't whitelisted yet"</em>).
                  Demo / Simulation mode is fully functional for importing orders with automatic shelf-life calculation and non-food filtering.
                </p>
                <button
                  type="button"
                  onClick={handleToggleSwiggyMode}
                  className="mt-1 px-3 py-1 rounded-md bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs"
                >
                  Use Simulation Mode
                </button>
              </div>
            )}
          </div>

          {/* Swiggy Order Selector */}
          {swiggyConnected && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Select Swiggy Instamart Order:
                </label>
                <select
                  value={selectedSwiggyOrderId}
                  onChange={(e) => handleSwiggyOrderChange(e.target.value)}
                  disabled={swiggyLoading || swiggyOrders.length === 0}
                  className="w-full p-3 rounded-xl border border-border bg-card text-foreground text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  {swiggyOrders.length === 0 ? (
                    <option value="">No orders found</option>
                  ) : (
                    swiggyOrders.map((o) => (
                      <option key={o.orderId} value={o.orderId}>
                        Order #{o.orderId} — ₹{o.totalAmount} ({o.itemCount} items) placed {new Date(o.createdAt).toLocaleString()}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Order Card Preview */}
              {currentSwiggyOrder && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-border bg-card/60 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base">Order ID: <code>#{currentSwiggyOrder.orderId}</code></span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 capitalize">
                          {currentSwiggyOrder.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Delivered At: {new Date(currentSwiggyOrder.deliveredAt || currentSwiggyOrder.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                        ₹{currentSwiggyOrder.totalAmount}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {currentSwiggyOrder.items.length} Total Products ({currentSwiggyOrder.foodItems.length} Food Items)
                      </p>
                    </div>
                  </div>

                  {/* Food Items Preview */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm flex items-center gap-2">
                        🥗 Smart Pantry Food Items ({currentSwiggyOrder.foodItems.length})
                      </h4>
                      <div className="flex gap-3 text-xs">
                        <button
                          type="button"
                          onClick={() => handleSelectAllSwiggyFood(true)}
                          className="text-emerald-500 underline hover:text-emerald-400"
                        >
                          Select All Food
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectAllSwiggyFood(false)}
                          className="text-muted-foreground underline hover:text-foreground"
                        >
                          Deselect All
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-border">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-secondary text-muted-foreground font-semibold border-b border-border">
                          <tr>
                            <th className="p-3 w-10">Select</th>
                            <th className="p-3">Product</th>
                            <th className="p-3">Category</th>
                            <th className="p-3">Quantity</th>
                            <th className="p-3 text-right">Price</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {currentSwiggyOrder.items.map((item, idx) => {
                            if (!item.isFood) return null;
                            return (
                              <tr
                                key={idx}
                                className={swiggyItemSelection[idx] ? "bg-emerald-500/5" : ""}
                              >
                                <td className="p-3">
                                  <input
                                    type="checkbox"
                                    checked={!!swiggyItemSelection[idx]}
                                    onChange={() => toggleSwiggyCheckbox(idx)}
                                    className="h-4 w-4 rounded border-border accent-emerald-600 cursor-pointer"
                                  />
                                </td>
                                <td className="p-3 font-medium">
                                  {item.name}
                                </td>
                                <td className="p-3">
                                  <span className="px-2 py-0.5 rounded bg-secondary font-medium">
                                    {item.category}
                                  </span>
                                </td>
                                <td className="p-3">
                                  {item.quantity} {item.unit}
                                </td>
                                <td className="p-3 text-right font-semibold">
                                  ₹{item.price}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Non-Food Items Section */}
                  {currentSwiggyOrder.nonFoodItems && currentSwiggyOrder.nonFoodItems.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
                          🧼 Non-Food Products ({currentSwiggyOrder.nonFoodItems.length})
                          <span className="text-xs font-normal text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                            Excluded from food pantry by default
                          </span>
                        </h4>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-border opacity-85">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-secondary text-muted-foreground font-semibold border-b border-border">
                            <tr>
                              <th className="p-3 w-10">Select</th>
                              <th className="p-3">Product</th>
                              <th className="p-3">Original Category</th>
                              <th className="p-3 text-right">Price</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {currentSwiggyOrder.items.map((item, idx) => {
                              if (item.isFood) return null;
                              return (
                                <tr
                                  key={idx}
                                  className={swiggyItemSelection[idx] ? "bg-amber-500/5" : ""}
                                >
                                  <td className="p-3">
                                    <input
                                      type="checkbox"
                                      checked={!!swiggyItemSelection[idx]}
                                      onChange={() => toggleSwiggyCheckbox(idx)}
                                      className="h-4 w-4 rounded border-border accent-amber-600 cursor-pointer"
                                    />
                                  </td>
                                  <td className="p-3 font-medium text-muted-foreground">
                                    {item.name}
                                  </td>
                                  <td className="p-3 text-muted-foreground">
                                    {item.originalCategory}
                                  </td>
                                  <td className="p-3 text-right font-medium text-muted-foreground">
                                    ₹{item.price}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* INSTACART TAB CONTENT */}
      {activeTab === "instacart" && (
        <div className="space-y-6">
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 text-amber-600 dark:text-amber-400 text-sm flex gap-3 items-center">
            <span className="text-2xl">🧪</span>
            <div>
              <strong>{INSTACART_DEMO_DATA_LABEL}</strong>
              <p className="text-xs opacity-90 margin-0">
                Imports benchmark grocery orders from Kaggle's Instacart Online Grocery Basket Analysis dataset.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
              Select Instacart Order:
            </label>
            <select
              value={selectedInstacartOrderId}
              onChange={(e) => handleInstacartOrderChange(e.target.value)}
              className="w-full p-3 rounded-xl border border-border bg-card text-foreground text-sm font-medium focus:ring-2 focus:ring-amber-500 outline-none"
            >
              {INSTACART_DEMO_ORDERS.map((o) => (
                <option key={o.order_id} value={o.order_id}>
                  Order #{o.order_id} — {o.total_items} items (Placed {new Date(o.order_date).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm">
                Products in Order ({currentInstacartOrder.items.length})
              </h4>
              <div className="flex gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => handleSelectAllInstacart(true)}
                  className="text-amber-500 underline hover:text-amber-400"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectAllInstacart(false)}
                  className="text-muted-foreground underline hover:text-foreground"
                >
                  Deselect All
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-secondary text-muted-foreground font-semibold border-b border-border">
                  <tr>
                    <th className="p-3 w-10">Select</th>
                    <th className="p-3">Product Name</th>
                    <th className="p-3">Department</th>
                    <th className="p-3">Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {currentInstacartOrder.items.map((item, idx) => (
                    <tr
                      key={idx}
                      className={instacartItemSelection[idx] ? "bg-amber-500/5" : ""}
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={!!instacartItemSelection[idx]}
                          onChange={() => toggleInstacartCheckbox(idx)}
                          className="h-4 w-4 rounded border-border accent-amber-600 cursor-pointer"
                        />
                      </td>
                      <td className="p-3 font-medium">
                        {item.product_name}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-secondary font-medium text-muted-foreground">
                          {item.department}
                        </span>
                      </td>
                      <td className="p-3">
                        {item.quantity} {item.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT ACTION BUTTON */}
      <div className="mt-8 flex justify-end">
        <button
          type="button"
          onClick={handleImport}
          disabled={importing || (activeTab === "swiggy" && !currentSwiggyOrder)}
          className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm flex items-center gap-2 shadow-lg transition-all"
        >
          {importing ? "Importing Items..." : "🛒 Add Selected Items to Smart Pantry →"}
        </button>
      </div>
    </div>
  );
}

export default ImportDemoOrder;
