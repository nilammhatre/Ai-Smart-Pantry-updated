import { describe, it, expect, beforeEach } from "vitest";
import { swiggyService } from "../services/swiggy/swiggyService.js";
import { pantryDb } from "../services/swiggy/pantryDb.js";
import { normalizeSwiggyItem, normalizeOrder } from "../services/swiggy/normalizer.js";
import { realSwiggyProvider, WHITELISTING_STATUS } from "../services/swiggy/realProvider.js";

describe("Swiggy Instamart Integration & Whitelisting Mitigation Tests", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe("1. Whitelisting Notice & Disabled Blocked Sign-In Flow", () => {
    it("gracefully disables real OAuth sign-in and reports that local application is not whitelisted", async () => {
      // Direct call to realSwiggyProvider.login rejects with clear whitelisting message
      await expect(realSwiggyProvider.login()).rejects.toThrow(
        /Local Application isn't whitelisted yet/i
      );

      // Verify WHITELISTING_STATUS structure
      expect(WHITELISTING_STATUS.isWhitelisted).toBe(false);
      expect(WHITELISTING_STATUS.message).toContain("Local Application isn't whitelisted yet");
    });

    it("swiggyService.login() automatically falls back to simulation mode when real OAuth is blocked", async () => {
      swiggyService.setMode("real");
      expect(swiggyService.getMode()).toBe("real");

      // Attempting login under 'real' mode automatically catches blocked OAuth and switches to simulation
      const res = await swiggyService.login();
      expect(res.success).toBe(true);
      expect(res.mode).toBe("mock");
      expect(res.fallback).toBe(true);
      expect(swiggyService.getMode()).toBe("mock");
      expect(swiggyService.isConnected()).toBe(true);
    });

    it("provides whitelisting notice details without attempting external network calls", () => {
      const notice = swiggyService.getWhitelistingNotice();
      expect(notice.isWhitelisted).toBe(false);
      expect(notice.message).toBe("Local Application isn't whitelisted yet.");
      expect(notice.recommendedMode).toBe("mock");
    });
  });

  describe("2. Non-Food Item Filtering", () => {
    it("accurately flags non-food cleaning and personal care products as isFood: false", () => {
      const household = normalizeSwiggyItem({
        name: "Comfort Fabric Conditioner (Morning Fresh) 860ml",
        category: "Cleaning & Household",
        quantity: 1,
        price: 235
      });
      expect(household.isFood).toBe(false);

      const personalCare = normalizeSwiggyItem({
        name: "Colgate Strong Teeth Toothpaste 100g",
        category: "Personal Care",
        quantity: 1,
        price: 65
      });
      expect(personalCare.isFood).toBe(false);

      const cleanerByName = normalizeSwiggyItem({
        name: "Vim Dishwash Gel 500ml",
        category: "Groceries", // Generic category but cleaner by name
        quantity: 1,
        price: 110
      });
      expect(cleanerByName.isFood).toBe(false);
    });

    it("accurately flags genuine grocery and produce items as isFood: true", () => {
      const milk = normalizeSwiggyItem({
        name: "Amul Taaza Toned Milk 1L",
        category: "Dairy",
        quantity: 2,
        price: 54
      });
      expect(milk.isFood).toBe(true);
      expect(milk.category).toBe("Dairy");

      const spinach = normalizeSwiggyItem({
        name: "Fresh Organic Spinach / Palak 250g",
        category: "Fresh Vegetables",
        quantity: 1,
        price: 32
      });
      expect(spinach.isFood).toBe(true);
      expect(spinach.category).toBe("Vegetables");

      const bread = normalizeSwiggyItem({
        name: "Whole Wheat Bread 400g",
        category: "Dairy & Bread",
        quantity: 1,
        price: 48
      });
      expect(bread.isFood).toBe(true);
      expect(bread.category).toBe("Bakery");
    });

    it("normalizes an order into foodItems and nonFoodItems collections", () => {
      const mixedOrder = {
        orderId: "im_test_mixed_01",
        createdAt: new Date().toISOString(),
        items: [
          { name: "Amul Taaza Milk 500ml", category: "Dairy", quantity: 1, price: 28 },
          { name: "Harpic Power Plus 500ml", category: "Cleaning", quantity: 1, price: 95 },
          { name: "Fresh Tomatoes 500g", category: "Fresh Vegetables", quantity: 1, price: 24 }
        ]
      };

      const normalized = normalizeOrder(mixedOrder);
      expect(normalized.items.length).toBe(3);
      expect(normalized.foodItems.length).toBe(2);
      expect(normalized.nonFoodItems.length).toBe(1);
      expect(normalized.nonFoodItems[0].name).toContain("Harpic");
    });
  });

  describe("3. Active Orders Tracking & Status Lifecycle in Simulation Mode", () => {
    it("places simulated Instamart order, tracks delivery, and advances status", async () => {
      // Connect in simulation mode
      swiggyService.setMode("mock");
      await swiggyService.login();

      // Place demo order
      const cartItems = [
        { name: "Amul Taaza Milk 500ml", quantity: 2, price: 28, category: "Dairy" },
        { name: "Fresh Organic Spinach 250g", quantity: 1, price: 32, category: "Vegetables" }
      ];
      const orderRes = await swiggyService.sendCartToSwiggy(cartItems);
      expect(orderRes.success).toBe(true);
      expect(orderRes.orderId).toBeDefined();

      // Verify persisted in active orders
      const orders = swiggyService.getActiveOrders();
      expect(orders.some(o => o.orderId === orderRes.orderId)).toBe(true);

      // Advance delivery to delivered
      swiggyService.fastForwardOrderDelivery(orderRes.orderId);
      const updated = swiggyService.getActiveOrders().find(o => o.orderId === orderRes.orderId);
      expect(updated?.status).toBe("delivered");
      expect(updated?.deliveredAt).toBeDefined();

      // Appears in pending delivered orders for global confirmation prompt
      const pending = swiggyService.getPendingDeliveredOrders();
      expect(pending.some(p => p.orderId === orderRes.orderId)).toBe(true);
    });

    it("marks order as imported and avoids repeated confirmation prompts", () => {
      const orderId = "im_order_prompt_01";
      swiggyService.saveActiveOrder({
        orderId,
        createdAt: new Date().toISOString(),
        deliveredAt: new Date().toISOString(),
        status: "delivered",
        totalAmount: 120,
        items: [{ name: "Brown Bread", quantity: 1, price: 50, isFood: true }]
      });

      expect(swiggyService.getPendingDeliveredOrders().some(o => o.orderId === orderId)).toBe(true);

      // User confirms import
      swiggyService.markOrderImported(orderId);
      expect(swiggyService.isOrderImported(orderId)).toBe(true);
      expect(swiggyService.getPendingDeliveredOrders().some(o => o.orderId === orderId)).toBe(false);
    });
  });

  describe("4. Duplicate Import Prevention & Dynamic Shelf-Life", () => {
    it("prevents importing the same Instamart order items twice into the pantry", () => {
      const items = [
        {
          name: "Fresh Hybrid Tomatoes",
          category: "Vegetables",
          quantity: 1,
          unit: "kg",
          orderId: "im_dup_test_101"
        },
        {
          name: "Amul Taaza Toned Milk",
          category: "Dairy",
          quantity: 2,
          unit: "L",
          orderId: "im_dup_test_101"
        }
      ];

      // First import
      const firstBatch = pantryDb.addItems(items, false);
      expect(firstBatch.length).toBe(2);

      // Second import with identical orderId and names
      const secondBatch = pantryDb.addItems(items, false);
      expect(secondBatch.length).toBe(0); // All duplicates dropped!
    });

    it("enriches imported items with valid shelf-life days and storage conditions", () => {
      const items = [
        {
          name: "Fresh Organic Spinach (Palak)",
          category: "Vegetables",
          quantity: 250,
          unit: "g",
          storageCondition: "fridge"
        }
      ];

      const added = pantryDb.addItems(items, false);
      expect(added.length).toBe(1);
      expect(added[0].daysRemaining).toBeGreaterThan(0);
      expect(added[0].estimatedShelfLifeDays).toBeGreaterThan(0);
      expect(added[0].expiryDate).toBeDefined();
      expect(added[0].consumeByDate).toBeDefined();
    });
  });
});
