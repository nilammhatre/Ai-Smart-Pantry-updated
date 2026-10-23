import { getFoodHealthDetails, getFoodStorageDetails, getFoodShelfLifeDetails } from "./whatsappService.js";

// Official Google Calendar API Integration Service (OAuth 2.0)
// Automated background event creation, update, deletion, and sync using Google Calendar REST API v3.

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_SECRET || "";
const GOOGLE_REFRESH_TOKEN = import.meta.env.VITE_GOOGLE_CALENDAR_REFRESH_TOKEN || "";
const GOOGLE_ACCESS_TOKEN = import.meta.env.VITE_GOOGLE_CALENDAR_ACCESS_TOKEN || "";
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_CALENDAR_API_KEY || "";

// In-flight request deduplication map to prevent concurrent duplicate API calls
const inFlightRequests = new Map();

/**
 * Calculates date string 1 day before the provided date string (YYYY-MM-DD).
 * @param {string} dateStr 
 * @returns {string} Date string 1 day before
 */
export function get1DayBeforeDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split("T")[0];
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

/**
 * Retrieves stored Google OAuth Access Token.
 * Prioritizes environment variables over stale localStorage values.
 * @returns {string}
 */
export function getStoredGoogleAccessToken() {
  return GOOGLE_ACCESS_TOKEN || (typeof localStorage !== "undefined" ? localStorage.getItem("smart_pantry_google_access_token") || "" : "");
}

/**
 * Stores Google OAuth Access Token in localStorage.
 * @param {string} token 
 */
export function setStoredGoogleAccessToken(token) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("smart_pantry_google_access_token", token);
  }
}

/**
 * Retrieves stored Google OAuth Refresh Token.
 * Prioritizes environment variables over stale localStorage values.
 * @returns {string}
 */
export function getStoredGoogleRefreshToken() {
  return GOOGLE_REFRESH_TOKEN || (typeof localStorage !== "undefined" ? localStorage.getItem("smart_pantry_google_refresh_token") || "" : "");
}

/**
 * Stores Google OAuth Refresh Token.
 * @param {string} token 
 */
export function setStoredGoogleRefreshToken(token) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("smart_pantry_google_refresh_token", token);
  }
}

/**
 * Uses a Refresh Token and Client Secret to automatically exchange for a fresh Google Access Token.
 * @returns {Promise<string|null>} Fresh access token or null
 */
export async function refreshGoogleAccessToken() {
  const refreshToken = getStoredGoogleRefreshToken();
  const clientId = GOOGLE_CLIENT_ID || (typeof localStorage !== "undefined" ? localStorage.getItem("smart_pantry_google_client_id") || "" : "");
  const clientSecret = GOOGLE_CLIENT_SECRET || (typeof localStorage !== "undefined" ? localStorage.getItem("smart_pantry_google_client_secret") || "" : "");

  if (!refreshToken || !clientId || !clientSecret) {
    console.warn("[GoogleCalendarAPI] Cannot auto-refresh access token: Missing Refresh Token or Client Secret.");
    return null;
  }

  try {
    console.log("[GoogleCalendarAPI] Auto-refreshing Google OAuth access token using refresh_token...");
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token"
      })
    });

    const data = await res.json();
    if (res.ok && data.access_token) {
      setStoredGoogleAccessToken(data.access_token);
      console.log("[GoogleCalendarAPI] ✅ Successfully refreshed Google OAuth access token!");
      return data.access_token;
    } else {
      console.error("[GoogleCalendarAPI] Refresh token exchange failed:", data.error_description || data.error);
      return null;
    }
  } catch (err) {
    console.error("[GoogleCalendarAPI] Exception during token refresh:", err);
    return null;
  }
}

/**
 * Helper to ensure a valid Google Access Token is retrieved.
 */
async function getValidAccessToken(customToken = null) {
  if (customToken) return customToken;
  let token = await refreshGoogleAccessToken();
  if (!token) {
    token = getStoredGoogleAccessToken();
  }
  return token;
}

/**
 * Prompts the user to authorize Google Calendar via Google Identity Services (GIS) OAuth 2.0.
 * @param {string} clientId 
 * @returns {Promise<string>} Access Token
 */
export function requestGoogleOAuthToken(clientId = GOOGLE_CLIENT_ID) {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      return reject(new Error("Browser environment required for Google OAuth authorization."));
    }

    const activeClientId = GOOGLE_CLIENT_ID || clientId || (typeof localStorage !== "undefined" ? localStorage.getItem("smart_pantry_google_client_id") : "") || "";

    if (!window.google?.accounts?.oauth2) {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => {
        initGISClient(activeClientId, resolve, reject);
      };
      script.onerror = () => reject(new Error("Failed to load Google Identity Services SDK."));
      document.head.appendChild(script);
    } else {
      initGISClient(activeClientId, resolve, reject);
    }
  });
}

function initGISClient(clientId, resolve, reject) {
  try {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/calendar.events",
      callback: (tokenResponse) => {
        if (tokenResponse.error) {
          reject(new Error(`Google OAuth error: ${tokenResponse.error_description || tokenResponse.error}`));
        } else if (tokenResponse.access_token) {
          setStoredGoogleAccessToken(tokenResponse.access_token);
          resolve(tokenResponse.access_token);
        } else {
          reject(new Error("No access token returned from Google OAuth."));
        }
      }
    });

    tokenClient.requestAccessToken({ prompt: "consent" });
  } catch (err) {
    reject(err);
  }
}

/**
 * Builds Google Calendar event payload for a given pantry item.
 * Supports eventType = "soon" (1 day before expiry) or "expired" (on date of expiry).
 * 
 * @param {object} item 
 * @param {string} [eventType="soon"] - "soon" | "expired"
 * @returns {object} Google Calendar Event payload
 */
export function buildEventPayload(item, eventType = "soon") {
  const todayStr = new Date().toISOString().split("T")[0];
  const expiryDate = item.consumeByDate || item.expiryDate || todayStr;
  const soonDate = get1DayBeforeDate(expiryDate);
  const health = getFoodHealthDetails(item);
  const storage = getFoodStorageDetails(item);
  const shelfLife = getFoodShelfLifeDetails(item);
  
  let summary = "";
  let eventDate = expiryDate;
  
  if (eventType === "soon") {
    eventDate = soonDate;
    summary = `🟡 Expiring Soon: ${item.name} (${item.quantity || 1} ${item.unit || 'pcs'})`;
  } else {
    eventDate = expiryDate;
    summary = `🔴 EXPIRED: ${item.name} (${item.quantity || 1} ${item.unit || 'pcs'})`;
  }

  const description = [
    `📦 Smart Pantry Product: ${item.name}`,
    `• Category: ${item.category || 'General'}`,
    `• Quantity: ${item.quantity || 1} ${item.unit || 'pcs'}`,
    ``,
    `⏳ 1. SHELF LIFE & EXPIRY:`,
    `• Estimated Shelf Life: ${shelfLife.shelfLifeLabel}`,
    `• Consume-By Date: ${expiryDate}`,
    `• Scheduled Alert Date: ${eventDate} (${eventType === 'soon' ? '1 Day Before Expiry Reminder' : 'Date of Expiry Alert'})`,
    `• Days Remaining: ${shelfLife.days} day(s)`,
    ``,
    `🧊 2. HOW TO STORE:`,
    `• Storage Mode: ${storage.storageLabel}`,
    `• Storage Instructions: ${storage.storageAdvice}`,
    ``,
    `🥗 3. HOW MUCH HEALTHY (HEALTH & NUTRITION):`,
    `• Healthiness Score: ${health.healthScore}/100 (${health.healthGrade})`,
    `• Calories: ${health.calories} kcal`,
    `• Macros: Protein ${health.protein}g | Carbs ${health.carbs}g | Fat ${health.fat}g | Fiber ${health.fiber}g`,
    `• Key Nutrients: ${health.nutrientsList}`,
    ``,
    `• Pantry Item ID: ${item.id}`,
    `Automated Google Calendar event synchronized by Smart Pantry.`
  ].join("\n");

  return {
    summary,
    description,
    start: { date: eventDate },
    end: { date: eventDate },
    extendedProperties: {
      private: {
        source: "SmartPantry",
        pantryItemId: String(item.id),
        eventType: eventType
      }
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 540 } // 9:00 AM popup reminder
      ]
    }
  };
}

/**
 * Queries Google Calendar API to check if an event for the pantry item or product name + date already exists on Google Calendar.
 * Ensures an event is NEVER repeated on the same day for the same product.
 * 
 * @param {object} item 
 * @param {string} accessToken 
 * @param {string} [eventType="expired"] - "soon" | "expired"
 * @returns {Promise<object|null>} Existing remote event object or null
 */
export async function findExistingRemoteCalendarEvent(item, accessToken, eventType = "expired") {
  if (!item || !accessToken) return null;
  const calendarId = item.googleCalendarId || "primary";
  const todayStr = new Date().toISOString().split("T")[0];
  const expiryDateStr = item.consumeByDate || item.expiryDate || todayStr;
  const eventDateStr = eventType === "soon" ? get1DayBeforeDate(expiryDateStr) : expiryDateStr;

  try {
    // 1. Query extendedProperties private property pantryItemId first
    if (item.id) {
      const propUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?privateExtendedProperty=${encodeURIComponent(`pantryItemId=${item.id}`)}`;
      const propRes = await fetch(propUrl, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });

      if (propRes.ok) {
        const propData = await propRes.json();
        if (propData.items && propData.items.length > 0) {
          const activeMatch = propData.items.find(e => {
            if (e.status === "cancelled") return false;
            const privateProp = e.extendedProperties?.private || {};
            if (privateProp.eventType) {
              return privateProp.eventType === eventType;
            }
            return true;
          });
          if (activeMatch) {
            console.log(`[GoogleCalendarAPI] Found existing remote event by pantryItemId for "${item.name}" (${eventType}: ID ${activeMatch.id})`);
            return activeMatch;
          }
        }
      }
    }

    // 2. Query search term (product name) on the specific date range (same day)
    const timeMin = `${eventDateStr}T00:00:00Z`;
    const timeMax = `${eventDateStr}T23:59:59Z`;
    const searchUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?q=${encodeURIComponent(item.name)}&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true`;
    
    const searchRes = await fetch(searchUrl, {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.items && searchData.items.length > 0) {
        const match = searchData.items.find(e => {
          if (e.status === "cancelled") return false;
          const s = (e.summary || "").toLowerCase();
          const n = (item.name || "").toLowerCase().trim();
          return s.includes(n);
        });

        if (match) {
          console.log(`[GoogleCalendarAPI] Found existing remote event on ${eventDateStr} for "${item.name}" (ID: ${match.id}). Preventing duplicate creation.`);
          return match;
        }
      }
    }
  } catch (err) {
    console.warn("[GoogleCalendarAPI] Remote duplicate check error:", err);
  }

  return null;
}

/**
 * Internal helper to create or patch a single event (soon or expired).
 */
async function createSingleCalendarEvent(item, eventType, accessToken, calendarId) {
  const remoteMatch = await findExistingRemoteCalendarEvent(item, accessToken, eventType);
  if (remoteMatch) {
    console.log(`[GoogleCalendarAPI] Existing remote event (${remoteMatch.id}) found on Google Calendar for "${item.name}" (${eventType}). Patching existing event...`);
    const payload = buildEventPayload(item, eventType);
    const patchRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(remoteMatch.id)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
    if (patchRes.ok) {
      const patchData = await patchRes.json();
      return { success: true, eventId: patchData.id, htmlLink: patchData.htmlLink };
    }
  }

  const payload = buildEventPayload(item, eventType);
  console.log(`[GoogleCalendarAPI] 📅 Creating Google Calendar event (${eventType}) for "${item.name}"...`);
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });

  if (response.status === 401) {
    console.warn(`[GoogleCalendarAPI] Access token expired (HTTP 401). Auto-refreshing access token using refresh_token...`);
    const refreshedToken = await refreshGoogleAccessToken();
    if (refreshedToken) {
      return createSingleCalendarEvent(item, eventType, refreshedToken, calendarId);
    }
  }

  const resData = await response.json();
  if (response.ok) {
    return { success: true, eventId: resData.id, htmlLink: resData.htmlLink };
  } else {
    const apiErr = resData.error?.message || response.statusText;
    return { success: false, error: `HTTP ${response.status}: ${apiErr}` };
  }
}

/**
 * 1. CREATE EVENT: Creates TWO Google Calendar events for a pantry item:
 *    - 1 Day Before Expiry Event (Expiring Soon)
 *    - Date of Expiry Event (EXPIRED)
 * 
 * @param {object} item 
 * @param {string} [customToken] 
 * @returns {Promise<object>}
 */
export async function createCalendarEvent(item, customToken = null) {
  if (!item || !item.name) {
    throw new Error("[CalendarService] Cannot create event: Invalid pantry item object.");
  }

  const todayStr = new Date().toISOString().split("T")[0];
  const expiryDateStr = item.consumeByDate || item.expiryDate || todayStr;
  const dedupKey = `${item.id || item.name.toLowerCase().trim()}_${expiryDateStr}`;

  if (inFlightRequests.has(dedupKey)) {
    console.log(`[GoogleCalendarAPI] ⏳ Creation request already in flight for "${item.name}". Awaiting existing request...`);
    return inFlightRequests.get(dedupKey);
  }

  const creationPromise = (async () => {
    let accessToken = await getValidAccessToken(customToken);
    if (!accessToken) {
      const errorMsg = "Missing valid Google OAuth Access Token. Please connect Google account in Admin Settings.";
      console.warn(`[GoogleCalendarAPI] ❌ ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
        calendarSyncStatus: "FAILED",
        calendarLastSyncedAt: new Date().toISOString()
      };
    }

    const calendarId = item.googleCalendarId || "primary";

    try {
      // 1. Create 1 Day Before Expiry Event ("soon")
      const soonRes = await createSingleCalendarEvent(item, "soon", accessToken, calendarId);

      // 2. Create Date of Expiry Event ("expired")
      const expiredRes = await createSingleCalendarEvent(item, "expired", accessToken, calendarId);

      if (soonRes.success || expiredRes.success) {
        const primaryEventId = expiredRes.eventId || soonRes.eventId;
        const htmlLink = expiredRes.htmlLink || soonRes.htmlLink;
        console.log(`[GoogleCalendarAPI] ✅ Dual events created successfully for "${item.name}"! (Soon ID: ${soonRes.eventId || 'N/A'}, Expired ID: ${expiredRes.eventId || 'N/A'})`);
        return {
          success: true,
          googleCalendarSoonEventId: soonRes.eventId || null,
          googleCalendarExpiryEventId: expiredRes.eventId || null,
          googleCalendarEventId: primaryEventId,
          googleCalendarId: calendarId,
          calendarEventId: primaryEventId,
          calendarHtmlLink: htmlLink,
          htmlLink: htmlLink,
          calendarSyncStatus: "SYNCED",
          calendarLastSyncedAt: new Date().toISOString()
        };
      } else {
        const err = expiredRes.error || soonRes.error || "Failed to create Google Calendar events.";
        return {
          success: false,
          error: err,
          calendarSyncStatus: "FAILED",
          calendarLastSyncedAt: new Date().toISOString()
        };
      }
    } catch (err) {
      console.error(`[GoogleCalendarAPI] Exception during dual event creation:`, err);
      return {
        success: false,
        error: err.message,
        calendarSyncStatus: "FAILED",
        calendarLastSyncedAt: new Date().toISOString()
      };
    }
  })();

  inFlightRequests.set(dedupKey, creationPromise);
  
  try {
    return await creationPromise;
  } finally {
    inFlightRequests.delete(dedupKey);
  }
}

/**
 * 2. UPDATE EVENT: Updates both existing Google Calendar events for a pantry item.
 * 
 * @param {object} item 
 * @param {string} [customToken] 
 * @returns {Promise<object>}
 */
export async function updateCalendarEvent(item, customToken = null) {
  if (!item || !item.name) {
    throw new Error("[CalendarService] Cannot update event: Invalid pantry item object.");
  }

  const soonEventId = item.googleCalendarSoonEventId;
  const expiredEventId = item.googleCalendarExpiryEventId || item.googleCalendarEventId || item.calendarEventId;
  const calendarId = item.googleCalendarId || "primary";

  if (!soonEventId && !expiredEventId) {
    console.log(`[GoogleCalendarAPI] No existing Google Calendar Event IDs found for "${item.name}". Creating events...`);
    return createCalendarEvent(item, customToken);
  }

  let accessToken = await getValidAccessToken(customToken);
  if (!accessToken) {
    const errorMsg = "Missing valid Google OAuth Access Token. Please connect Google account in Admin Settings.";
    return {
      success: false,
      error: errorMsg,
      calendarSyncStatus: "FAILED",
      calendarLastSyncedAt: new Date().toISOString()
    };
  }

  try {
    let updatedSoonId = soonEventId;
    let updatedExpiredId = expiredEventId;

    // 1. Update Soon Event
    if (soonEventId) {
      const payloadSoon = buildEventPayload(item, "soon");
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(soonEventId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` },
        body: JSON.stringify(payloadSoon)
      });
      if (res.status === 404 || res.status === 410) {
        const newSoon = await createSingleCalendarEvent(item, "soon", accessToken, calendarId);
        if (newSoon.success) updatedSoonId = newSoon.eventId;
      }
    } else {
      const newSoon = await createSingleCalendarEvent(item, "soon", accessToken, calendarId);
      if (newSoon.success) updatedSoonId = newSoon.eventId;
    }

    // 2. Update Expired Event
    if (expiredEventId) {
      const payloadExpired = buildEventPayload(item, "expired");
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(expiredEventId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` },
        body: JSON.stringify(payloadExpired)
      });
      if (res.status === 404 || res.status === 410) {
        const newExpired = await createSingleCalendarEvent(item, "expired", accessToken, calendarId);
        if (newExpired.success) updatedExpiredId = newExpired.eventId;
      }
    } else {
      const newExpired = await createSingleCalendarEvent(item, "expired", accessToken, calendarId);
      if (newExpired.success) updatedExpiredId = newExpired.eventId;
    }

    const primaryId = updatedExpiredId || updatedSoonId;
    return {
      success: true,
      googleCalendarSoonEventId: updatedSoonId,
      googleCalendarExpiryEventId: updatedExpiredId,
      googleCalendarEventId: primaryId,
      googleCalendarId: calendarId,
      calendarEventId: primaryId,
      calendarSyncStatus: "SYNCED",
      calendarLastSyncedAt: new Date().toISOString()
    };
  } catch (err) {
    console.error(`[GoogleCalendarAPI] Exception during event update:`, err);
    return {
      success: false,
      error: err.message,
      calendarSyncStatus: "FAILED",
      calendarLastSyncedAt: new Date().toISOString()
    };
  }
}

/**
 * Internal helper to delete a single event by ID.
 */
async function deleteSingleEvent(eventId, calendarId, accessToken) {
  if (!eventId) return { success: true };
  try {
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
    if (response.status === 204 || response.status === 404 || response.status === 410 || response.ok) {
      return { success: true };
    }
    return { success: false };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * 3. DELETE EVENT: Deletes all Google Calendar events associated with a pantry item.
 * 
 * @param {object} item 
 * @param {string} [customToken] 
 * @returns {Promise<object>}
 */
export async function deleteCalendarEvent(item, customToken = null) {
  if (!item) {
    return { success: true, message: "No item provided for deletion." };
  }

  const calendarId = item.googleCalendarId || "primary";
  const eventIds = new Set([
    item.googleCalendarSoonEventId,
    item.googleCalendarExpiryEventId,
    item.googleCalendarEventId,
    item.calendarEventId
  ].filter(Boolean));

  if (eventIds.size === 0) {
    console.log(`[GoogleCalendarAPI] Item "${item.name || item.id}" has no associated Google Calendar event IDs. Skipping API deletion.`);
    return { success: true, message: "No calendar events associated with this item." };
  }

  let accessToken = await getValidAccessToken(customToken);
  if (!accessToken) {
    const errorMsg = "Missing Google OAuth Access Token. Cannot delete Google Calendar event.";
    console.error(`[GoogleCalendarAPI] ❌ ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  try {
    for (const eventId of eventIds) {
      console.log(`[GoogleCalendarAPI] 🗑️ Deleting Google Calendar event ID ${eventId} for "${item.name}"...`);
      await deleteSingleEvent(eventId, calendarId, accessToken);
    }

    console.log(`[GoogleCalendarAPI] ✅ All Google Calendar events for "${item.name}" deleted successfully.`);
    return { success: true };
  } catch (err) {
    console.error(`[GoogleCalendarAPI] Exception during event deletion:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * 6. CALENDAR -> WEBSITE SYNC: Checks the status of a specific calendar event.
 * Detects if event was deleted on Google Calendar.
 * 
 * @param {object} item 
 * @param {string} [customToken] 
 * @returns {Promise<object>}
 */
export async function syncCalendarStatus(item, customToken = null) {
  if (!item) return { calendarSyncStatus: "NOT_SYNCED" };

  const eventId = item.googleCalendarExpiryEventId || item.googleCalendarEventId || item.googleCalendarSoonEventId || item.calendarEventId;
  const calendarId = item.googleCalendarId || "primary";

  if (!eventId) {
    return {
      calendarSyncStatus: "NOT_SYNCED",
      calendarLastSyncedAt: new Date().toISOString()
    };
  }

  let accessToken = await getValidAccessToken(customToken);
  if (!accessToken) {
    return {
      calendarSyncStatus: "UNAUTHENTICATED",
      calendarLastSyncedAt: new Date().toISOString()
    };
  }

  try {
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    });

    if (response.status === 404 || response.status === 410) {
      console.warn(`[GoogleCalendarAPI] Event ${eventId} was deleted directly on Google Calendar (status ${response.status}).`);
      return {
        calendarSyncStatus: "DELETED_ON_CALENDAR",
        calendarLastSyncedAt: new Date().toISOString()
      };
    }

    if (!response.ok) {
      return {
        calendarSyncStatus: "FAILED",
        calendarLastSyncedAt: new Date().toISOString()
      };
    }

    const data = await response.json();
    if (data.status === "cancelled") {
      return {
        calendarSyncStatus: "DELETED_ON_CALENDAR",
        calendarLastSyncedAt: new Date().toISOString()
      };
    }

    return {
      calendarSyncStatus: "SYNCED",
      calendarLastSyncedAt: new Date().toISOString(),
      calendarHtmlLink: data.htmlLink
    };
  } catch (err) {
    console.error(`[GoogleCalendarAPI] Exception during sync check:`, err);
    return {
      calendarSyncStatus: "FAILED",
      calendarLastSyncedAt: new Date().toISOString()
    };
  }
}

/**
 * Backward compatibility helper for legacy calls expecting createCalendarReminder
 */
export async function createCalendarReminder(item, customToken = null) {
  return createCalendarEvent(item, customToken);
}
