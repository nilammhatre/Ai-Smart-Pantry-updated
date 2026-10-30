// Smart Recipe Recommendation Engine
// Matches available pantry items (prioritizing foods expiring soon) with curated recipes & Gemini AI reasoning.

import { recipes as baseRecipes } from "@/lib/pantry-data";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_AI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_AI_API_KEY || "";

/**
 * Generates personalized recipe recommendations prioritizing expiring ingredients.
 * 
 * @param {Array<object>} pantryItems - Array of pantry items
 * @param {object} [options]
 * @param {string} [options.dietaryPreference] - 'All' | 'Vegetarian' | 'Vegan' | 'Gluten-Free'
 * @returns {Promise<Array<object>>} Sorted & enriched list of recipe recommendations
 */
export async function getSmartRecipeRecommendations(pantryItems = [], { dietaryPreference = "All" } = {}) {
  console.log(`[RecipeEngine] 🍳 Generating recipe recommendations for ${pantryItems.length} pantry items...`);

  // 1. Identify foods expiring within 3 days
  const expiringItems = pantryItems.filter(i => (i.expiresInDays !== undefined ? i.expiresInDays : i.expiresIn) <= 3);
  const pantryNames = pantryItems.map(i => (i.name || "").toLowerCase());

  // 2. Score curated recipes based on expiring items matched & total items available
  const scored = baseRecipes.map(recipe => {
    const recipeIngredients = recipe.ingredients.map(ing => ing.toLowerCase());
    
    // Find matching available ingredients
    const availableIngredients = recipe.ingredients.filter(ing => {
      const ingLower = ing.toLowerCase();
      return pantryNames.some(pName => pName.includes(ingLower) || ingLower.includes(pName));
    });

    const missingIngredients = recipe.ingredients.filter(ing => !availableIngredients.includes(ing));

    // Find how many expiring items this recipe saves
    const expiringItemsRescued = expiringItems.filter(item => {
      const nameLower = (item.name || "").toLowerCase();
      return recipeIngredients.some(ing => ing.includes(nameLower) || nameLower.includes(ing));
    });

    const matchRatio = recipe.ingredients.length > 0 ? availableIngredients.length / recipe.ingredients.length : 0;
    const score = (expiringItemsRescued.length * 50) + (matchRatio * 40);

    let rescueTag = null;
    if (expiringItemsRescued.length > 0) {
      rescueTag = `Uses ${expiringItemsRescued.length} food(s) expiring within 3 days (${expiringItemsRescued.map(i => i.name).join(", ")})`;
    }

    return {
      ...recipe,
      availableIngredients,
      missingIngredients,
      expiringItemsRescuedCount: expiringItemsRescued.length,
      expiringItemsRescuedNames: expiringItemsRescued.map(i => i.name),
      matchRatio: Math.round(matchRatio * 100),
      score,
      rescueTag,
      dietaryTags: recipe.tags || ["Vegetarian", "Quick"],
      prepTime: "10 mins",
      cookTime: `${recipe.time} mins`,
      difficulty: recipe.difficulty || "Easy",
      instructions: recipe.steps || [],
      nutrition: recipe.nutrition || { calories: 320, protein: "8g", carbs: "42g", fat: "12g" }
    };
  });

  // Sort by score (highest expiring rescue & match first)
  scored.sort((a, b) => b.score - a.score);

  // 3. Optional Gemini AI Personalization for custom recipes if user has unique ingredient combos
  if (expiringItems.length > 0 && GEMINI_API_KEY) {
    try {
      const aiCustomRecipe = await generateGeminiRecipeRecommendation(expiringItems, pantryItems);
      if (aiCustomRecipe) {
        scored.unshift(aiCustomRecipe);
      }
    } catch (e) {
      console.warn("[RecipeEngine] Gemini custom recipe generation skipped:", e.message);
    }
  }

  return scored;
}

/**
 * Uses Gemini AI to construct a custom zero-waste recipe using expiring items.
 */
async function generateGeminiRecipeRecommendation(expiringItems, allPantryItems) {
  const expiringList = expiringItems.map(i => `${i.name} (${i.expiresInDays} days remaining)`).join(", ");
  const allList = allPantryItems.slice(0, 10).map(i => i.name).join(", ");

  const prompt = `You are a professional chef specializing in zero-waste home cooking.
Create a delicious recipe specifically designed to use these expiring ingredients: ${expiringList}.
Other available ingredients in pantry: ${allList}.

Respond ONLY in JSON format:
{
  "id": "ai-zero-waste-recipe",
  "name": "string (Recipe Title)",
  "desc": "string (Short description focusing on waste reduction)",
  "category": "Zero Waste AI Special",
  "time": number (cooking time in minutes),
  "difficulty": "Easy" | "Medium" | "Hard",
  "image": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop",
  "ingredients": ["string"],
  "availableIngredients": ["string"],
  "missingIngredients": ["string"],
  "steps": ["string"],
  "tags": ["Zero Waste", "AI Generated"],
  "rescueTag": "AI Custom Recipe rescuing expiring ingredients"
}`;

  const model = import.meta.env?.VITE_GEMINI_MODEL || "gemini-flash-lite-latest";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { response_mime_type: "application/json" }
    })
  });

  if (!response.ok) return null;
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;

  const parsed = JSON.parse(text);
  return {
    ...parsed,
    prepTime: "10 mins",
    cookTime: `${parsed.time || 20} mins`,
    score: 999,
    isAiGenerated: true
  };
}
