import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildEventPayload,
  findExistingRemoteCalendarEvent,
  createCalendarEvent,
  get1DayBeforeDate,
  getNextDayDate,
  normalizeFoodName
} from "../services/calendarService.js";
import {
  buildEventPayload as buildServerEventPayload,
  findExistingRemoteCalendarEventServer,
  createDualGoogleCalendarEvents
} from "../server/services/googleCalendarBackend.js";

describe("Calendar Duplicate Prevention & Idempotency", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calculates 1 day after date correctly for exclusive RFC3339 all-day events", () => {
    expect(getNextDayDate("2026-10-28")).toBe("2026-10-29");
    expect(getNextDayDate("2026-12-31")).toBe("2027-01-01");
  });

  it("buildEventPayload sets start and exclusive next-day end date for all-day events", () => {
    const item = {
      id: "milk_123",
      name: "Fresh Milk 1L",
      consumeByDate: "2026-11-05",
      quantity: 1,
      unit: "pcs"
    };

    const payload = buildEventPayload(item, "expired");
    expect(payload.start.date).toBe("2026-11-05");
    expect(payload.end.date).toBe("2026-11-06");
    expect(payload.extendedProperties.private.pantryItemId).toBe("milk_123");
    expect(payload.extendedProperties.private.eventDate).toBe("2026-11-05");
  });

  it("normalizeFoodName strips noise units and punctuation for resilient matching", () => {
    expect(normalizeFoodName("Amul Fresh Toned Milk 500ml")).toContain("milk");
    expect(normalizeFoodName("Organic Spinach (Palak) 250g")).toContain("spinach");
    expect(normalizeFoodName("Tomatoes - Fresh")).toContain("tomato");
  });

  it("findExistingRemoteCalendarEvent detects existing event for the same item on the same date", async () => {
    const targetDate = "2026-11-05";
    const mockCalendarItems = [
      {
        id: "existing_evt_999",
        status: "confirmed",
        summary: "🔴 EXPIRED: Fresh Milk 1L (1 pcs)",
        start: { date: targetDate },
        end: { date: "2026-11-06" },
        extendedProperties: {
          private: {
            pantryItemId: "milk_123",
            source: "SmartPantry"
          }
        }
      }
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: mockCalendarItems })
    });

    const match = await findExistingRemoteCalendarEvent(
      { id: "milk_123", name: "Fresh Milk 1L", consumeByDate: targetDate },
      "mock_access_token",
      "expired",
      targetDate
    );

    expect(match).not.toBeNull();
    expect(match?.id).toBe("existing_evt_999");
  });

  it("findExistingRemoteCalendarEvent matches product by name when pantryItemId is absent", async () => {
    const targetDate = "2026-11-10";
    const mockCalendarItems = [
      {
        id: "existing_evt_spinach",
        status: "confirmed",
        summary: "🟡 Expiring Soon: Organic Spinach (Palak) (250 g)",
        start: { date: targetDate },
        end: { date: "2026-11-11" }
      }
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: mockCalendarItems })
    });

    const match = await findExistingRemoteCalendarEvent(
      { name: "Organic Spinach (Palak)", consumeByDate: "2026-11-11" },
      "mock_access_token",
      "soon",
      targetDate
    );

    expect(match).not.toBeNull();
    expect(match?.id).toBe("existing_evt_spinach");
  });

  it("findExistingRemoteCalendarEvent cleans up redundant duplicates if multiple exist on the same date", async () => {
    const targetDate = "2026-11-12";
    const mockCalendarItems = [
      {
        id: "evt_keep_primary",
        status: "confirmed",
        summary: "🔴 EXPIRED: Paneer (200g)",
        start: { date: targetDate },
        end: { date: "2026-11-13" }
      },
      {
        id: "evt_redundant_duplicate_1",
        status: "confirmed",
        summary: "🔴 EXPIRED: Paneer (200g)",
        start: { date: targetDate },
        end: { date: "2026-11-13" }
      }
    ];

    let deleteCalled = false;
    global.fetch = vi.fn().mockImplementation((url, opts) => {
      if (opts?.method === "DELETE") {
        deleteCalled = true;
        return Promise.resolve({ ok: true, status: 204 });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ items: mockCalendarItems })
      });
    });

    const match = await findExistingRemoteCalendarEvent(
      { name: "Paneer", consumeByDate: targetDate },
      "mock_access_token",
      "expired",
      targetDate
    );

    expect(match?.id).toBe("evt_keep_primary");
    expect(deleteCalled).toBe(true);
  });

  it("createCalendarEvent never creates repeated 'soon' event on same date as expiry event", async () => {
    // If consumeByDate is today, soon date would be in the past or identical
    const todayStr = new Date().toISOString().split("T")[0];
    const postCalls: any[] = [];

    global.fetch = vi.fn().mockImplementation((url, opts) => {
      if (opts?.method === "POST") {
        postCalls.push(JSON.parse(opts.body));
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: "new_evt_" + postCalls.length, htmlLink: "https://calendar.google.com" })
        });
      }
      // GET list returns empty (no existing events)
      return Promise.resolve({
        ok: true,
        json: async () => ({ items: [] })
      });
    });

    // Provide custom token so getValidAccessToken succeeds directly
    const res = await createCalendarEvent(
      {
        id: "item_today_1",
        name: "Bread",
        consumeByDate: todayStr
      },
      "test_token_123"
    );

    expect(res.success).toBe(true);
    // Because soonDate is in the past (< todayStr), only 1 event (expiry) should be POSTed, NOT 2 on the same date
    const eventsOnToday = postCalls.filter(p => p.start.date === todayStr);
    expect(eventsOnToday.length).toBe(1);
    expect(eventsOnToday[0].summary).toContain("EXPIRED");
  });

  it("server-side findExistingRemoteCalendarEventServer detects existing events to prevent duplicates", async () => {
    const targetDate = "2026-12-01";
    const mockCalendarItems = [
      {
        id: "srv_evt_bread",
        status: "confirmed",
        summary: "🔴 EXPIRED: Whole Wheat Bread (1 loaf)",
        start: { date: targetDate },
        end: { date: "2026-12-02" },
        extendedProperties: {
          private: { foodId: "food_bread_1" }
        }
      }
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: mockCalendarItems })
    });

    const food: any = {
      id: "food_bread_1",
      name: "Whole Wheat Bread",
      consume_by_date: targetDate,
      quantity: "1 loaf",
      category: "Bakery",
      storage_method: "Ambient",
      freshness_score: 90,
      spoilage_status: "GOOD"
    };

    const match = await findExistingRemoteCalendarEventServer(food, targetDate, "primary");
    expect(match).not.toBeNull();
    expect(match?.id).toBe("srv_evt_bread");
  });
});
