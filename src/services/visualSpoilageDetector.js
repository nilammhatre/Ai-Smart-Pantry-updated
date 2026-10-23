// Food-Specific Defect Inspector & Hard Food Safety Override Engine
// Combines AgriFreshNET Computer Vision Classifier, Gemini visual feature extraction, and Food Safety Override rules.

import { getFoodKnowledgeBase } from "./foodKnowledgeBase.js";
import { classifyFoodFreshnessVisionModel } from "./freshnessClassifierModel.js";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_AI_API_KEY || import.meta.env.GEMINI_AI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || "";

/**
 * Inspects food for item-specific visual defects (mold, rot, leakage, solanine, chlorosis, shriveling).
 * 
 * @param {string} imageBase64 - Photo base64 string
 * @param {object} itemDetails - { name, category }
 * @returns {Promise<object>} Detailed defect & freshness result
 */
export async function inspectVisualFreshnessAndSpoilage(imageBase64, itemDetails = {}) {
  const foodName = itemDetails.name || "Food Item";
  const kb = getFoodKnowledgeBase(foodName);

  console.log(`[VisualSpoilageDetector] 🔬 Executing AgriFreshNET & food-specific defect inspection for "${foodName}"...`);

  // STEP 1: Execute AgriFreshNET / VegQual Edge Vision Classifier Model
  const visionModelResult = await classifyFoodFreshnessVisionModel(imageBase64, foodName);

  // Default visual flags
  let visionFlags = {
    fuzzyMoldDetected: visionModelResult.detectedDefects.includes("fuzzy_mold"),
    blackRotDetected: visionModelResult.detectedDefects.includes("black_brown_rot"),
    liquidLeakage: false,
    tissueCollapsed: visionModelResult.detectedDefects.includes("tissue_collapse"),
    severeDiscoloration: visionModelResult.detectedDefects.includes("discoloration"),
    extensiveWrinkling: false,
    wiltingOrDehydration: visionModelResult.detectedDefects.includes("chlorosis_yellowing"),
    greenSolanineDetected: visionModelResult.detectedDefects.includes("green_solanine"),
    sproutingDetected: false,
    softWetPatches: false,
    brokenSkin: false,
    ripenessState: "RIPE",
    observedDetails: visionModelResult.visualEvidence.join(". ") || "Surface firm with normal color.",
    confidence: visionModelResult.confidence || 0.9
  };

  // STEP 2: Ask Gemini Vision ONLY for objective visual defect flags (if Gemini API key is available)
  if (GEMINI_API_KEY && imageBase64) {
    try {
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

      const prompt = `You are a high-precision Computer Vision Defect Inspector specializing in fresh produce quality.
Inspect this image of "${foodName}" (Category: ${itemDetails.category || kb.category}).

Knowledge Base Reference for ${foodName}:
- Expected Normal: ${kb.expectedVisuals?.normal || "Normal surface"}
- Warning Signs: ${kb.expectedVisuals?.warning || "Wrinkles or minor spots"}
- Critical Spoilage: ${kb.expectedVisuals?.criticalSpoilage || "Mold, rot, collapse, leakage"}

CRITICAL INSTRUCTIONS:
- Do NOT return a simple arbitrary score like "88% fresh".
- Do NOT confuse natural color/ripeness variation (e.g. yellow banana peel or red tomato color) with spoilage!
- Inspect specific visual defects for ${foodName}:
  * Tomato: fuzzy mold, black/brown rot, leaking/collapsed areas, broken skin, severe wrinkles.
  * Potato: green solanine areas, sprouts, rot, black/brown lesions, shriveling.
  * Onion: mold, soft/wet patches, discoloration, sprouts, collapsed layers.
  * Brinjal: brown/black patches, soft areas, wrinkles, mold.
  * Capsicum: wrinkles, dark spots, mold, collapsed/soft regions.
  * Carrot: mold, dark rot, excessive shriveling, soft/wet areas.
  * Leafy Vegetables: chlorosis yellowing, wilting, browning, sliminess, mold.

Evaluate these boolean flags:
1. fuzzyMoldDetected: Is there visible fuzzy mold growth (white, green, blue, black)?
2. blackRotDetected: Are there black or brown rot patches?
3. liquidLeakage: Is liquid oozing or leaking from decayed tissue?
4. tissueCollapsed: Are parts of the food squished, sunken, or structurally collapsed?
5. severeDiscoloration: Is there deep unnatural black/brown decay discoloration?
6. extensiveWrinkling: Is the skin severely shriveled or dehydrated?
7. wiltingOrDehydration: Are leaves or stems wilted/browned/slimy?
8. greenSolanineDetected: Are there green toxic solanine patches (for potatoes)?
9. sproutingDetected: Are there green/white sprouts?
10. softWetPatches: Are there mushy or wet decay patches?
11. brokenSkin: Is the protective skin cracked or ruptured with decay?
12. ripenessState: "UNRIPE" | "RIPE" | "OVERRIPE"
13. observedDetails: Concise description of exact visible symptoms.
14. confidence: Confidence score between 0.0 and 1.0.

Respond ONLY in valid JSON format:
{
  "fuzzyMoldDetected": boolean,
  "blackRotDetected": boolean,
  "liquidLeakage": boolean,
  "tissueCollapsed": boolean,
  "severeDiscoloration": boolean,
  "extensiveWrinkling": boolean,
  "wiltingOrDehydration": boolean,
  "greenSolanineDetected": boolean,
  "sproutingDetected": boolean,
  "softWetPatches": boolean,
  "brokenSkin": boolean,
  "ripenessState": "UNRIPE" | "RIPE" | "OVERRIPE",
  "observedDetails": "string",
  "confidence": number
}`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: "image/jpeg", data: base64Data } }
            ]
          }],
          generationConfig: { response_mime_type: "application/json" }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText) {
          const parsed = JSON.parse(candidateText);
          visionFlags = {
            ...visionFlags,
            ...parsed,
            fuzzyMoldDetected: visionFlags.fuzzyMoldDetected || parsed.fuzzyMoldDetected,
            blackRotDetected: visionFlags.blackRotDetected || parsed.blackRotDetected,
            tissueCollapsed: visionFlags.tissueCollapsed || parsed.tissueCollapsed
          };
        }
      }
    } catch (err) {
      console.warn("[VisualSpoilageDetector] Gemini visual inspection query error:", err.message);
    }
  }

  // STEP 3: APPLY DETERMINISTIC FOOD SAFETY OVERRIDE LAYER
  return applyHardFoodSafetyOverride(foodName, visionFlags, kb, visionModelResult);
}

/**
 * Applies strict deterministic food safety overrides.
 * Gemini or LLM responses CANNOT override these rules!
 */
export function applyHardFoodSafetyOverride(foodName, flags, kb, visionModelResult = null) {
  const cleanName = (foodName || "").toLowerCase();
  let initialScore = 95;
  const detectedDefects = [];
  const visualEvidence = [];

  // Check defects based on food type
  if (flags.fuzzyMoldDetected) {
    detectedDefects.push("fuzzy_mold");
    visualEvidence.push("Fuzzy fungal mold growth detected");
    initialScore -= 70;
  }
  if (flags.blackRotDetected) {
    detectedDefects.push("black_brown_rot");
    visualEvidence.push("Black/brown rot decay patches");
    initialScore -= 65;
  }
  if (flags.tissueCollapsed) {
    detectedDefects.push("tissue_collapse");
    visualEvidence.push("Structural tissue collapse / sunken soft spots");
    initialScore -= 50;
  }
  if (flags.liquidLeakage) {
    detectedDefects.push("liquid_leakage");
    visualEvidence.push("Liquid oozing / decay leakage");
    initialScore -= 45;
  }
  if (flags.brokenSkin) {
    detectedDefects.push("broken_skin");
    visualEvidence.push("Broken / ruptured skin with decay");
    initialScore -= 35;
  }
  if (flags.severeDiscoloration) {
    detectedDefects.push("severe_discoloration");
    visualEvidence.push("Severe unnatural dark discoloration");
    initialScore -= 35;
  }
  if (flags.greenSolanineDetected && cleanName.includes("potato")) {
    detectedDefects.push("green_solanine");
    visualEvidence.push("Toxic green solanine skin patch detected");
    initialScore -= 45;
  }
  if (flags.sproutingDetected) {
    detectedDefects.push("sprouts");
    visualEvidence.push("Sprouting shoots detected");
    initialScore -= 25;
  }
  if (flags.softWetPatches) {
    detectedDefects.push("soft_wet_patches");
    visualEvidence.push("Soft wet mushy decay patches");
    initialScore -= 40;
  }
  if (flags.extensiveWrinkling) {
    detectedDefects.push("extensive_wrinkles");
    visualEvidence.push("Extensive dehydration wrinkling");
    initialScore -= 20;
  }
  if (flags.wiltingOrDehydration) {
    detectedDefects.push("wilting_chlorosis");
    visualEvidence.push("Wilting & chlorosis yellowing");
    initialScore -= 25;
  }

  // Incorporate vision model outputs
  if (visionModelResult && visionModelResult.detectedDefects) {
    visionModelResult.detectedDefects.forEach(d => {
      if (!detectedDefects.includes(d)) detectedDefects.push(d);
    });
  }

  let status = "FRESH";
  let spoilageRisk = "LOW";
  let safetyWarning = null;
  let remainingDays = kb.baselineShelfLifeDays?.fridge || 5;

  const isCriticalSpoilage = flags.fuzzyMoldDetected || flags.blackRotDetected || flags.tissueCollapsed || (visionModelResult && visionModelResult.freshnessStatus === "ROTTEN");

  // HARD SAFETY OVERRIDE RULE 1: SEVERE MOLD / ROT / COLLAPSE
  if (isCriticalSpoilage) {
    status = "ROTTEN";
    spoilageRisk = "CRITICAL";
    initialScore = Math.min(initialScore, 10);
    remainingDays = 0;
    safetyWarning = "CRITICAL FOOD SAFETY ALERT: Severe rot, mold, or structural collapse detected. Do not consume.";
  }
  // HARD SAFETY OVERRIDE RULE 2: LIQUID LEAKAGE OR SOFT WET PATCHES + DISCOLORATION
  else if ((flags.liquidLeakage || flags.softWetPatches) && flags.severeDiscoloration) {
    status = "SPOILED";
    spoilageRisk = "HIGH";
    initialScore = Math.min(initialScore, 20);
    remainingDays = 0;
    safetyWarning = "SPOILED FOOD WARNING: Liquid leakage and dark discoloration detected. Potential spoilage.";
  }
  // HARD SAFETY OVERRIDE RULE 3: MULTIPLE DEFECTS (>= 2)
  else if (detectedDefects.length >= 2) {
    status = "SPOILED";
    spoilageRisk = "HIGH";
    initialScore = Math.min(initialScore, 25);
    remainingDays = 0;
    safetyWarning = "Multiple spoilage indicators observed. Physical inspection required before consumption.";
  }
  // RULE 4: OVERRIPE VS SEMI-FRESH VS FRESH
  else if (initialScore < 60 || flags.ripenessState === "OVERRIPE") {
    status = "OVERRIPE";
    spoilageRisk = "MEDIUM";
    remainingDays = Math.min(remainingDays, 1);
  } else if (initialScore < 80) {
    status = "SEMI_FRESH";
    spoilageRisk = "LOW";
    remainingDays = Math.min(remainingDays, 3);
  }

  const normalizedScore = Math.max(0, Math.min(100, Math.round(initialScore)));

  return {
    foodName,
    freshnessScore: normalizedScore,
    freshnessStatus: status,
    spoilageRisk,
    ripenessState: flags.ripenessState || "RIPE",
    confidence: flags.confidence || 0.92,
    detectedDefects,
    visualEvidence: visualEvidence.length > 0 ? visualEvidence : [flags.observedDetails || "Surface firm and intact."],
    safetyWarning,
    remainingDays,
    recommendation: status === "ROTTEN" || status === "SPOILED"
      ? "DO_NOT_CONSUME_UNTIL_INSPECTED"
      : status === "OVERRIPE"
      ? "CONSUME_IMMEDIATELY"
      : "REFRIGERATE_PROPERLY",
    flags
  };
}
