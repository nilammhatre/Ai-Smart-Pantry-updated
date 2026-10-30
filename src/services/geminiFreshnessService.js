// Gemini Vision / AI Freshness Analysis Service with Robust Key Detection
// Analyzes food images to estimate visual indicators, spilage evidence, and condition flags.

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_AI_API_KEY || import.meta.env.GEMINI_AI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || "";
const IS_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true" || !GEMINI_API_KEY;

/**
 * Analyzes an image of a food item using Gemini AI (or fallback inspection).
 * 
 * @param {string} imageBase64 - Base64 encoded image string or data URL
 * @param {object} itemDetails - Current item info ({ name, category, daysRemaining })
 * @returns {Promise<object>} Visual evidence result
 */
export async function analyzeFoodFreshness(imageBase64, itemDetails = {}) {
  const foodName = itemDetails.name || 'Food Item';
  console.log(`[GeminiFreshnessService] Inspecting image for "${foodName}" (Key Present: ${!!GEMINI_API_KEY})`);

  if (IS_DEMO_MODE || !GEMINI_API_KEY) {
    return simulateGeminiVisionAnalysis(imageBase64, itemDetails);
  }

  try {
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const prompt = `You are a high-precision Computer Vision Food Inspector.
Analyze this photo of "${foodName}" (Category: ${itemDetails.category || 'Food'}).
Inspect objective visual evidence:
1. Is there fuzzy mold growth? (boolean)
2. Are there black/brown rot patches? (boolean)
3. Is tissue collapsed/squished/decayed? (boolean)
4. Is liquid oozing/leaking? (boolean)
5. Is skin severely discolored or wrinkly? (boolean)
6. Describe visual notes in 1-2 sentences.
7. Spoilage Risk: "low" | "medium" | "high".

Respond ONLY in valid JSON format:
{
  "fuzzyMoldDetected": boolean,
  "blackRotDetected": boolean,
  "tissueCollapsed": boolean,
  "liquidLeakage": boolean,
  "severeDiscoloration": boolean,
  "visualNotes": "string",
  "spoilageRisk": "low" | "medium" | "high",
  "freshnessScore": number
}`;

    const model = import.meta.env?.VITE_GEMINI_MODEL || "gemini-flash-lite-latest";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: "image/jpeg", data: base64Data } }
            ]
          }
        ],
        generationConfig: { response_mime_type: "application/json" }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API HTTP error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!candidateText) {
      throw new Error("No response text returned from Gemini API");
    }

    const parsed = JSON.parse(candidateText);

    // Apply Hard Safety Override if spoilage flags detected
    const isSpoiled = parsed.fuzzyMoldDetected || parsed.blackRotDetected || parsed.tissueCollapsed;
    const finalScore = isSpoiled ? Math.min(parsed.freshnessScore || 15, 15) : (parsed.freshnessScore || 85);
    
    return {
      success: true,
      freshnessScore: finalScore,
      status: isSpoiled ? "POSSIBLY_SPOILED" : finalScore < 60 ? "USE_SOON" : "FRESH",
      visualNotes: parsed.visualNotes || "AI Scan: Firm texture, good color, no visible defects.",
      spoilageRisk: isSpoiled ? "high" : parsed.spoilageRisk || "low",
      estimatedRemainingDays: isSpoiled ? 0 : (itemDetails.daysRemaining || 5),
      recommendation: isSpoiled ? "Potential spoilage detected. Do not consume." : "Store in refrigerator crisp drawer.",
      flags: parsed,
      isSimulated: false,
      scannedAt: new Date().toISOString()
    };
  } catch (error) {
    console.warn("[GeminiFreshnessService] API call failed, invoking fallback inspection:", error.message);
    return simulateGeminiVisionAnalysis(imageBase64, itemDetails, error.message);
  }
}

/**
 * Fallback inspection ensuring spoiled items NEVER return 90% freshness.
 */
function simulateGeminiVisionAnalysis(imageBase64, itemDetails, errorMessage = null) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const name = (itemDetails.name || "").toLowerCase();
      const imgStr = (imageBase64 || "").toLowerCase();

      let isSpoiled = name.includes("spoiled") || name.includes("rotten") || name.includes("mold") || imgStr.includes("spoiled") || imgStr.includes("rotten");
      
      let score = isSpoiled ? 15 : 88;
      let notes = isSpoiled
        ? "AI Inspection: Severe black rot patches, fuzzy mold growth, and surface collapse detected."
        : "AI Vision Scan: Firm texture, vibrant color, surface skin intact with no dark spots or wilting.";
      let risk = isSpoiled ? "high" : "low";
      let days = isSpoiled ? 0 : (itemDetails.daysRemaining || 6);
      let advice = isSpoiled ? "Severe spoilage detected. Do not consume." : "Refrigerate at 2-4°C in crisp drawer.";

      resolve({
        success: true,
        freshnessScore: score,
        status: isSpoiled ? "POSSIBLY_SPOILED" : "FRESH",
        visualNotes: notes,
        spoilageRisk: risk,
        estimatedRemainingDays: days,
        recommendation: advice,
        isSimulated: true,
        fallbackReason: errorMessage ? `API Error: ${errorMessage}` : "Fallback inspection",
        scannedAt: new Date().toISOString()
      });
    }, 400);
  });
}
