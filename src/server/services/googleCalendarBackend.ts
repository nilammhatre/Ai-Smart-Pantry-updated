// Official Google Calendar API Integration Service (Server-Side)
// Uses secure backend OAuth 2.0 credentials, token auto-refresh, and dual-event scheduling.

import type { FoodItemRecord } from "../db/repository";

export interface GoogleCalendarConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken: string;
}

let cachedAccessToken: string = "";
let tokenExpiresAt: number = 0;
let lastGoogleAuthErrorTime = 0;
let lastGoogleAuthErrorMessage = "";

export function resetGoogleCalendarAuthCache() {
  lastGoogleAuthErrorTime = 0;
  lastGoogleAuthErrorMessage = "";
  cachedAccessToken = "";
  tokenExpiresAt = 0;
}

export function getGoogleBackendConfig(): GoogleCalendarConfig {
  return {
    clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.VITE_GOOGLE_CALENDAR_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.VITE_GOOGLE_CALENDAR_CLIENT_SECRET || "",
    refreshToken: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN || process.env.VITE_GOOGLE_CALENDAR_REFRESH_TOKEN || "",
    accessToken: process.env.GOOGLE_CALENDAR_ACCESS_TOKEN || process.env.VITE_GOOGLE_CALENDAR_ACCESS_TOKEN || cachedAccessToken || ""
  };
}

export function isGoogleCalendarConfigured(): boolean {
  const config = getGoogleBackendConfig();
  // Authorized if we have either refresh token + client credentials OR a valid access token
  return Boolean((config.refreshToken && config.clientId && config.clientSecret) || config.accessToken);
}

/**
 * Auto-refreshes Google OAuth 2.0 access token using client secret & refresh token.
 */
export async function refreshGoogleAccessTokenServer(): Promise<{ success: boolean; accessToken?: string; error?: string }> {
  const { clientId, clientSecret, refreshToken } = getGoogleBackendConfig();

  if (!refreshToken || !clientId || !clientSecret) {
    return {
      success: false,
      error: "Google Calendar OAuth 2.0 is not authorized. Missing Client ID, Client Secret, or Refresh Token in backend environment."
    };
  }

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(6000),
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token"
      })
    });

    const data = await res.json();
    if (res.ok && data.access_token) {
      cachedAccessToken = data.access_token;
      tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000 - 60000;
      return { success: true, accessToken: data.access_token };
    } else {
      const err = data.error_description || data.error || `HTTP ${res.status}`;
      lastGoogleAuthErrorTime = Date.now();
      lastGoogleAuthErrorMessage = `Google OAuth Token Refresh Failed: ${err}`;
      return { success: false, error: lastGoogleAuthErrorMessage };
    }
  } catch (err: any) {
    lastGoogleAuthErrorTime = Date.now();
    lastGoogleAuthErrorMessage = `Network exception during Google token refresh: ${err.message}`;
    return { success: false, error: lastGoogleAuthErrorMessage };
  }
}

export async function getValidServerAccessToken(): Promise<string | null> {
  if (cachedAccessToken && Date.now() < tokenExpiresAt) {
    return cachedAccessToken;
  }
  const config = getGoogleBackendConfig();
  if (config.accessToken && !cachedAccessToken) {
    cachedAccessToken = config.accessToken;
    tokenExpiresAt = Date.now() + 3500 * 1000;
    return cachedAccessToken;
  }
  const refreshResult = await refreshGoogleAccessTokenServer();
  if (refreshResult.success && refreshResult.accessToken) {
    return refreshResult.accessToken;
  }
  return config.accessToken || null;
}

function calculate1DayBefore(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split("T")[0];
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().split("T")[0];
}

function calculateNextDay(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split("T")[0];
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().split("T")[0];
}

function normalizeFoodNameServer(name: string): string {
  if (!name) return "";
  return String(name)
    .toLowerCase()
    .replace(/\b(fresh|organic|raw|ripe|pack|packet|bottle|pcs|piece|pieces|kg|gm|g|ml|l|toned|pure)\b/gi, "")
    .replace(/[^\w\s]/g, "")
    .trim();
}

export function buildEventPayload(food: FoodItemRecord, eventType: "soon" | "expired") {
  const expiryDate = food.consume_by_date || food.estimated_consume_by_date || new Date().toISOString().split("T")[0];
  const soonDate = calculate1DayBefore(expiryDate);
  const eventDate = eventType === "soon" ? soonDate : expiryDate;
  const verifiedText = food.is_verified_expiry ? "Verified Printed Date" : "AI-Estimated Date";

  const summary = eventType === "soon"
    ? `🟡 Expiring Soon: ${food.name} (${food.quantity})`
    : `🔴 EXPIRED: ${food.name} (${food.quantity})`;

  const description = [
    `📦 Smart Pantry Food Record: ${food.name}`,
    `• Category: ${food.category}`,
    `• Quantity: ${food.quantity}`,
    `• Storage Method: ${food.storage_method}`,
    `• Consume-By Date: ${expiryDate} (${verifiedText})`,
    `• Freshness Rating: ${food.freshness_score}% (${food.spoilage_status})`,
    food.storage_advice ? `• Storage Guide: ${food.storage_advice}` : "",
    ``,
    `📅 Event Type: ${eventType === "soon" ? "1-Day Before Expiry Reminder" : "Date of Expiry Warning"}`,
    `• Item ID: ${food.id}`,
    `Automated calendar reminder synchronized by AI Smart Pantry.`
  ].filter(Boolean).join("\n");

  return {
    summary,
    description,
    start: { date: eventDate },
    end: { date: calculateNextDay(eventDate) },
    extendedProperties: {
      private: {
        source: "SmartPantry",
        foodId: food.id,
        foodName: String(food.name || "").trim().toLowerCase(),
        eventDate,
        eventType
      }
    },
    reminders: {
      useDefault: false,
      overrides: [{ method: "popup", minutes: 540 }] // 9:00 AM notification
    }
  };
}

async function executeCalendarRequest(
  url: string,
  options: RequestInit,
  retryAuth = true
): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  const token = await getValidServerAccessToken();
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Google Calendar integration unauthorized. Please configure Google OAuth credentials in backend environment."
    };
  }

  const headers = {
    ...((options.headers as any) || {}),
    Authorization: `Bearer ${token}`
  };

  try {
    const res = await fetch(url, { ...options, headers, signal: AbortSignal.timeout(6000) });

    // Handle token expiration / 401
    if (res.status === 401 && retryAuth) {
      cachedAccessToken = "";
      const refreshed = await refreshGoogleAccessTokenServer();
      if (refreshed.success) {
        return executeCalendarRequest(url, options, false);
      }
    }

    if (res.status === 204) {
      return { ok: true, status: 204 };
    }

    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return { ok: true, status: res.status, data };
    } else {
      const msg = data.error?.message || res.statusText || `HTTP ${res.status}`;
      return { ok: false, status: res.status, error: `Google Calendar API error: ${msg}` };
    }
  } catch (err: any) {
    return { ok: false, status: 500, error: `Calendar network error: ${err.message}` };
  }
}

/**
 * Queries Google Calendar API to check if an event for the food record or product name already exists on that date.
 * If multiple duplicate events exist from previous runs, cleans them up and retains only one.
 */
export async function findExistingRemoteCalendarEventServer(
  food: FoodItemRecord,
  eventDateStr: string,
  calendarId: string
): Promise<{ id: string; htmlLink?: string } | null> {
  try {
    const prevDay = calculate1DayBefore(eventDateStr);
    const nextDay = calculateNextDay(eventDateStr);
    const timeMin = `${prevDay}T00:00:00Z`;
    const timeMax = `${nextDay}T23:59:59Z`;

    const res = await executeCalendarRequest(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&maxResults=50`,
      { method: "GET" }
    );

    if (res.ok && res.data?.items && res.data.items.length > 0) {
      const rawName = (food.name || "").toLowerCase().trim();
      const normName = normalizeFoodNameServer(food.name);
      const foodIdStr = food.id ? String(food.id) : null;

      const matchingEvents = res.data.items.filter((e: any) => {
        if (e.status === "cancelled") return false;

        // 1. Verify date match
        const eStartDate = e.start?.date || (e.start?.dateTime ? e.start.dateTime.split("T")[0] : null);
        let dateMatches = (eStartDate === eventDateStr);
        if (!dateMatches && e.start?.dateTime) {
          try {
            const localIso = new Date(e.start.dateTime).toISOString().split("T")[0];
            dateMatches = (localIso === eventDateStr);
          } catch {}
        }
        if (!dateMatches) return false;

        // 2. Check foodId property
        const priv = e.extendedProperties?.private || {};
        if (foodIdStr && (priv.foodId === foodIdStr || priv.pantryItemId === foodIdStr)) {
          return true;
        }

        // 3. Check name in summary or description
        const summary = (e.summary || "").toLowerCase();
        const description = (e.description || "").toLowerCase();

        if (rawName && (summary.includes(rawName) || description.includes(rawName))) {
          return true;
        }

        if (normName && normName.length >= 3) {
          const normSummary = normalizeFoodNameServer(summary);
          if (summary.includes(normName) || normSummary.includes(normName)) {
            return true;
          }
        }

        return false;
      });

      if (matchingEvents.length > 0) {
        const primary = matchingEvents[0];
        console.log(`[GoogleCalendarBackend] 🛡️ Found existing event on ${eventDateStr} for "${food.name}" (ID: ${primary.id}). Avoiding duplicate creation.`);

        // Clean up redundant duplicates if more than 1 exists on this date
        if (matchingEvents.length > 1) {
          for (let i = 1; i < matchingEvents.length; i++) {
            console.log(`[GoogleCalendarBackend] 🧹 Removing redundant duplicate event ${matchingEvents[i].id} for "${food.name}" on ${eventDateStr}...`);
            executeCalendarRequest(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(matchingEvents[i].id)}`,
              { method: "DELETE" }
            ).catch(() => {});
          }
        }

        return { id: primary.id, htmlLink: primary.htmlLink };
      }
    }
  } catch (err) {
    console.warn("[GoogleCalendarBackend] Existing event check error:", err);
  }

  return null;
}

export async function createDualGoogleCalendarEvents(food: FoodItemRecord): Promise<{
  success: boolean;
  soonEventId?: string;
  expiryEventId?: string;
  htmlLink?: string;
  error?: string;
}> {
  if (!isGoogleCalendarConfigured()) {
    return {
      success: false,
      error: "Google Calendar integration unauthorized. Configure GOOGLE_CALENDAR_CLIENT_ID and REFRESH_TOKEN."
    };
  }

  const calendarId = food.google_calendar_id || "primary";
  const todayStr = new Date().toISOString().split("T")[0];
  const expiryDate = food.consume_by_date || food.estimated_consume_by_date || todayStr;
  const soonDate = calculate1DayBefore(expiryDate);

  let soonId: string | undefined = food.google_calendar_soon_event_id || undefined;
  let soonLink: string | undefined;

  // 1. Create/Update 1 Day Before Event ("soon") ONLY if soonDate !== expiryDate and not in the past
  if (soonDate !== expiryDate && soonDate >= todayStr) {
    const existingSoon = await findExistingRemoteCalendarEventServer(food, soonDate, calendarId);
    if (existingSoon) {
      soonId = existingSoon.id;
      soonLink = existingSoon.htmlLink;
      const soonPayload = buildEventPayload(food, "soon");
      await executeCalendarRequest(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingSoon.id)}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(soonPayload) }
      );
    } else {
      const soonPayload = buildEventPayload(food, "soon");
      const soonRes = await executeCalendarRequest(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(soonPayload) }
      );
      if (soonRes.ok) {
        soonId = soonRes.data?.id;
        soonLink = soonRes.data?.htmlLink;
      }
    }
  } else {
    console.log(`[GoogleCalendarBackend] 🛡️ Skipping "soon" event for "${food.name}" (soonDate=${soonDate}, expiryDate=${expiryDate}) to prevent repeated events on the same date.`);
  }

  // 2. Create/Update Expiry Date Event ("expired")
  let expiryId: string | undefined = food.google_calendar_expiry_event_id || undefined;
  let expiryLink: string | undefined;

  const existingExpiry = await findExistingRemoteCalendarEventServer(food, expiryDate, calendarId);
  if (existingExpiry) {
    expiryId = existingExpiry.id;
    expiryLink = existingExpiry.htmlLink;
    const expiryPayload = buildEventPayload(food, "expired");
    await executeCalendarRequest(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingExpiry.id)}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(expiryPayload) }
    );
  } else {
    const expiryPayload = buildEventPayload(food, "expired");
    const expiryRes = await executeCalendarRequest(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(expiryPayload) }
    );
    if (expiryRes.ok) {
      expiryId = expiryRes.data?.id;
      expiryLink = expiryRes.data?.htmlLink;
    }
  }

  if (soonId || expiryId) {
    const link = expiryLink || soonLink;
    return {
      success: true,
      soonEventId: soonId,
      expiryEventId: expiryId,
      htmlLink: link
    };
  } else {
    return {
      success: false,
      error: "Failed to create Google Calendar events without duplicates."
    };
  }
}

export async function updateGoogleCalendarEvents(food: FoodItemRecord): Promise<{
  success: boolean;
  soonEventId?: string;
  expiryEventId?: string;
  htmlLink?: string;
  error?: string;
}> {
  if (!isGoogleCalendarConfigured()) {
    return {
      success: false,
      error: "Google Calendar integration unauthorized."
    };
  }

  const calendarId = food.google_calendar_id || "primary";

  // If no event IDs exist yet, create them
  if (!food.google_calendar_soon_event_id && !food.google_calendar_expiry_event_id) {
    return createDualGoogleCalendarEvents(food);
  }

  let soonId = food.google_calendar_soon_event_id;
  let expiryId = food.google_calendar_expiry_event_id;
  let lastHtmlLink = food.google_calendar_html_link || "";
  let anySuccess = false;

  if (soonId) {
    const payload = buildEventPayload(food, "soon");
    const res = await executeCalendarRequest(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(soonId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );
    if (res.ok) {
      anySuccess = true;
      lastHtmlLink = res.data?.htmlLink || lastHtmlLink;
    } else if (res.status === 404 || res.status === 410) {
      // Recreate if deleted
      const re = await executeCalendarRequest(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      if (re.ok) {
        soonId = re.data?.id;
        anySuccess = true;
      }
    }
  }

  if (expiryId) {
    const payload = buildEventPayload(food, "expired");
    const res = await executeCalendarRequest(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(expiryId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );
    if (res.ok) {
      anySuccess = true;
      lastHtmlLink = res.data?.htmlLink || lastHtmlLink;
    } else if (res.status === 404 || res.status === 410) {
      const re = await executeCalendarRequest(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      if (re.ok) {
        expiryId = re.data?.id;
        anySuccess = true;
      }
    }
  }

  return {
    success: anySuccess,
    soonEventId: soonId || undefined,
    expiryEventId: expiryId || undefined,
    htmlLink: lastHtmlLink,
    error: anySuccess ? undefined : "Failed to update Google Calendar events"
  };
}

export async function deleteGoogleCalendarEvents(food: FoodItemRecord): Promise<{
  success: boolean;
  deletedCount: number;
  error?: string;
}> {
  if (!isGoogleCalendarConfigured()) {
    // If not configured, we gracefully indicate unauthorized rather than crashing
    return {
      success: false,
      deletedCount: 0,
      error: "Google Calendar not configured or unauthorized."
    };
  }

  const calendarId = food.google_calendar_id || "primary";
  const eventIds = [food.google_calendar_soon_event_id, food.google_calendar_expiry_event_id, food.google_calendar_event_id].filter(Boolean) as string[];

  if (eventIds.length === 0) {
    return { success: true, deletedCount: 0 };
  }

  let deletedCount = 0;
  let lastError: string | undefined;

  for (const eventId of new Set(eventIds)) {
    const res = await executeCalendarRequest(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: "DELETE" }
    );
    if (res.ok || res.status === 404 || res.status === 410) {
      deletedCount++;
    } else {
      lastError = res.error;
    }
  }

  return {
    success: deletedCount > 0 || !lastError,
    deletedCount,
    error: lastError
  };
}

export async function testGoogleCalendarConnection(): Promise<{
  configured: boolean;
  connected: boolean;
  error?: string;
}> {
  const configured = isGoogleCalendarConfigured();
  if (!configured) {
    return {
      configured: false,
      connected: false,
      error: "Google Calendar OAuth 2.0 credentials not configured in backend environment."
    };
  }

  try {
    const token = await getValidServerAccessToken();
    if (!token) {
      return {
        configured: true,
        connected: false,
        error: "Google Calendar OAuth 2.0 token is invalid or expired. Refresh token exchange failed."
      };
    }

    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(6000)
    });

    if (res.ok) {
      return { configured: true, connected: true };
    } else {
      const data = await res.json().catch(() => ({}));
      const msg = data.error?.message || `HTTP ${res.status}`;
      return {
        configured: true,
        connected: false,
        error: `Google Calendar API error (HTTP ${res.status}): ${msg}`
      };
    }
  } catch (err: any) {
    return {
      configured: true,
      connected: false,
      error: `Google Calendar connection error: ${err.message}`
    };
  }
}

export async function syncGoogleCalendarItemEvents(food: FoodItemRecord) {
  return updateGoogleCalendarEvents(food);
}

export async function deleteGoogleCalendarItemEvents(food: FoodItemRecord) {
  return deleteGoogleCalendarEvents(food);
}

