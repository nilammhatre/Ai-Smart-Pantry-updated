// Mock Swiggy Provider for Demo/Test Mode
import mockData from "./mockOrders.json";
import { normalizeOrder } from "./normalizer";

const TOKEN_KEY = "swiggy_mock_access_token";
const ORDERS_KEY = "swiggy_mock_orders_history";

function getStoredMockOrders() {
  try {
    if (typeof localStorage === "undefined") return mockData.orders;
    const raw = localStorage.getItem(ORDERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error("[Mock Swiggy] Error reading orders from localStorage:", e);
  }
  return mockData.orders;
}

function saveStoredMockOrders(orders) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  } catch (e) {
    console.error("[Mock Swiggy] Error saving orders to localStorage:", e);
  }
}

export const mockSwiggyProvider = {
  // Check if user is connected
  isConnected() {
    if (typeof localStorage === "undefined") return false;
    return !!localStorage.getItem(TOKEN_KEY);
  },

  // Simulates login/connection
  async login() {
    console.log("[Mock Swiggy] Simulating OAuth authorization redirect...");
    return new Promise((resolve) => {
      setTimeout(() => {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(TOKEN_KEY, "mock_token_xyz_12345");
        }
        console.log("[Mock Swiggy] OAuth login successful. Mock token set.");
        resolve(true);
      }, 600); // Small delay to feel premium/alive
    });
  },

  // Simulates OAuth callback code exchange
  async handleCallback(authCode) {
    console.log("[Mock Swiggy] OAuth callback code received:", authCode);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(TOKEN_KEY, "mock_token_xyz_12345");
    }
    return true;
  },

  // Simulates logout
  async logout() {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(TOKEN_KEY);
    }
    console.log("[Mock Swiggy] Session cleared.");
    return true;
  },

  // Get list of orders (basic metadata)
  async getOrders() {
    if (!this.isConnected()) {
      throw new Error("Unauthorized: Swiggy session not connected. Please log in first.");
    }
    
    console.log("[Mock Swiggy] Fetching orders history...");
    return new Promise((resolve) => {
      setTimeout(() => {
        const orders = getStoredMockOrders();
        // Return summary details for all mock orders sorted by date desc
        const ordersList = orders.map(order => ({
          orderId: order.orderId,
          createdAt: order.createdAt,
          deliveredAt: order.deliveredAt || order.createdAt,
          status: order.status || "delivered",
          totalAmount: order.totalAmount || 0,
          itemCount: (order.items || []).length
        }));
        resolve(ordersList);
      }, 400);
    });
  },

  // Get details for a specific order, normalized
  async getOrderDetails(orderId) {
    if (!this.isConnected()) {
      throw new Error("Unauthorized: Swiggy session not connected. Please log in first.");
    }

    console.log(`[Mock Swiggy] Fetching details for order ${orderId}...`);
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const orders = getStoredMockOrders();
        const order = orders.find(o => o.orderId === orderId);
        if (!order) {
          reject(new Error(`Order with ID ${orderId} not found.`));
        } else {
          // Normalize the order
          const normalized = normalizeOrder(order);
          resolve(normalized);
        }
      }, 400);
    });
  },

  // Simulate placing a cart order to Swiggy Instamart (15-min delivery)
  async sendCartToSwiggy(cartItems = []) {
    if (!this.isConnected()) {
      throw new Error("Unauthorized: Please connect your Swiggy Instamart account first.");
    }

    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      throw new Error("Cannot send empty cart to Swiggy Instamart.");
    }

    console.log("[Mock Swiggy] Processing cart order placement...", cartItems);

    return new Promise((resolve) => {
      setTimeout(() => {
        const now = new Date();
        const deliveredTime = new Date(now.getTime() + 15 * 60 * 1000); // +15 mins
        const orderNum = Math.floor(100000 + Math.random() * 900000);
        const orderId = `im_order_${orderNum}`;

        const formattedItems = cartItems.map((item) => {
          const price = item.price || Math.floor(Math.random() * 80) + 35;
          const qtyVal = parseInt(item.qty || item.quantity || "1", 10) || 1;
          return {
            name: item.name,
            quantity: qtyVal,
            category: item.category || "General Grocery",
            price: price
          };
        });

        const totalAmount = formattedItems.reduce((acc, i) => acc + (i.price * i.quantity), 0);

        const newOrder = {
          orderId,
          createdAt: now.toISOString(),
          deliveredAt: deliveredTime.toISOString(),
          status: "out_for_delivery",
          totalAmount,
          items: formattedItems
        };

        // Save order to history
        const existingOrders = getStoredMockOrders();
        const updatedOrders = [newOrder, ...existingOrders];
        saveStoredMockOrders(updatedOrders);

        const normalized = normalizeOrder(newOrder);

        resolve({
          success: true,
          orderId,
          status: "Order Confirmed — Out for 15-min Instamart Delivery",
          totalAmount,
          estimatedDeliveryMinutes: 15,
          createdAt: now.toISOString(),
          items: formattedItems,
          normalizedOrder: normalized
        });
      }, 900);
    });
  }
};

