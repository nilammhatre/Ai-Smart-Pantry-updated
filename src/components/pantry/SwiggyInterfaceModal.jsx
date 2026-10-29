import { useState, useEffect, useRef } from "react";
import {
  ShoppingBag,
  Zap,
  CheckCircle2,
  Clock,
  ArrowRight,
  User,
  MapPin,
  Plus,
  Minus,
  Trash2,
  Sparkles,
  Tag,
  ShieldCheck,
  Smartphone,
  LogOut,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  PackageCheck,
  AlertTriangle,
  Search
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { swiggyService } from "@/services/swiggy/swiggyService";
import { pantryDb } from "@/services/swiggy/pantryDb";
import { usePantry } from "@/lib/pantry-store";
import { normalizeSwiggyItem } from "@/services/swiggy/normalizer";
import { createCalendarEvent } from "@/services/calendarService";
import { sendWhatsAppAlert } from "@/services/whatsappService";

const POPULAR_INSTAMART_ITEMS = [
  { name: "Amul Taaza Fresh Toned Milk (500ml)", category: "Dairy", price: 28, unit: "packet" },
  { name: "Fresh Organic Spinach / Palak (250g)", category: "Vegetables", price: 32, unit: "bunch" },
  { name: "Fresh Hybrid Tomatoes (500g)", category: "Vegetables", price: 24, unit: "pack" },
  { name: "Britannia 100% Whole Wheat Bread (400g)", category: "Bakery", price: 48, unit: "pack" },
  { name: "Fresho Farm Eggs (Pack of 6)", category: "Eggs & Meat", price: 54, unit: "tray" },
  { name: "Aashirvaad Superior MP Atta (1kg)", category: "Grains & Flour", price: 62, unit: "kg" }
];

export default function SwiggyInterfaceModal({
  isOpen,
  onClose,
  initialCartItems = [],
  onOrderSuccess,
  defaultTab = "cart"
}) {
  const { addItems, syncPantryDb } = usePantry();
  const [activeTab, setActiveTab] = useState(defaultTab); // 'cart' | 'login' | 'tracking' | 'history'
  const [swiggyMode, setSwiggyMode] = useState(() => swiggyService.getMode());
  const [isConnected, setIsConnected] = useState(() => swiggyService.isConnected());

  // Phone / OTP login simulation
  const [phone, setPhone] = useState("9322348511");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Cart State inside Swiggy Interface
  const [cart, setCart] = useState(() => {
    return initialCartItems.map((item, idx) => ({
      id: item.id || `cart_${idx}_${Date.now()}`,
      name: item.name,
      category: item.category || "Grocery",
      quantity: parseInt(item.qty || item.quantity || "1", 10) || 1,
      price: item.price || Math.floor(35 + (idx * 27) % 65),
      unit: item.unit || "pcs",
      reason: item.reason || "Shopping list requirement"
    }));
  });

  const [couponApplied, setCouponApplied] = useState(true);
  const [deliveryAddress, setDeliveryAddress] = useState("Flat 402, Green Glen Layout, Bellandur, Bengaluru 560103");
  const [isEditingAddress, setIsEditingAddress] = useState(false);

  // Ordering & Live Tracking State
  const [isOrdering, setIsOrdering] = useState(false);
  const [activeOrder, setActiveOrder] = useState(null);
  const [orderStage, setOrderStage] = useState(0); // 0: placed, 1: packing, 2: out_for_delivery, 3: delivered
  const [orderEta, setOrderEta] = useState(14);
  const [pastOrders, setPastOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [orderFetchError, setOrderFetchError] = useState(null);

  // Live Swiggy Instamart Product Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Debounced search for Instamart products
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await swiggyService.searchProducts(searchQuery.trim());
        setSearchResults(results || []);
      } catch (err) {
        console.warn("Product search failed:", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, swiggyMode]);

  // Sync initial cart items when modal opens
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current && initialCartItems && initialCartItems.length > 0) {
      setCart(
        initialCartItems.map((item, idx) => ({
          id: item.id || `cart_${idx}_${Date.now()}`,
          name: item.name,
          category: item.category || "Grocery",
          quantity: parseInt(item.qty || item.quantity || "1", 10) || 1,
          price: item.price || Math.floor(35 + (idx * 27) % 65),
          unit: item.unit || "pcs",
          reason: item.reason || "Shopping list item"
        }))
      );
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  // Sync session state on mount / custom events
  useEffect(() => {
    const handleModeChange = () => setSwiggyMode(swiggyService.getMode());
    const handleSessionChange = () => setIsConnected(swiggyService.isConnected());

    window.addEventListener("swiggy_mode_changed", handleModeChange);
    window.addEventListener("swiggy_session_changed", handleSessionChange);

    return () => {
      window.removeEventListener("swiggy_mode_changed", handleModeChange);
      window.removeEventListener("swiggy_session_changed", handleSessionChange);
    };
  }, []);

  // Fetch user info when connected
  useEffect(() => {
    if (isConnected) {
      swiggyService.getUserInfo().then((info) => {
        if (info) setUserInfo(info);
      }).catch(() => {});
    } else {
      setUserInfo(null);
    }
  }, [isConnected, swiggyMode]);

  // Fetch past orders whenever modal opens or connection is active
  useEffect(() => {
    if (isConnected && isOpen) {
      loadPastOrders();
    }
  }, [isConnected, swiggyMode, activeTab, isOpen]);

  const loadPastOrders = async () => {
    setLoadingOrders(true);
    setOrderFetchError(null);
    try {
      const [ordersResult, userResult] = await Promise.allSettled([
        swiggyService.getOrders(),
        swiggyService.getUserInfo()
      ]);

      if (userResult.status === "fulfilled" && userResult.value) {
        setUserInfo(userResult.value);
      }

      if (ordersResult.status === "fulfilled") {
        setPastOrders(ordersResult.value || []);
      } else {
        const errorMsg = ordersResult.reason?.message || "Failed to load orders from Swiggy Instamart.";
        setOrderFetchError(errorMsg);
        console.warn("Swiggy orders fetch error:", ordersResult.reason);
        const active = swiggyService.getActiveOrders();
        setPastOrders(active || []);
      }
    } catch (err) {
      console.warn("Could not load past Swiggy orders:", err);
      setOrderFetchError(err.message || "Failed to load orders from Swiggy Instamart.");
      const active = swiggyService.getActiveOrders();
      setPastOrders(active || []);
    } finally {
      setLoadingOrders(false);
    }
  };

  // Cart Calculations
  const itemTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryFee = itemTotal > 199 || itemTotal === 0 ? 0 : 25;
  const handlingFee = itemTotal > 0 ? 5 : 0;
  const discountAmount = couponApplied && itemTotal > 100 ? 30 : 0;
  const billTotal = Math.max(0, itemTotal + deliveryFee + handlingFee - discountAmount);

  // Quantity handlers
  const updateQuantity = (id, delta) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean)
    );
  };

  const removeItem = (id) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
    toast.info("Item removed from Swiggy cart");
  };

  const addPopularItem = (item) => {
    setCart((prev) => {
      const exists = prev.find((i) => i.name.toLowerCase() === item.name.toLowerCase());
      if (exists) {
        return prev.map((i) => (i.name.toLowerCase() === item.name.toLowerCase() ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [
        ...prev,
        {
          id: `item_${Date.now()}_${Math.random()}`,
          name: item.name,
          category: item.category,
          quantity: 1,
          price: item.price,
          unit: item.unit
        }
      ];
    });
    toast.success(`Added ${item.name} to Swiggy cart`);
  };

  // Auth Handlers
  const handleSendOtp = () => {
    if (!phone || phone.length < 10) {
      toast.error("Please enter a valid 10-digit Indian mobile number");
      return;
    }
    setOtpSent(true);
    setOtp("4829");
    toast.success(`OTP sent to +91 ${phone}! Auto-filled test OTP: 4829`);
  };

  const handleVerifyOtp = async () => {
    setIsLoggingIn(true);
    try {
      if (swiggyMode === "real") {
        swiggyService.setMode("mock");
        setSwiggyMode("mock");
      }
      await swiggyService.login();
      setIsConnected(true);
      toast.success("Swiggy Account Connected via Verified Demo OTP (4829)!", {
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />
      });
      setActiveTab("cart");
    } catch (err) {
      toast.error(`Login error: ${err.message}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleConnectRealSwiggy = async () => {
    setIsLoggingIn(true);
    try {
      swiggyService.setMode("real");
      setSwiggyMode("real");
      const res = await swiggyService.login();
      if (res && res.redirectUrl) {
        toast.info("Redirecting to Swiggy Builders Club OAuth 2.1...");
      }
    } catch (err) {
      toast.error(`Swiggy OAuth Blocked: ${err.message}`, {
        duration: 8000,
        description: "Official Swiggy partner credentials or whitelisting are required for production accounts."
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleOneTouchLogin = async () => {
    setIsLoggingIn(true);
    try {
      if (swiggyMode === "real") {
        swiggyService.setMode("mock");
        setSwiggyMode("mock");
      }
      await swiggyService.login();
      setIsConnected(true);
      toast.success("Connected via Swiggy Instamart Simulation Mode!", {
        description: "Zero external credentials needed. Place orders and sync pantry immediately.",
        icon: <Zap className="h-4 w-4 text-amber-500" />
      });
      setActiveTab("cart");
    } catch (err) {
      toast.error(`Login error: ${err.message}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await swiggyService.logout();
    setIsConnected(false);
    setOtpSent(false);
    setOtp("");
    toast.info("Logged out from Swiggy session");
  };

  // Switch between Mock and Real Swiggy Provider
  const handleToggleMode = (mode) => {
    swiggyService.setMode(mode);
    setSwiggyMode(mode);
    setIsConnected(swiggyService.isConnected());
    if (mode === "real") {
      toast.info("Switched to Genuine Swiggy Builders Club MCP mode.", {
        description: "Connect your official developer client ID and PKCE authorization."
      });
    } else {
      toast.success("Switched to Instamart Simulation Mode (Zero-credential testing active)");
    }
  };

  // Order Placement & Live Tracking
  const handlePlaceOrder = async () => {
    if (cart.length === 0) {
      toast.error("Your Swiggy Instamart cart is empty.");
      return;
    }

    if (!isConnected) {
      setActiveTab("login");
      toast.info("Please log in to your Swiggy account to place the order.");
      return;
    }

    setIsOrdering(true);
    try {
      const orderPayload = cart.map((item) => ({
        name: item.name,
        qty: item.quantity,
        quantity: item.quantity,
        category: item.category,
        price: item.price,
        itemId: item.itemId || item.id
      }));

      const res = await swiggyService.sendCartToSwiggy(orderPayload, {
        totalAmount: billTotal,
        addressId: "addr_current"
      });

      setActiveOrder({
        ...res,
        items: cart,
        totalAmount: billTotal,
        address: deliveryAddress,
        isReal: swiggyMode === "real"
      });

      setActiveTab("tracking");
      setOrderStage(1);
      setOrderEta(14);
      toast.success(`🛵 Swiggy Instamart Order #${res.orderId} Placed!`, {
        description: swiggyMode === "real" ? "Order submitted to Swiggy Instamart via MCP." : "15-minute instant delivery partner assigned."
      });

      // Advance tracking animation and active order state in simulation mode
      if (swiggyMode === "mock") {
        setTimeout(() => {
          setOrderStage(2);
          swiggyService.updateActiveOrderStatus(res.orderId, "out_for_delivery");
        }, 2200);
        setTimeout(() => {
          setOrderStage(3);
          swiggyService.updateActiveOrderStatus(res.orderId, "delivered");
        }, 5000);
      }
    } catch (err) {
      toast.error(`Order failed: ${err.message}`);
    } finally {
      setIsOrdering(false);
    }
  };

  // Import to Pantry Handlers
  const handleImportToPantry = async (orderToImport = activeOrder) => {
    if (!orderToImport) return;

    try {
      const rawItems = orderToImport.items || [];
      const foodItems = [];

      for (const raw of rawItems) {
        const norm = normalizeSwiggyItem(raw);
        if (!norm.isFood) continue; // Filter out non-food items!

        const cat = (norm.category || "").toLowerCase();
        let shelfLife = 7;
        let storage = "Pantry shelf";
        if (cat.includes("veg") || norm.name.toLowerCase().includes("spinach") || norm.name.toLowerCase().includes("tomato")) {
          shelfLife = 5;
          storage = "Refrigerator";
        } else if (cat.includes("fruit") || norm.name.toLowerCase().includes("banana") || norm.name.toLowerCase().includes("apple")) {
          shelfLife = 6;
          storage = "Counter";
        } else if (cat.includes("dairy") || norm.name.toLowerCase().includes("milk") || norm.name.toLowerCase().includes("paneer")) {
          shelfLife = 4;
          storage = "Refrigerator";
        } else if (cat.includes("bakery") || norm.name.toLowerCase().includes("bread")) {
          shelfLife = 4;
          storage = "Pantry shelf";
        } else if (cat.includes("meat") || cat.includes("egg")) {
          shelfLife = 4;
          storage = "Refrigerator";
        } else if (cat.includes("grain") || norm.name.toLowerCase().includes("atta")) {
          shelfLife = 90;
          storage = "Pantry shelf";
        }

        const exp = new Date();
        exp.setDate(exp.getDate() + shelfLife);
        const expStr = exp.toISOString().split("T")[0];

        foodItems.push({
          id: crypto.randomUUID(),
          name: norm.name,
          category: norm.category || "Packaged Food",
          quantity: `${norm.quantity} ${norm.unit || "pcs"}`,
          freshness: 95,
          addedDaysAgo: 0,
          expiresInDays: shelfLife,
          days_left: shelfLife,
          storage,
          expiry_date: expStr,
          consumeByDate: expStr,
          purchaseDate: new Date().toISOString().split("T")[0],
          receivedAt: new Date().toISOString(),
          source: `Swiggy Instamart (${swiggyMode.toUpperCase()})`,
          orderId: orderToImport.orderId,
          allergens: [],
          nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, nutrients: [] }
        });
      }

      if (foodItems.length === 0) {
        toast.info("No food items found in this order to import.");
        return;
      }

      await addItems(foodItems);
      swiggyService.markOrderImported(orderToImport.orderId);
      syncPantryDb();

      if (onOrderSuccess) {
        onOrderSuccess(orderToImport);
      }

      toast.success(`🎉 ${foodItems.length} food items added to Smart Pantry with auto-expiry & reminders!`, {
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />
      });
      onClose();
    } catch (err) {
      toast.error(`Import failed: ${err.message}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4 backdrop-blur-md animate-fade-in">
      <div className="relative flex flex-col max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-3xl bg-card border border-border shadow-2xl text-foreground">
        
        {/* Swiggy Branded Top Banner */}
        <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-orange-500 p-4 sm:p-5 text-white flex flex-wrap items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center text-2xl shadow-inner shrink-0">
              🛵
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold tracking-tight text-lg sm:text-xl">
                  SWIGGY <span className="text-amber-200">INSTAMART</span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/25 px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase">
                  <Zap className="h-3 w-3 fill-amber-300 text-amber-300" /> 15 Mins
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-white/90 mt-0.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 opacity-80" />
                <span className="truncate max-w-[240px] sm:max-w-md">
                  {deliveryAddress}
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditingAddress(!isEditingAddress)}
                  className="underline opacity-80 hover:opacity-100 text-[11px] ml-1"
                >
                  Change
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
              isConnected ? "bg-emerald-500/90 text-white" : "bg-black/30 text-amber-200"
            }`}>
              {isConnected ? "🟢 Connected" : "🔴 Not Logged In"}
            </span>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-full bg-black/20 hover:bg-black/40 text-white flex items-center justify-center transition-colors font-bold text-sm"
              aria-label="Close Swiggy Modal"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Address Edit Drawer if active */}
        {isEditingAddress && (
          <div className="bg-secondary/80 px-4 py-2.5 border-b border-border flex items-center gap-2 animate-fade-in">
            <input
              type="text"
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              className="flex-1 bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-orange-500"
              placeholder="Enter delivery address in India..."
            />
            <Button size="sm" variant="default" className="bg-orange-600 hover:bg-orange-500 text-white text-xs h-8" onClick={() => setIsEditingAddress(false)}>
              Save Address
            </Button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-border bg-secondary/30 px-4 sm:px-6 overflow-x-auto gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("cart")}
            className={`flex items-center gap-2 px-3 sm:px-4 py-3 font-semibold text-xs sm:text-sm border-b-2 transition-all whitespace-nowrap ${
              activeTab === "cart"
                ? "border-orange-500 text-orange-600 dark:text-orange-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShoppingBag className="h-4 w-4" />
            Swiggy Cart
            {cart.length > 0 && (
              <span className="rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400 px-2 py-0.2 text-xs font-bold">
                {cart.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("login")}
            className={`flex items-center gap-2 px-3 sm:px-4 py-3 font-semibold text-xs sm:text-sm border-b-2 transition-all whitespace-nowrap ${
              activeTab === "login"
                ? "border-orange-500 text-orange-600 dark:text-orange-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Smartphone className="h-4 w-4" />
            Account & Login
            {isConnected && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
          </button>

          {activeOrder && (
            <button
              type="button"
              onClick={() => setActiveTab("tracking")}
              className={`flex items-center gap-2 px-3 sm:px-4 py-3 font-semibold text-xs sm:text-sm border-b-2 transition-all whitespace-nowrap ${
                activeTab === "tracking"
                  ? "border-orange-500 text-orange-600 dark:text-orange-400"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Zap className="h-4 w-4 text-amber-500 animate-pulse" />
              Live Delivery (15 Mins)
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-2 px-3 sm:px-4 py-3 font-semibold text-xs sm:text-sm border-b-2 transition-all whitespace-nowrap ${
              activeTab === "history"
                ? "border-orange-500 text-orange-600 dark:text-orange-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <PackageCheck className="h-4 w-4" />
            Recent & Past Orders
            {pastOrders.length > 0 && (
              <span className="rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.2 text-xs font-bold">
                {pastOrders.length}
              </span>
            )}
          </button>
        </div>

        {/* Modal Body Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">

          {/* TAB 1: SWIGGY CART */}
          {activeTab === "cart" && (
            <div className="space-y-6">
              {/* Account Quick Status Alert */}
              {!isConnected && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-700 dark:text-amber-300">
                  <div className="flex items-center gap-2.5 text-xs sm:text-sm">
                    <User className="h-4 w-4 shrink-0 text-amber-500" />
                    <span>You are not logged into Swiggy. Log in to place instant orders.</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setActiveTab("login")}
                    className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold h-8 rounded-lg shrink-0"
                  >
                    Login to Swiggy
                  </Button>
                </div>
              )}

              {/* Product Search Bar */}
              <div className="relative">
                <div className="flex items-center rounded-2xl border border-border bg-card px-3.5 py-2.5 shadow-xs focus-within:ring-2 focus-within:ring-orange-500/50">
                  <Search className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={
                      swiggyMode === "real"
                        ? "Search genuine Instamart products via MCP (e.g. Milk, Eggs, Rice, Paneer)..."
                        : "Search Instamart catalog (e.g. Milk, Bread, Atta)..."
                    }
                    className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  {isSearching && (
                    <span className="h-4 w-4 rounded-full border-2 border-orange-500 border-t-transparent animate-spin mr-1" />
                  )}
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="text-xs text-muted-foreground hover:text-foreground px-1"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Live Search Results Dropdown/Card */}
                {searchResults.length > 0 && (
                  <div className="mt-2 rounded-2xl border border-orange-500/30 bg-card p-3 shadow-xl space-y-2 animate-fade-in">
                    <div className="flex items-center justify-between text-xs font-bold text-muted-foreground px-1">
                      <span>Search Results ({searchResults.length})</span>
                      <span className="text-[10px] text-orange-600 dark:text-orange-400 font-semibold">
                        {swiggyMode === "real" ? "Genuine Swiggy MCP Server" : "Instamart Catalog"}
                      </span>
                    </div>
                    <div className="max-h-56 overflow-y-auto divide-y divide-border">
                      {searchResults.map((prod) => (
                        <div key={prod.id || prod.itemId} className="py-2 px-1 flex items-center justify-between gap-3 hover:bg-secondary/30 rounded-lg">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-xs text-foreground truncate">{prod.name}</p>
                            <p className="text-[11px] text-muted-foreground">₹{prod.price} · {prod.category} · {prod.unit}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="soft"
                            onClick={() => addPopularItem(prod)}
                            className="h-7 px-2.5 text-xs font-bold text-orange-600 dark:text-orange-400 hover:bg-orange-500/15"
                          >
                            + ADD
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Cart Items List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <span>Items in Cart ({cart.reduce((a, b) => a + b.quantity, 0)})</span>
                  </h3>
                  {cart.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCart([])}
                      className="text-xs text-muted-foreground hover:text-red-500 underline"
                    >
                      Clear Cart
                    </button>
                  )}
                </div>

                {cart.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-8 text-center space-y-3">
                    <div className="text-4xl">🛒</div>
                    <h4 className="font-semibold text-base">Your Swiggy Instamart Cart is Empty</h4>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      Items from your shopping list will appear here automatically, or select from popular Instamart pantry items below.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border divide-y divide-border bg-surface/60 overflow-hidden shadow-sm">
                    {cart.map((item) => (
                      <div key={item.id} className="p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-secondary/40 transition-colors">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-foreground">{item.name}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            ₹{item.price} · <span className="px-1.5 py-0.5 rounded bg-secondary font-medium">{item.category}</span>
                            {item.reason && <span className="hidden sm:inline opacity-80"> · {item.reason}</span>}
                          </p>
                        </div>

                        {/* Stepper Controls */}
                        <div className="flex items-center gap-3">
                          <div className="flex items-center border border-border rounded-xl bg-card overflow-hidden shadow-xs">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.id, -1)}
                              className="p-1.5 sm:px-2.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="px-2 font-bold text-xs sm:text-sm min-w-[24px] text-center">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.id, 1)}
                              className="p-1.5 sm:px-2.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                              aria-label="Increase quantity"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <div className="text-right min-w-[60px]">
                            <span className="font-bold text-sm text-foreground">
                              ₹{item.price * item.quantity}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            className="p-1.5 text-muted-foreground hover:text-red-500 rounded-lg hover:bg-red-500/10 transition-colors"
                            aria-label="Remove item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Popular Instamart Staples Suggestions */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-orange-500" />
                  Popular Instamart Pantry Additions (15-Min Delivery)
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {POPULAR_INSTAMART_ITEMS.map((item, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-border bg-card p-3 flex flex-col justify-between gap-2 hover:border-orange-500/50 transition-all shadow-xs"
                    >
                      <div>
                        <span className="text-[11px] font-semibold text-muted-foreground block">{item.category}</span>
                        <p className="font-medium text-xs text-foreground line-clamp-2 mt-0.5">{item.name}</p>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-border/50">
                        <span className="font-bold text-xs text-foreground">₹{item.price}</span>
                        <Button
                          size="sm"
                          variant="soft"
                          onClick={() => addPopularItem(item)}
                          className="h-6 px-2 text-[11px] font-bold text-orange-600 dark:text-orange-400 hover:bg-orange-500/15"
                        >
                          + ADD
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bill Details & Breakdown */}
              {cart.length > 0 && (
                <div className="rounded-2xl border border-border bg-surface/70 p-4 sm:p-5 space-y-3 text-sm shadow-sm">
                  <div className="flex items-center justify-between pb-2 border-b border-border">
                    <span className="font-bold text-foreground">Bill Summary</span>
                    <span className="text-xs text-muted-foreground">Swiggy Instamart Super Saver</span>
                  </div>

                  <div className="space-y-2 text-xs sm:text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Item Total</span>
                      <span className="text-foreground font-medium">₹{itemTotal}</span>
                    </div>

                    <div className="flex justify-between text-muted-foreground">
                      <span className="flex items-center gap-1">
                        Delivery Fee
                        {deliveryFee === 0 && <span className="text-[10px] font-bold bg-emerald-500/15 text-emerald-600 px-1.5 py-0.2 rounded">FREE</span>}
                      </span>
                      <span className={deliveryFee === 0 ? "text-emerald-600 font-bold" : "text-foreground font-medium"}>
                        {deliveryFee === 0 ? "FREE" : `₹${deliveryFee}`}
                      </span>
                    </div>

                    <div className="flex justify-between text-muted-foreground">
                      <span>Packaging & Handling Fee</span>
                      <span className="text-foreground font-medium">₹{handlingFee}</span>
                    </div>

                    {couponApplied && discountAmount > 0 && (
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                        <span className="flex items-center gap-1">
                          <Tag className="h-3.5 w-3.5" /> Coupon Discount (INSTA100)
                        </span>
                        <span>-₹{discountAmount}</span>
                      </div>
                    )}

                    <div className="pt-2 border-t border-border flex justify-between items-center text-base font-bold text-foreground">
                      <span>To Pay</span>
                      <span className="text-xl text-orange-600 dark:text-orange-400 font-extrabold">₹{billTotal}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Checkout Action Button */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>Swiggy 15-Minute Delivery Guarantee</span>
                </div>

                <div className="flex items-center gap-3">
                  <Button variant="outline" onClick={onClose}>
                    Close
                  </Button>
                  <Button
                    onClick={handlePlaceOrder}
                    disabled={isOrdering || cart.length === 0}
                    className="bg-orange-600 hover:bg-orange-500 text-white font-bold text-sm px-6 py-2.5 rounded-xl shadow-lg flex items-center gap-2"
                  >
                    {isOrdering ? (
                      <>
                        <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        Placing Order...
                      </>
                    ) : isConnected ? (
                      <>
                        <ShoppingBag className="h-4 w-4" /> Place Swiggy Order (₹{billTotal})
                      </>
                    ) : (
                      <>
                        <User className="h-4 w-4" /> Login & Order (₹{billTotal})
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SWIGGY ACCOUNT & LOGIN */}
          {activeTab === "login" && (
            <div className="space-y-6">
              {/* Integration Mode Switcher */}
              <div className="rounded-2xl border border-border bg-surface/70 p-4 sm:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-sm text-foreground">Swiggy Integration Mode</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Toggle between Simulated Demo Mode and Real Swiggy Developer OAuth 2.1
                    </p>
                  </div>

                  <div className="flex rounded-xl border border-border bg-card p-1">
                    <button
                      type="button"
                      onClick={() => handleToggleMode("mock")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        swiggyMode === "mock"
                          ? "bg-amber-500 text-white shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      🧪 Demo / Mock Mode
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleMode("real")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        swiggyMode === "real"
                          ? "bg-emerald-600 text-white shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      🔑 Real OAuth 2.1 PKCE
                    </button>
                  </div>
                </div>
              </div>

              {/* Real Swiggy Whitelisting Notice Banner */}
              {swiggyMode === "real" && (
                <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-2 text-xs">
                  <div className="flex items-center gap-2 font-bold text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4" />
                    <span>Swiggy Access Notice: Local Application isn't whitelisted yet</span>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    Direct sign-in via Swiggy OAuth displays <em>"Local Application isn't whitelisted yet"</em> because enterprise partner approval is required from Swiggy Developers.
                    External sign-in has been gracefully paused to prevent OAuth errors.
                  </p>
                  <div className="pt-1">
                    <Button
                      size="sm"
                      onClick={() => handleToggleMode("mock")}
                      className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs h-8 rounded-xl"
                    >
                      Continue in Instamart Simulation Mode (Fully Functional)
                    </Button>
                  </div>
                </div>
              )}

              {/* Login Status Card if Connected */}
              {isConnected ? (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold text-lg shadow-md">
                        {swiggyMode === "real"
                          ? (userInfo?.verifiedName ? userInfo.verifiedName.charAt(0).toUpperCase() : "IM")
                          : "IM"}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-base text-foreground">
                            {swiggyMode === "real"
                              ? (userInfo?.verifiedName || (userInfo?.userId ? `Swiggy User #${String(userInfo.userId).slice(-6)}` : "Authenticated Swiggy Session"))
                              : "Simulation Test Session"}
                          </h4>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-black uppercase">
                            {swiggyMode === "real" ? "Verified OAuth Session" : "🧪 Demo Mode"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {swiggyMode === "real"
                            ? (userInfo?.verifiedEmail || (userInfo?.userId ? `Swiggy User ID: ${userInfo.userId}` : "Connected via Swiggy Builders Club OAuth 2.1"))
                            : "Instamart Local Simulation Active"}
                        </p>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleLogout}
                      className="border-red-500/40 text-red-500 hover:bg-red-500/10 text-xs flex items-center gap-1.5"
                    >
                      <LogOut className="h-3.5 w-3.5" /> Log Out
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs border-t border-emerald-500/20">
                    <div>
                      <span className="text-muted-foreground block">Delivery Address</span>
                      <span className="font-medium text-foreground">{deliveryAddress}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Session Security</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                        {swiggyMode === "real" ? "OAuth2.1 PKCE Token Stored" : "Simulated Local Session"}
                      </span>
                    </div>
                  </div>

                  {/* Recent Orders of the Logged Account */}
                  <div className="pt-3 border-t border-emerald-500/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-xs uppercase tracking-wider text-foreground flex items-center gap-1.5">
                        <PackageCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        Recent Swiggy Orders ({pastOrders.length})
                      </h5>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={loadPastOrders}
                          disabled={loadingOrders}
                          className="text-xs h-7 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                        >
                          <RefreshCw className={`h-3 w-3 mr-1 ${loadingOrders ? "animate-spin" : ""}`} />
                          Refresh Orders
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setActiveTab("history")}
                          className="text-xs h-7 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                        >
                          View All ({pastOrders.length})
                        </Button>
                      </div>
                    </div>

                    {loadingOrders ? (
                      <div className="p-4 rounded-xl border border-border bg-card text-center space-y-2">
                        <span className="h-4 w-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin inline-block" />
                        <p className="text-xs text-muted-foreground">Fetching your Swiggy orders via MCP (https://mcp.swiggy.com/im)...</p>
                      </div>
                    ) : orderFetchError ? (
                      <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-xs space-y-2">
                        <div className="flex items-center gap-2 font-bold text-red-600 dark:text-red-400">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span>Swiggy MCP Order Sync Error</span>
                        </div>
                        <p className="text-muted-foreground font-mono text-[11px] break-all">
                          {orderFetchError}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={loadPastOrders}
                          className="h-7 text-xs border-red-500/40 text-red-600 hover:bg-red-500/15"
                        >
                          <RefreshCw className="h-3 w-3 mr-1" /> Retry Order Sync
                        </Button>
                      </div>
                    ) : pastOrders.length === 0 ? (
                      <div className="p-4 rounded-xl border border-dashed border-border bg-card text-center space-y-1.5">
                        <p className="text-xs font-semibold text-foreground">0 Swiggy Instamart orders returned for this account.</p>
                        <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                          Authenticated session active. Swiggy MCP returned 0 past orders for this client.
                        </p>
                        <div className="flex justify-center gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={loadPastOrders}
                            disabled={loadingOrders}
                            className="text-xs h-7 border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10"
                          >
                            <RefreshCw className={`h-3 w-3 mr-1 ${loadingOrders ? "animate-spin" : ""}`} /> Refresh
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {pastOrders.slice(0, 3).map((ord) => (
                          <div
                            key={ord.orderId}
                            className="p-3 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:border-emerald-500/40 transition-colors shadow-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-foreground">Order #{ord.orderId}</span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 uppercase">
                                  {ord.status || "Delivered"}
                                </span>
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {new Date(ord.createdAt || Date.now()).toLocaleDateString()} · {ord.itemCount || (ord.items || []).length || 1} items · ₹{ord.totalAmount}
                              </p>
                              {ord.items && ord.items.length > 0 && (
                                <p className="text-[11px] text-foreground truncate mt-0.5 font-medium">
                                  {ord.items.map((i) => `${i.quantity || 1}x ${i.name}`).join(", ")}
                                </p>
                              )}
                            </div>

                            <Button
                              size="sm"
                              variant="soft"
                              onClick={async () => {
                                try {
                                  const details = await swiggyService.getOrderDetails(ord.orderId);
                                  handleImportToPantry(details);
                                } catch (err) {
                                  toast.error(`Import failed: ${err.message}`);
                                }
                              }}
                              className="h-7 px-2.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 shrink-0"
                            >
                              📥 Import to Pantry
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={() => setActiveTab("cart")}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4"
                    >
                      Proceed to Swiggy Cart <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </div>
                </div>
              ) : swiggyMode === "real" ? (
                /* Real Swiggy Official OAuth 2.1 Login Box */
                <div className="rounded-2xl border border-emerald-500/30 bg-card p-6 space-y-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        <h4 className="font-bold text-base text-foreground">
                          Official Swiggy Builders Club OAuth 2.1
                        </h4>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Connect genuine Swiggy Instamart account using OAuth 2.1 with PKCE (RFC 7636) and Dynamic Client Registration (RFC 7591).
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                      RFC 7591 / PKCE
                    </span>
                  </div>

                  {/* Architecture & Endpoints Specs */}
                  <div className="rounded-xl border border-border bg-surface p-3.5 space-y-2 text-xs font-mono">
                    <div className="flex justify-between items-center text-muted-foreground">
                      <span>Auth Endpoint:</span>
                      <span className="text-foreground">https://mcp.swiggy.com/auth/authorize</span>
                    </div>
                    <div className="flex justify-between items-center text-muted-foreground">
                      <span>Token Endpoint:</span>
                      <span className="text-foreground">https://mcp.swiggy.com/auth/token</span>
                    </div>
                    <div className="flex justify-between items-center text-muted-foreground">
                      <span>MCP Server:</span>
                      <span className="text-foreground">https://mcp.swiggy.com/im</span>
                    </div>
                    <div className="flex justify-between items-center text-muted-foreground">
                      <span>Redirect URI:</span>
                      <span className="text-foreground">https://localhost:8080/app/shopping</span>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="space-y-3 pt-1">
                    <Button
                      onClick={handleConnectRealSwiggy}
                      disabled={isLoggingIn}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm py-3 rounded-xl shadow-md flex items-center justify-center gap-2"
                    >
                      {isLoggingIn ? (
                        <>
                          <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                          Initiating Swiggy Authorization...
                        </>
                      ) : (
                        <>
                          <ExternalLink className="h-4 w-4" />
                          Connect Official Swiggy Account (OAuth 2.1 PKCE)
                        </>
                      )}
                    </Button>

                    {/* Developer Whitelisting Notice Card */}
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2 text-xs">
                      <div className="flex items-center gap-2 font-bold text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>Swiggy Whitelisting Requirement</span>
                      </div>
                      <p className="text-muted-foreground text-[11px] leading-relaxed">
                        Swiggy Builders Club requires your third-party application or client ID to be whitelisted by the Swiggy Developers team. If your account displays <em>"Local Application isn't whitelisted yet"</em>, you can switch to the fully interactive Instamart Simulation Mode below to test orders, cart, tracking, and automatic pantry sync immediately.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleToggleMode("mock")}
                        className="w-full text-xs font-bold border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/15"
                      >
                        🧪 Switch to Instamart Simulation Mode (Zero Credentials Required)
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Mock Mode: Phone + OTP & 1-Click Login Form */
                <div className="grid gap-6 sm:grid-cols-2">
                  {/* Phone + OTP Login Box */}
                  <div className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-sm">
                    <div className="space-y-1">
                      <h4 className="font-bold text-base text-foreground flex items-center gap-2">
                        <Smartphone className="h-4 w-4 text-orange-500" />
                        Quick Phone Login
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Enter phone number to receive instant verification code
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground block mb-1">
                          Indian Mobile Number
                        </label>
                        <div className="flex rounded-xl border border-border overflow-hidden bg-surface">
                          <span className="px-3 py-2 text-xs font-bold text-muted-foreground bg-secondary/80 border-r border-border flex items-center">
                            +91
                          </span>
                          <input
                            type="tel"
                            maxLength={10}
                            value={phone}
                            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                            placeholder="9322348511"
                            className="flex-1 px-3 py-2 text-sm bg-transparent text-foreground outline-none font-medium"
                          />
                        </div>
                      </div>

                      {!otpSent ? (
                        <Button
                          onClick={handleSendOtp}
                          className="w-full bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold"
                        >
                          Send OTP
                        </Button>
                      ) : (
                        <div className="space-y-3 animate-fade-in">
                          <div>
                            <label className="text-xs font-semibold text-muted-foreground block mb-1">
                              Enter 4-Digit OTP
                            </label>
                            <input
                              type="text"
                              maxLength={4}
                              value={otp}
                              onChange={(e) => setOtp(e.target.value)}
                              placeholder="4829"
                              className="w-full px-3 py-2 text-center tracking-widest text-lg font-bold rounded-xl border border-border bg-surface text-foreground outline-none"
                            />
                            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">
                              ✓ Auto-filled demo OTP: 4829
                            </p>
                          </div>

                          <Button
                            onClick={handleVerifyOtp}
                            disabled={isLoggingIn || !otp}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                          >
                            {isLoggingIn ? "Verifying..." : "Verify & Connect Swiggy"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Fast 1-Click Demo & Real OAuth Info */}
                  <div className="rounded-2xl border border-border bg-surface/50 p-5 space-y-4 flex flex-col justify-between">
                    <div className="space-y-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 px-2.5 py-0.5 text-xs font-bold">
                        ⚡ Instant Access
                      </span>
                      <h4 className="font-bold text-base text-foreground">One-Touch Instant Demo Login</h4>
                      <p className="text-xs text-muted-foreground">
                        Simulate full Swiggy Instamart authentication immediately with a pre-configured verified session for college project testing.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Button
                        onClick={handleOneTouchLogin}
                        disabled={isLoggingIn}
                        className="w-full bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold text-xs py-2.5 rounded-xl shadow-md flex items-center justify-center gap-2"
                      >
                        <Zap className="h-4 w-4 fill-current" />
                        1-Click One-Touch Swiggy Login
                      </Button>

                      {swiggyMode === "real" && (
                        <p className="text-[11px] text-muted-foreground text-center">
                          Builders Club OAuth 2.1 PKCE redirect endpoint is enabled.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: LIVE ORDER TRACKING (15-MIN INSTAMART DELIVERY) */}
          {activeTab === "tracking" && activeOrder && (
            <div className="space-y-6">
              {/* Animated Progress Card */}
              <div className="rounded-3xl border border-orange-500/30 bg-gradient-to-br from-orange-950/20 via-card to-amber-950/20 p-6 space-y-6 shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center text-2xl shadow-lg">
                      🛵
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg text-foreground">Order #{activeOrder.orderId}</span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-500/15 text-orange-600 dark:text-orange-400">
                          {orderStage === 3 ? "Delivered 🎉" : "On the way ⚡"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Estimated arrival: {orderStage === 3 ? "Just delivered!" : `${orderEta} minutes`} · Swiggy Instamart Pod
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xl font-black text-orange-600 dark:text-orange-400">
                      ₹{activeOrder.totalAmount}
                    </span>
                    <p className="text-xs text-muted-foreground">{activeOrder.items?.length || 0} items ordered</p>
                  </div>
                </div>

                {/* Multi-step Tracker */}
                <div className="grid grid-cols-4 gap-2 pt-2 text-center">
                  {[
                    { title: "Order Placed", desc: "Received at Pod", icon: "✓" },
                    { title: "Store Packing", desc: "Instamart Store", icon: "📦" },
                    { title: "On The Way", desc: "Delivery Partner", icon: "🛵" },
                    { title: "Delivered", desc: "Doorstep Arrival", icon: "🏡" }
                  ].map((stg, idx) => {
                    const isDone = orderStage >= idx;
                    const isCurrent = orderStage === idx;
                    return (
                      <div key={idx} className="space-y-1.5 flex flex-col items-center">
                        <div
                          className={`h-9 w-9 rounded-2xl flex items-center justify-center text-xs font-bold transition-all ${
                            isCurrent
                              ? "bg-orange-500 text-white ring-4 ring-orange-500/30 scale-110 shadow-md animate-pulse"
                              : isDone
                              ? "bg-emerald-600 text-white shadow-xs"
                              : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {stg.icon}
                        </div>
                        <span className={`text-[11px] font-bold ${isDone ? "text-foreground" : "text-muted-foreground"}`}>
                          {stg.title}
                        </span>
                        <span className="text-[10px] text-muted-foreground hidden sm:inline">{stg.desc}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Real Swiggy MCP Live Tracking Poller */}
                {activeOrder?.isReal && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-orange-500/10 border border-orange-500/30 text-xs">
                    <span className="font-semibold text-orange-600 dark:text-orange-400">
                      Live Swiggy MCP Tracking: {activeOrder.status || "Processing"}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 border-orange-500/40 text-orange-600 dark:text-orange-400"
                      onClick={async () => {
                        const updated = await swiggyService.pollRealOrder(activeOrder.orderId);
                        if (updated) {
                          setActiveOrder({ ...activeOrder, ...updated });
                          if (updated.status === "delivered") setOrderStage(3);
                          toast.success(`Updated order status: ${updated.status}`);
                        } else {
                          toast.info("Order status is up to date.");
                        }
                      }}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" /> Poll Status via MCP
                    </Button>
                  </div>
                )}
              </div>

              {/* Ordered Items Breakdown */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Ordered Items ({activeOrder.items?.length || 0})</h4>
                <div className="rounded-2xl border border-border divide-y divide-border bg-surface/50 overflow-hidden">
                  {(activeOrder.items || []).map((itm, idx) => (
                    <div key={idx} className="p-3 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-medium text-foreground">{itm.name}</span>
                        <span className="text-muted-foreground block">{itm.quantity} {itm.unit || "pcs"} · {itm.category}</span>
                      </div>
                      <span className="font-bold text-foreground">₹{itm.price * itm.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Automation Callout Banner */}
              <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-4 text-xs text-emerald-700 dark:text-emerald-300 space-y-2">
                <p className="font-bold flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-emerald-500" />
                  Automated Smart Pantry Sync Engine Active
                </p>
                <p className="opacity-90">
                  Importing these items will automatically compute dynamic shelf-life days, store recommendations, generate Google Calendar expiry reminders, and trigger WhatsApp alerts!
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setActiveTab("cart")}>
                  Back to Cart
                </Button>
                <Button
                  onClick={() => handleImportToPantry(activeOrder)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm px-6 py-2.5 rounded-xl shadow-lg flex items-center gap-2"
                >
                  🛒 Add Ordered Items to Smart Pantry <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* TAB 4: PAST INSTAMART ORDERS */}
          {activeTab === "history" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-sm text-foreground">Swiggy Instamart Order History</h4>
                <Button size="sm" variant="ghost" onClick={loadPastOrders} disabled={loadingOrders} className="text-xs h-8">
                  <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loadingOrders ? "animate-spin" : ""}`} /> Refresh
                </Button>
              </div>

              {!isConnected ? (
                <div className="rounded-2xl border border-border p-6 text-center space-y-3">
                  <p className="text-xs text-muted-foreground">Log in with your Swiggy account to see your order history.</p>
                  <Button size="sm" onClick={() => setActiveTab("login")} className="bg-orange-600 hover:bg-orange-500 text-white text-xs">
                    Login to Swiggy
                  </Button>
                </div>
              ) : loadingOrders ? (
                <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-3">
                  <span className="h-6 w-6 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin inline-block" />
                  <p className="text-sm font-semibold text-foreground">Fetching orders from Swiggy Instamart MCP...</p>
                  <p className="text-xs text-muted-foreground">Querying https://mcp.swiggy.com/im using authenticated session.</p>
                </div>
              ) : orderFetchError ? (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 space-y-3">
                  <div className="flex items-center gap-2 font-bold text-red-600 dark:text-red-400">
                    <AlertTriangle className="h-5 w-5 shrink-0" />
                    <span className="text-sm font-semibold">Swiggy MCP Order Request Failed</span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono bg-background/50 p-3 rounded-xl border border-red-500/20 break-all">
                    {orderFetchError}
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={loadPastOrders}
                      className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold"
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry Sync
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setActiveTab("login")}
                      className="text-xs"
                    >
                      Check Account Status
                    </Button>
                  </div>
                </div>
              ) : pastOrders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center space-y-3">
                  <PackageCheck className="h-8 w-8 mx-auto text-muted-foreground/60" />
                  <p className="text-sm font-semibold">0 Swiggy Instamart orders returned.</p>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    Your account is authenticated via Swiggy Builders Club OAuth 2.1, but Swiggy MCP returned 0 past orders for this client.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={loadPastOrders}
                      variant="outline"
                      disabled={loadingOrders}
                      className="text-xs"
                    >
                      <RefreshCw className={`h-3 w-3 mr-1 ${loadingOrders ? "animate-spin" : ""}`} /> Refresh
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setActiveTab("cart")}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
                    >
                      🛒 Go to Cart ({cart.length})
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {pastOrders.map((ord) => (
                    <div
                      key={ord.orderId}
                      className="rounded-2xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-orange-500/40 transition-all shadow-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-foreground">Order #{ord.orderId}</span>
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 uppercase">
                            {ord.status || "Delivered"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(ord.createdAt || Date.now()).toLocaleString()} · {ord.itemCount || (ord.items || []).length || 0} items
                        </p>
                        {ord.items && ord.items.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {ord.items.map((it, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1 text-[11px] bg-secondary px-2 py-0.5 rounded-md font-medium text-foreground"
                              >
                                <span>{it.quantity || 1}x</span>
                                <span className="font-semibold">{it.name}</span>
                                {it.category && (
                                  <span className="text-[10px] text-muted-foreground">({it.category})</span>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4">
                        <span className="font-extrabold text-sm text-foreground">₹{ord.totalAmount}</span>
                        <Button
                          size="sm"
                          variant="soft"
                          onClick={async () => {
                            try {
                              const details = await swiggyService.getOrderDetails(ord.orderId);
                              handleImportToPantry(details);
                            } catch (err) {
                              toast.error(`Import failed: ${err.message}`);
                            }
                          }}
                          className="h-8 px-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"
                        >
                          📥 Import to Pantry
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Bar */}
        <div className="border-t border-border bg-secondary/30 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Swiggy Instamart Quick-Commerce API Active</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("login")}
              className="text-xs text-orange-600 dark:text-orange-400 font-semibold hover:underline"
            >
              {isConnected ? "Connected: Nilam Mhatre" : "Switch / Connect Account"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
