// Swiggy Service entry point with Mock / Real provider toggling
import { mockSwiggyProvider } from "./mockProvider";
import { realSwiggyProvider } from "./realProvider";

const MODE_KEY = "swiggy_service_mode";
const DEFAULT_MODE = import.meta.env.VITE_SWIGGY_DEFAULT_MODE || "mock";

export const swiggyService = {
  // Get active service mode ('mock' or 'real')
  getMode() {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === "mock" || saved === "real") {
      return saved;
    }
    return DEFAULT_MODE;
  },

  // Set active service mode and log out of the other one to be safe
  setMode(mode) {
    if (mode !== "mock" && mode !== "real") {
      console.warn(`[Swiggy Service] Invalid mode "${mode}" ignored.`);
      return;
    }
    console.log(`[Swiggy Service] Switching mode to: ${mode.toUpperCase()}`);
    localStorage.setItem(MODE_KEY, mode);
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

  // Proxy: login
  async login() {
    console.log(`[Swiggy Service] Logging in via ${this.getMode().toUpperCase()} provider...`);
    try {
      const res = await this.getProvider().login();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("swiggy_session_changed", { detail: { connected: true } }));
      }
      return res;
    } catch (error) {
      console.error(`[Swiggy Service] Login error under ${this.getMode()} mode:`, error);
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

  // Proxy: logout
  async logout() {
    console.log(`[Swiggy Service] Logging out...`);
    // Logout from both just in case
    await mockSwiggyProvider.logout();
    await realSwiggyProvider.logout();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("swiggy_session_changed", { detail: { connected: false } }));
    }
    return true;
  },

  // Proxy: fetch orders list
  async getOrders() {
    console.log(`[Swiggy Service] Fetching orders list in ${this.getMode().toUpperCase()} mode...`);
    try {
      return await this.getProvider().getOrders();
    } catch (error) {
      console.error(`[Swiggy Service] Fetching orders failed in ${this.getMode()} mode:`, error);
      throw error;
    }
  },

  // Proxy: fetch specific order details
  async getOrderDetails(orderId) {
    console.log(`[Swiggy Service] Fetching details for ${orderId} in ${this.getMode().toUpperCase()} mode...`);
    try {
      return await this.getProvider().getOrderDetails(orderId);
    } catch (error) {
      console.error(`[Swiggy Service] Fetching order details for ${orderId} failed in ${this.getMode()} mode:`, error);
      throw error;
    }
  },

  // Proxy: send cart to Swiggy
  async sendCartToSwiggy(cartItems) {
    console.log(`[Swiggy Service] Sending cart items in ${this.getMode().toUpperCase()} mode...`);
    try {
      return await this.getProvider().sendCartToSwiggy(cartItems);
    } catch (error) {
      console.error(`[Swiggy Service] Send cart failed in ${this.getMode()} mode:`, error);
      throw error;
    }
  }
};
export default swiggyService;
