import { describe, it, expect } from "vitest";
import { scanFoodWithGemini, generateStorageTipsWithGemini, GEMINI_MODEL } from "../services/geminiService";

describe("Live Gemini Verification with New Key", () => {
  it("uses the configured Gemini model", () => {
    expect(GEMINI_MODEL).toBe("gemini-flash-lite-latest");
  });

  it("can invoke Gemini API and return actionable food storage tips", async () => {
    const tips = await generateStorageTipsWithGemini("Tomato", "Vegetables", "Pantry");
    console.log("Gemini storage tips:", tips);
    expect(Array.isArray(tips)).toBe(true);
    expect(tips.length).toBeGreaterThan(0);
    expect(tips[0].title).toBeTruthy();
    expect(tips[0].desc).toBeTruthy();
  }, 25000);
});
