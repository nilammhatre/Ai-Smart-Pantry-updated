// Swiggy Service entry point with Mock / Real provider toggling
import { mockSwiggyProvider } from "./mockProvider";
import { realSwiggyProvider } from "./realProvider";

const MODE_KEY = "swiggy_service_mode";
const DEFAULT_MODE = import.meta.env.VITE_SWIGGY_DEFAULT_MODE || "mock";
const ACTIVE_ORDERS_KEY = "swiggy_active_orders";
const IMPORTED_ORDERS_KEY = "swiggy_imported_orders";

export const swiggyService = {
  // Get active service mode ('mock' or 'real')
  getMode() {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(MODE_KEY) : null;
    if (saved === "mock" || saved === "real") {
      return saved;
    }
    return DEFAULT_MODE;
  },

  // Set active service mode
  setMode(mode) {
    if (mode !== "mock" && mode !== "real") {
      console.warn(`[Swiggy Service] Invalid mode "${mode}" ignored.`);
      return;
    }
    console.log(`[Swiggy Service] Switching mode to: ${mode.toUpperCase()}`);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(MODE_KEY, mode);
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("swiggy_mode_changed", { detail: { mode } }));
    }
  },

  // Get current active provider
  getProvider() {
    const mode = this.getMode();
    return mode === "real" ? realSwiggyProvider : mockSwiggyProvider;
  },

  // Proxy: check connection status
  isConnected() {
    return this.getProvider().isConnected();
  },

  // Check partner whitelisting status
  getWhitelistingNotice() {
    return {
      isWhitelisted: false,
      title: "Swiggy Access Approval Required",
      message: "Local Application isn't whitelisted yet.",
      detail: "Swiggy partner API access requires enterprise registration and whitelisting from Swiggy Developers / Builders Club. Instamart Interactive Simulation Mode is available for zero-credential testing.",
      recommendedMode: "mock"
    };
  },

  // Proxy: login
  async login() {
    const mode = this.getMode();
    console.log(`[Swiggy Service] Logging in via ${mode.toUpperCase()} provider...`);
    try {
      if (mode === "real") {
        try {
          const res = await realSwiggyProvider.login();
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("swiggy_session_changed", { detail: { connected: true } }));
          }
          return res;
        } catch (realErr) {
          console.warn("[Swiggy Service] Real Swiggy OAuth blocked: Local Application isn't whitelisted yet. Switching to Demo/Simulation mode.");
          this.setMode("mock");
          const mockRes = await mockSwiggyProvider.login();
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("swiggy_session_changed", { detail: { connected: true, fallback: true, notice: realErr.message } }));
          }
          return { success: true, mode: "mock", fallback: true, message: realErr.message };
        }
      }

      const res = await mockSwiggyProvider.login();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("swiggy_session_changed", { detail: { connected: true } }));
      }
      return res;
    } catch (error) {
      console.error(`[Swiggy Service] Login error in ${mode} mode:`, error);
      throw error;
    }
  },

  // Proxy: handle OAuth callback
  async handleCallback(authCode) {
    console.log(`[Swiggy Service] Handling OAuth callback code in ${this.getMode().toUpperCase()} mode...`);
    try {
      const res = await this.getProvider().handleCallback(authCode);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("swiggy_session_changed", { detail: { connected: true } }));
      }
      return res;
    } catch (error) {
      console.error(`[Swiggy Service] OAuth callback error under ${this.getMode()} mode:`, error);
      throw error;
    }
  },

  async handleOAuthCallback(authCode) {
    return this.handleCallback(authCode);
  },

  // Proxy: logout
  async logout() {
    console.log(`[Swiggy Service] Logging out...`);
    await mockSwiggyProvider.logout();
    await realSwiggyProvider.logout();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("swiggy_session_changed", { detail: { connected: false } }));
    }
    return true;
  },

  // Active Orders Management across all pages
  getActiveOrders() {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(ACTIVE_ORDERS_KEY) : null;
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  saveActiveOrder(order) {
    try {
      const orders = this.getActiveOrders();
      const existingIdx = orders.findIndex((o) => o.orderId === order.orderId);
      if (existingIdx >= 0) {
        orders[existingIdx] = { ...orders[existingIdx], ...order };
      } else {
        orders.unshift(order);
      }
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(ACTIVE_ORDERS_KEY, JSON.stringify(orders));
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("swiggy_orders_changed", { detail: { orders } }));
      }
      return order;
    } catch (e) {
      console.error("[Swiggy Service] Failed to save active order:", e);
      return order;
    }
  },

  updateActiveOrderStatus(orderId, status) {
    const orders = this.getActiveOrders();
    const target = orders.find((o) => o.orderId === orderId);
    if (target) {
      target.status = status;
      if (status === "delivered" && !target.deliveredAt) {
        target.deliveredAt = new Date().toISOString();
      }
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(ACTIVE_ORDERS_KEY, JSON.stringify(orders));
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("swiggy_orders_changed", { detail: { orders } }));
      }
    }
    return target;
  },

  checkAndAdvanceOrders() {
    const orders = this.getActiveOrders();
    let changed = false;
    const now = Date.now();

    orders.forEach((order) => {
      // In simulation mode or simulated orders, advance via timeline
      if (!order.isReal && order.status !== "delivered" && order.status !== "cancelled") {
        const createdTime = new Date(order.createdAt).getTime();
        const elapsedSec = (now - createdTime) / 1000;

        let nextStatus = order.status;
        if (elapsedSec >= 45) {
          nextStatus = "delivered";
        } else if (elapsedSec >= 25) {
          nextStatus = "out_for_delivery";
        } else if (elapsedSec >= 10) {
          nextStatus = "packing";
        }

        if (nextStatus !== order.status) {
          order.status = nextStatus;
          if (nextStatus === "delivered") {
            order.deliveredAt = new Date().toISOString();
          }
          changed = true;
        }
      }
    });

    if (changed) {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(ACTIVE_ORDERS_KEY, JSON.stringify(orders));
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("swiggy_orders_changed", { detail: { orders } }));
      }
    }
    return orders;
  },

  // Poll genuine MCP order status for real orders
  async pollRealOrder(orderId) {
    if (!realSwiggyProvider.isConnected()) return null;
    try {
      const tracking = await realSwiggyProvider.trackOrder(orderId);
      if (tracking && tracking.status) {
        const statusMap = {
          delivered: "delivered",
          out_for_delivery: "out_for_delivery",
          dispatched: "out_for_delivery",
          packing: "packing",
          confirmed: "placed"
        };
        const mappedStatus = statusMap[tracking.status.toLowerCase()] || tracking.status;
        return this.updateActiveOrderStatus(orderId, mappedStatus);
      }
    } catch (err) {
      console.warn(`[Swiggy Service] Polling real order ${orderId} failed:`, err);
    }
    return null;
  },

  getImportedOrderIds() {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(IMPORTED_ORDERS_KEY) : null;
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  isOrderImported(orderId) {
    const imported = this.getImportedOrderIds();
    return imported.includes(orderId);
  },

  markOrderImported(orderId) {
    const orders = this.getActiveOrders();
    const target = orders.find((o) => o.orderId === orderId);
    if (target) {
      target.importedAt = new Date().toISOString();
      target.status = "delivered";
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(ACTIVE_ORDERS_KEY, JSON.stringify(orders));
      }
    }

    const imported = this.getImportedOrderIds();
    if (!imported.includes(orderId)) {
      imported.push(orderId);
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(IMPORTED_ORDERS_KEY, JSON.stringify(imported));
      }
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("swiggy_orders_changed", { detail: { orders } }));
    }
    return true;
  },

  getPendingDeliveredOrders() {
    this.checkAndAdvanceOrders();
    const orders = this.getActiveOrders();
    const imported = this.getImportedOrderIds();
    return orders.filter((o) => o.status === "delivered" && !o.importedAt && !imported.includes(o.orderId));
  },

  // Fast forward delivery for testing / simulation
  fastForwardOrderDelivery(orderId) {
    const orders = this.getActiveOrders();
    const target = orders.find((o) => o.orderId === orderId);
    if (target) {
      target.status = "delivered";
      target.deliveredAt = new Date().toISOString();
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(ACTIVE_ORDERS_KEY, JSON.stringify(orders));
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("swiggy_orders_changed", { detail: { orders } }));
      }
      return target;
    }
    return null;
  },

  // Search products
  async searchProducts(query, options = {}) {
    if (this.getMode() === "real") {
      return await realSwiggyProvider.searchProducts(query, options);
    }
    // Simulation fallback products
    const q = (query || "").toLowerCase();
    const fallbackCatalog = [
      { id: "im_sim_1", name: "Amul Taaza Fresh Toned Milk (500ml)", category: "Dairy", price: 28, unit: "packet", inStock: true },
      { id: "im_sim_2", name: "Fresh Organic Spinach / Palak (250g)", category: "Vegetables", price: 32, unit: "bunch", inStock: true },
      { id: "im_sim_3", name: "Fresh Hybrid Tomatoes (500g)", category: "Vegetables", price: 24, unit: "pack", inStock: true },
      { id: "im_sim_4", name: "Britannia 100% Whole Wheat Bread (400g)", category: "Bakery", price: 48, unit: "pack", inStock: true },
      { id: "im_sim_5", name: "Fresho Farm Eggs (Pack of 6)", category: "Eggs & Meat", price: 54, unit: "tray", inStock: true },
      { id: "im_sim_6", name: "Aashirvaad Superior MP Atta (1kg)", category: "Grains & Flour", price: 62, unit: "kg", inStock: true }
    ];
    return fallbackCatalog.filter((item) => item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q));
  },

  // Proxy: fetch orders list
  async getOrders() {
    console.log(`[Swiggy Service] Fetching orders list in ${this.getMode().toUpperCase()} mode...`);
    try {
      const providerOrders = await this.getProvider().getOrders();
      const activeOrders = this.getActiveOrders();
      const combined = [...(providerOrders || [])];
      for (const act of activeOrders) {
        if (!combined.some((o) => String(o.orderId) === String(act.orderId))) {
          combined.unshift(act);
        }
      }
      return combined;
    } catch (error) {
      console.error(`[Swiggy Service] Fetching orders failed in ${this.getMode()} mode:`, error);
      const active = this.getActiveOrders();
      if (active && active.length > 0) {
        return active;
      }
      throw error;
    }
  },

  // Proxy: fetch specific order details
  async getOrderDetails(orderId) {
    console.log(`[Swiggy Service] Fetching details for ${orderId} in ${this.getMode().toUpperCase()} mode...`);
    try {
      // Check active orders first
      const active = this.getActiveOrders().find((o) => o.orderId === orderId);
      if (active) {
        return active;
      }
      return await this.getProvider().getOrderDetails(orderId);
    } catch (error) {
      console.error(`[Swiggy Service] Fetching order details for ${orderId} failed in ${this.getMode()} mode:`, error);
      throw error;
    }
  },

  // Proxy: send cart to Swiggy
  async sendCartToSwiggy(cartItems, options = {}) {
    console.log(`[Swiggy Service] Sending cart items in ${this.getMode().toUpperCase()} mode...`);
    const isReal = this.getMode() === "real";
    try {
      const res = await this.getProvider().sendCartToSwiggy(cartItems, options);
      // Persist to active orders
      if (res && res.orderId) {
        this.saveActiveOrder({
          orderId: res.orderId,
          createdAt: res.createdAt || new Date().toISOString(),
          status: "placed",
          totalAmount: res.totalAmount || 0,
          items: res.items || cartItems,
          normalizedOrder: res.normalizedOrder || null,
          isReal
        });
      }
      return res;
    } catch (error) {
      console.error(`[Swiggy Service] Send cart failed in ${this.getMode()} mode:`, error);
      throw error;
    }
  }
};

export default swiggyService;
