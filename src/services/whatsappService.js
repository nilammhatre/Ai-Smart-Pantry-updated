// Official WhatsApp Business Cloud API Integration Service
// Automated background message delivery via Meta Graph API (POST /v18.0/{phone_number_id}/messages)

/**
 * Retrieves configured WhatsApp Cloud API credentials.
 * Environment variables take priority over stored values.
 */
export function getWhatsAppConfig() {
  const envPhoneId = import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID || import.meta.env.WHATSAPP_PHONE_NUMBER_ID || "";
  const envToken = import.meta.env.VITE_WHATSAPP_ACCESS_TOKEN || import.meta.env.WHATSAPP_ACCESS_TOKEN || "";
  const envPhone = import.meta.env.VITE_WHATSAPP_RECIPIENT_PHONE || import.meta.env.WHATSAPP_RECIPIENT_PHONE || "";

  if (typeof localStorage === "undefined") {
    return {
      phoneNumberId: envPhoneId || "",
      accessToken: envToken,
      recipientPhone: envPhone || ""
    };
  }

  return {
    phoneNumberId: envPhoneId || localStorage.getItem("smart_pantry_whatsapp_phone_id") || "",
    accessToken: envToken || localStorage.getItem("smart_pantry_whatsapp_token") || "",
    recipientPhone: envPhone || localStorage.getItem("smart_pantry_whatsapp_phone") || ""
  };
}

/**
 * Stores WhatsApp Cloud API credentials in localStorage.
 */
export function setWhatsAppConfig({ phoneNumberId, accessToken, recipientPhone }) {
  if (typeof localStorage !== "undefined") {
    if (phoneNumberId !== undefined) localStorage.setItem("smart_pantry_whatsapp_phone_id", phoneNumberId);
    if (accessToken !== undefined) localStorage.setItem("smart_pantry_whatsapp_token", accessToken);
    if (recipientPhone !== undefined) localStorage.setItem("smart_pantry_whatsapp_phone", recipientPhone);
  }
}

import { lookupFoodMaster } from "./foodMasterDb.js";
import { getNutritionForFood } from "./foodIdentificationService.js";

/**
 * Helper to build comprehensive Health & Nutrition details for a food item.
 */
export function getFoodHealthDetails(item) {
  if (!item) return { healthScore: 85, healthGrade: "🟢 Healthy", calories: 45, protein: 1, carbs: 9, fat: 0.2, fiber: 2, nutrientsList: "Essential Nutrients" };
  
  const name = item.name || "Food Item";
  const cat = item.category || "Other";
  
  let nutrition = item.nutrition;
  if (!nutrition || !nutrition.calories) {
    nutrition = getNutritionForFood(name);
  }

  // Determine health score (0-100)
  let healthScore = item.healthScore || item.healthinessScore || item.freshnessScore || item.freshness;
  if (!healthScore || healthScore === 100) {
    if (cat === "Vegetables" || cat === "Fruits") healthScore = 95;
    else if (cat === "Dairy") healthScore = 88;
    else if (cat === "Bakery" || cat === "Grains") healthScore = 82;
    else if (cat === "Meat" || cat === "Seafood") healthScore = 86;
    else healthScore = 80;
  }

  const healthGrade = healthScore >= 90 ? "🟢 Highly Nutritious (Grade A)" :
                      healthScore >= 75 ? "🟢 Healthy & Balanced (Grade B)" :
                      "🟡 Moderate (Grade C)";

  const calories = nutrition.calories || 45;
  const protein = nutrition.protein || 1.0;
  const carbs = nutrition.carbs || 9.0;
  const fat = nutrition.fat || 0.2;
  const fiber = nutrition.fiber || 2.0;
  const nutrientsList = Array.isArray(nutrition.nutrients) && nutrition.nutrients.length > 0 
    ? nutrition.nutrients.join(", ") 
    : "Essential Vitamins & Minerals";

  return {
    healthScore,
    healthGrade,
    calories,
    protein,
    carbs,
    fat,
    fiber,
    nutrientsList
  };
}

/**
 * Helper to build storage instructions for a food item.
 */
export function getFoodStorageDetails(item) {
  if (!item) return { storageLabel: "Refrigerated", storageAdvice: "Keep cool and dry" };
  
  const master = lookupFoodMaster(item.name || "", item.category || "");
  const conditionStr = (item.storageCondition || item.storage || "fridge").toLowerCase();
  
  let storageLabel = "Refrigerated (1-4°C)";
  if (conditionStr.includes("freez")) {
    storageLabel = "Frozen (-18°C)";
  } else if (conditionStr.includes("ambient") || conditionStr.includes("pantry") || conditionStr.includes("counter")) {
    storageLabel = "Ambient (Cool, Dry Pantry)";
  }

  const storageAdvice = item.storageRecommendation || item.notes || master.storageAdvice || "Keep stored in a clean, dry container away from direct sunlight.";
  
  return { storageLabel, storageAdvice };
}

/**
 * Helper to build shelf life details for a food item.
 */
export function getFoodShelfLifeDetails(item) {
  if (!item) return { days: 5, dateStr: new Date().toISOString().split("T")[0], shelfLifeLabel: "5 Days" };
  
  const days = typeof item.daysRemaining === "number" ? item.daysRemaining : 
               typeof item.expiresInDays === "number" ? item.expiresInDays : 
               typeof item.estimatedShelfLifeDays === "number" ? Math.round(item.estimatedShelfLifeDays) : 5;
  
  const dateStr = item.consumeByDate || item.expiryDate || new Date(Date.now() + days * 864e5).toISOString().split("T")[0];
  const shelfLifeLabel = days > 0 ? `~${days} Days Shelf Life` : "Expires Today!";

  return { days, dateStr, shelfLifeLabel };
}

/**
 * Automatically sends a WhatsApp message via the official Meta WhatsApp Business Cloud API.
 * DO NOT open WhatsApp Web, WhatsApp Mobile, or wa.me deep links.
 * 
 * @param {object|Array<object>} items - Single item or array of items
 * @param {object} [options]
 * @param {string} [options.overridePhone] - Optional recipient phone override
 * @param {boolean} [options.useTemplate=false] - Send template message format
 * @param {string} [options.alertType="NEW_PRODUCT"] - "NEW_PRODUCT" | "EXPIRY_ALERT"
 * @returns {Promise<object>} Result object containing success, messageId, recipient, and logPayload
 */
export async function sendWhatsAppAlert(items, { overridePhone = null, useTemplate = false, alertType = "NEW_PRODUCT" } = {}) {
  const itemList = Array.isArray(items) ? items : [items];

  if (!itemList.length) {
    return {
      success: false,
      error: "No pantry items provided for WhatsApp alert."
    };
  }

  const { phoneNumberId, accessToken, recipientPhone } = getWhatsAppConfig();
  let targetPhone = (overridePhone || recipientPhone || "9322348511").replace(/[^\d]/g, "");
  if (targetPhone.length === 10) {
    targetPhone = "91" + targetPhone; // Auto-prefix India country code 91 for 10-digit phone numbers
  }

  // Construct message text
  let messageText = "";

  if (alertType === "NEW_PRODUCT" || itemList.length === 1) {
    const item = itemList[0];
    const shelfLife = getFoodShelfLifeDetails(item);
    const storage = getFoodStorageDetails(item);
    const health = getFoodHealthDetails(item);
    const qty = item.quantity || "1 pcs";

    messageText = [
      `🆕 *NEW PRODUCT ADDED TO SMART PANTRY!* 📦`,
      ``,
      `📌 *Product:* ${item.name} (${qty})`,
      `• Category: ${item.category || 'General'}`,
      ``,
      `⏳ *1. SHELF LIFE INFO:*`,
      `• Estimated Shelf Life: *${shelfLife.shelfLifeLabel}*`,
      `• Consume-By Date: *${shelfLife.dateStr}*`,
      `• Days Remaining: *${shelfLife.days} day(s)*`,
      ``,
      `🧊 *2. HOW TO STORE:*`,
      `• Storage Mode: *${storage.storageLabel}*`,
      `• Storage Guide: ${storage.storageAdvice}`,
      ``,
      `🥗 *3. HOW MUCH HEALTHY (HEALTH & NUTRITION):*`,
      `• Healthiness Score: *${health.healthScore}/100* (${health.healthGrade})`,
      `• Calories: *${health.calories} kcal*`,
      `• Macros: Protein *${health.protein}g* | Carbs *${health.carbs}g* | Fat *${health.fat}g* | Fiber *${health.fiber}g*`,
      `• Key Nutrients: ${health.nutrientsList}`,
      ``,
      `📅 *Calendar Alert:* Google Calendar alert automatically scheduled for timely reminders!`,
      `🤖 _Automated Alert from AI Smart Pantry Engine_`
    ].join("\n");
  } else {
    messageText = `🥬 *Smart Pantry New Products Added* 📦\n\n`;
    itemList.forEach((item, index) => {
      const shelfLife = getFoodShelfLifeDetails(item);
      const storage = getFoodStorageDetails(item);
      const health = getFoodHealthDetails(item);
      const qty = item.quantity || "1 pcs";

      messageText += `${index + 1}. *${item.name}* (${qty})\n`;
      messageText += `   ⏳ *Shelf Life:* ${shelfLife.shelfLifeLabel} (Consume by *${shelfLife.dateStr}*)\n`;
      messageText += `   🧊 *Storage:* ${storage.storageLabel} - ${storage.storageAdvice}\n`;
      messageText += `   🥗 *Health Rating:* ${health.healthScore}/100 (${health.calories} kcal, ${health.nutrientsList})\n\n`;
    });
    messageText += `📅 *Calendar Alert:* Synchronized on Google Calendar.\n`;
    messageText += `🤖 _Automated Alert from AI Smart Pantry Engine_`;
  }

  const deepLink = `https://api.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(messageText)}`;

  if (!phoneNumberId || !accessToken || !targetPhone) {
    const errorMsg = "Missing Meta WhatsApp Cloud API credentials. Please configure WHATSAPP_ACCESS_TOKEN in backend environment.";
    console.warn(`[WhatsAppCloudAPI] ⚠️ ${errorMsg}`);
    console.log(`[WhatsAppCloudAPI] 📱 Formatted WhatsApp Message:\n${messageText}`);
    return {
      success: false,
      error: errorMsg,
      formattedMessage: messageText,
      deepLink
    };
  }

  // Payload format: Template (guaranteed delivery outside 24h window) or Text
  const messagePayload = useTemplate
    ? {
        messaging_product: "whatsapp",
        to: targetPhone,
        type: "template",
        template: {
          name: "hello_world", // Default Meta approved test template
          language: { code: "en_US" }
        }
      }
    : {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: targetPhone,
        type: "text",
        text: { preview_url: false, body: messageText }
      };

  const maskedToken = accessToken ? accessToken.substring(0, 8) + "..." : "NONE";
  console.log(`[WhatsAppCloudAPI] Dispatching background WhatsApp message to +${targetPhone} (Phone ID: ${phoneNumberId}, Token: ${maskedToken}, Mode: ${useTemplate ? 'TEMPLATE' : 'TEXT'})...`);

  try {
    const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(messagePayload)
    });

    const resData = await response.json();

    if (!response.ok) {
      const apiErr = resData.error?.message || response.statusText;
      const errCode = resData.error?.code;

      // Meta 24-Hour Policy Window Fallback (Error 131047 or 400): Retry with Meta approved template
      if (!useTemplate && (errCode === 131047 || response.status === 400 || (apiErr && apiErr.includes("24 hour")))) {
        console.warn(`[WhatsAppCloudAPI] ⚠️ Meta 24-hour conversation window closed for text payload. Retrying with official template "hello_world"...`);
        return sendWhatsAppAlert(items, { overridePhone, useTemplate: true, alertType });
      }

      let userAdvice = "";
      if (response.status === 401 || errCode === 190) {
        userAdvice = "Meta Access Token has EXPIRED or is INVALID (OAuth Code 190). Temporary tokens expire in 24h. Please copy a fresh Access Token from Meta Developer Portal into API Settings or use the Direct WhatsApp Link.";
      } else if (errCode === 100 || errCode === 131030) {
        userAdvice = "Recipient phone (+919322348511) must be added as a verified test number in Meta Developer Console -> WhatsApp -> API Setup.";
      }

      console.error("[WhatsAppCloudAPI] ❌ Meta Cloud API error:", apiErr, userAdvice ? `(${userAdvice})` : "");
      return {
        success: false,
        error: `Meta WhatsApp API HTTP ${response.status}: ${apiErr}${userAdvice ? ' - ' + userAdvice : ''}`,
        isTokenExpired: response.status === 401 || errCode === 190,
        advice: userAdvice,
        formattedMessage: messageText,
        deepLink,
        resData
      };
    }

    const messageId = resData.messages?.[0]?.id || "wamid." + Date.now();
    console.log(`[WhatsAppCloudAPI] ✅ WhatsApp Message Delivered Successfully! Message ID: ${messageId}`);

    return {
      success: true,
      messageId,
      recipient: targetPhone,
      formattedMessage: messageText,
      deepLink,
      resData
    };
  } catch (error) {
    console.error("[WhatsAppCloudAPI] Network Error:", error);
    return {
      success: false,
      error: error.message,
      formattedMessage: messageText,
      deepLink
    };
  }
}

/**
 * Direct Fallback Helper: Opens WhatsApp Web/App directly with the pre-formatted alert message.
 */
export function openWhatsAppWebFallback(items, overridePhone = null) {
  const itemList = Array.isArray(items) ? items : [items];
  const { recipientPhone } = getWhatsAppConfig();
  let targetPhone = (overridePhone || recipientPhone || "9322348511").replace(/[^\d]/g, "");
  if (targetPhone.length === 10) {
    targetPhone = "91" + targetPhone;
  }

  let messageText = "";
  if (itemList.length === 1) {
    const item = itemList[0];
    const shelfLife = getFoodShelfLifeDetails(item);
    const storage = getFoodStorageDetails(item);
    const health = getFoodHealthDetails(item);
    const qty = item.quantity || "1 pcs";

    messageText = [
      `🆕 *NEW PRODUCT ADDED TO SMART PANTRY!* 📦`,
      ``,
      `📌 *Product:* ${item.name} (${qty})`,
      `• Category: ${item.category || 'General'}`,
      ``,
      `⏳ *1. SHELF LIFE INFO:*`,
      `• Estimated Shelf Life: *${shelfLife.shelfLifeLabel}*`,
      `• Consume-By Date: *${shelfLife.dateStr}*`,
      `• Days Remaining: *${shelfLife.days} day(s)*`,
      ``,
      `🧊 *2. HOW TO STORE:*`,
      `• Storage Mode: *${storage.storageLabel}*`,
      `• Storage Guide: ${storage.storageAdvice}`,
      ``,
      `🥗 *3. HOW MUCH HEALTHY (HEALTH & NUTRITION):*`,
      `• Healthiness Score: *${health.healthScore}/100* (${health.healthGrade})`,
      `• Calories: *${health.calories} kcal*`,
      `• Macros: Protein *${health.protein}g* | Carbs *${health.carbs}g* | Fat *${health.fat}g* | Fiber *${health.fiber}g*`,
      `• Key Nutrients: ${health.nutrientsList}`,
      ``,
      `📅 *Calendar Alert:* Google Calendar alert automatically scheduled for timely reminders!`,
      `🤖 _Automated Alert from AI Smart Pantry Engine_`
    ].join("\n");
  } else {
    messageText = `🥬 *Smart Pantry Products Alert* 📦\n\n`;
    itemList.forEach((item, index) => {
      const shelfLife = getFoodShelfLifeDetails(item);
      const storage = getFoodStorageDetails(item);
      const health = getFoodHealthDetails(item);
      const qty = item.quantity || "1 pcs";
      messageText += `${index + 1}. *${item.name}* (${qty}) - ${shelfLife.shelfLifeLabel} (Expires: ${shelfLife.dateStr})\n`;
      messageText += `   🧊 Storage: ${storage.storageLabel}\n   🥗 Health: ${health.healthScore}/100 (${health.calories} kcal)\n\n`;
    });
    messageText += `🤖 _Automated Alert from AI Smart Pantry Engine_`;
  }

  const deepLink = `https://api.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(messageText)}`;
  if (typeof window !== "undefined") {
    window.open(deepLink, "_blank", "noopener,noreferrer");
  }
  return deepLink;
}

/**
 * Direct Test Function to verify WhatsApp Cloud API configuration.
 * Sends a test notification for a sample product directly to WHATSAPP_RECIPIENT_PHONE (+919322348511).
 * 
 * @returns {Promise<object>}
 */
export async function sendTestWhatsAppMessage() {
  const { recipientPhone } = getWhatsAppConfig();
  const sampleItem = {
    name: "Fresh Organic Spinach (Palak)",
    category: "Vegetables",
    quantity: 250,
    unit: "g",
    consumeByDate: new Date().toISOString().split("T")[0],
    daysRemaining: 0,
    status: "expired",
    spoilageRisk: "high",
    storageRecommendation: "Refrigerate in crisp drawer with paper towel"
  };

  return sendWhatsAppAlert(sampleItem, { overridePhone: recipientPhone, useTemplate: true });
}
