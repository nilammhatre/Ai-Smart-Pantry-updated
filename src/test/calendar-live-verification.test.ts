import { describe, it, expect, afterAll } from "vitest";
import { testGoogleCalendarConnection, createDualGoogleCalendarEvents, deleteGoogleCalendarEvents } from "../server/services/googleCalendarBackend";
import type { FoodItemRecord } from "../server/db/schema";

describe("Live Google Calendar Events Verification", () => {
  let createdFood: FoodItemRecord;

  it("authenticates and successfully connects to Google Calendar API", async () => {
    const status = await testGoogleCalendarConnection();
    console.log("Google Calendar Connection Status:", status);
    expect(status.configured).toBe(true);
    expect(status.connected).toBe(true);
    expect(status.error).toBeUndefined();
  }, 20000);

  it("successfully generates calendar events for a pantry food item", async () => {
    createdFood = {
      id: "test_gcal_live_" + Date.now(),
      name: "Organic Whole Milk 1L",
      category: "Dairy",
      quantity: "1 L",
      storage_method: "Fridge",
      shelf_life_days: 7,
      consume_by_date: "2026-11-15",
      is_verified_expiry: 1,
      reminder_enabled: 1,
      created_at: new Date().toISOString()
    };

    const result = await createDualGoogleCalendarEvents(createdFood);
    console.log("Create Dual Calendar Events Result:", result);
    expect(result.success).toBe(true);
    expect(result.expiryEventId || result.soonEventId).toBeDefined();
    expect(result.htmlLink).toContain("google.com/calendar");

    createdFood.google_calendar_soon_event_id = result.soonEventId || null;
    createdFood.google_calendar_expiry_event_id = result.expiryEventId || null;
  }, 25000);

  afterAll(async () => {
    if (createdFood) {
      await deleteGoogleCalendarEvents(createdFood);
      console.log("Cleaned up live test calendar events.");
    }
  });
});
