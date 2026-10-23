import { describe, it, expect } from "vitest";
import { applyHardFoodSafetyOverride } from "../services/visualSpoilageDetector.js";
import { getFoodKnowledgeBase } from "../services/foodKnowledgeBase.js";
import { identifyAndAnalyzeFood } from "../services/foodIdentificationService.js";

describe("AgriFreshNET & Multi-Stage Spoilage Pipeline Suite", () => {

  // TEST 1: ROTTEN TOMATO MUST NEVER RETURN 90-100% FRESH
  it("ROTTEN TOMATO MUST NOT produce high freshness or multi-day shelf life", () => {
    const kb = getFoodKnowledgeBase("Tomato");
    const spoiledTomatoFlags = {
      fuzzyMoldDetected: true,
      blackRotDetected: true,
      tissueCollapsed: true,
      liquidLeakage: true,
      severeDiscoloration: true,
      observedDetails: "Fuzzy green mold, black rot patches, liquid oozing.",
      confidence: 0.98
    };

    const result = applyHardFoodSafetyOverride("Tomato", spoiledTomatoFlags, kb);

    expect(result.freshnessStatus).toBe("ROTTEN");
    expect(result.freshnessScore).toBeLessThanOrEqual(15);
    expect(result.remainingDays).toBe(0);
    expect(result.spoilageRisk).toBe("CRITICAL");
    expect(result.safetyWarning).toContain("FOOD SAFETY ALERT");
    expect(result.detectedDefects).toContain("fuzzy_mold");
    expect(result.detectedDefects).toContain("black_brown_rot");
  });

  // TEST 2: FRESH TOMATO
  it("FRESH TOMATO produces high freshness score and valid shelf life", () => {
    const kb = getFoodKnowledgeBase("Tomato");
    const freshFlags = {
      fuzzyMoldDetected: false,
      blackRotDetected: false,
      tissueCollapsed: false,
      liquidLeakage: false,
      severeDiscoloration: false,
      extensiveWrinkling: false,
      observedDetails: "Glossy red skin, firm surface tension.",
      confidence: 0.95
    };

    const result = applyHardFoodSafetyOverride("Tomato", freshFlags, kb);

    expect(result.freshnessStatus).toBe("FRESH");
    expect(result.freshnessScore).toBeGreaterThanOrEqual(80);
    expect(result.remainingDays).toBeGreaterThanOrEqual(5);
    expect(result.safetyWarning).toBeNull();
  });

  // TEST 3: POTATO WITH GREEN SOLANINE & SPROUTS
  it("POTATO with green solanine & sprouts triggers spoilage warning", () => {
    const kb = getFoodKnowledgeBase("Potato");
    const solanineFlags = {
      fuzzyMoldDetected: false,
      blackRotDetected: false,
      greenSolanineDetected: true,
      sproutingDetected: true,
      observedDetails: "Toxic green solanine patches and long sprouts.",
      confidence: 0.92
    };

    const result = applyHardFoodSafetyOverride("Potato", solanineFlags, kb);

    expect(result.freshnessStatus).toBe("SPOILED");
    expect(result.freshnessScore).toBeLessThanOrEqual(25);
    expect(result.remainingDays).toBe(0);
    expect(result.detectedDefects).toContain("green_solanine");
    expect(result.detectedDefects).toContain("sprouts");
  });

  // TEST 4: ONION WITH SOFT WET PATCHES & MOLD
  it("ONION with soft wet patches & mold forces SPOILED status", () => {
    const kb = getFoodKnowledgeBase("Onion");
    const onionFlags = {
      fuzzyMoldDetected: true,
      softWetPatches: true,
      severeDiscoloration: true,
      observedDetails: "Black mold under paper skin, mushy wet core.",
      confidence: 0.94
    };

    const result = applyHardFoodSafetyOverride("Onion", onionFlags, kb);

    expect(result.freshnessStatus).toBe("ROTTEN");
    expect(result.remainingDays).toBe(0);
    expect(result.detectedDefects).toContain("fuzzy_mold");
    expect(result.detectedDefects).toContain("soft_wet_patches");
  });

  // TEST 5: BRINJAL WITH BROWN ROT & SOFT MUSHY AREAS
  it("BRINJAL with brown rot patches & mushy areas forces SPOILED status", () => {
    const kb = getFoodKnowledgeBase("Brinjal");
    const brinjalFlags = {
      fuzzyMoldDetected: false,
      blackRotDetected: true,
      softWetPatches: true,
      tissueCollapsed: true,
      observedDetails: "Sunken brown rot patches and mushy pulp collapse.",
      confidence: 0.91
    };

    const result = applyHardFoodSafetyOverride("Brinjal", brinjalFlags, kb);

    expect(result.freshnessStatus).toBe("ROTTEN");
    expect(result.remainingDays).toBe(0);
    expect(result.detectedDefects).toContain("black_brown_rot");
  });

  // TEST 6: CAPSICUM WITH WRINKLES & DARK SPOTS
  it("CAPSICUM with extensive wrinkles & dark spots forces ROTTEN/SPOILED status", () => {
    const kb = getFoodKnowledgeBase("Capsicum");
    const capsicumFlags = {
      fuzzyMoldDetected: false,
      blackRotDetected: true,
      extensiveWrinkling: true,
      observedDetails: "Shriveled skin and dark sunken spots.",
      confidence: 0.89
    };

    const result = applyHardFoodSafetyOverride("Capsicum", capsicumFlags, kb);

    expect(["ROTTEN", "SPOILED"]).toContain(result.freshnessStatus);
    expect(result.remainingDays).toBe(0);
    expect(result.detectedDefects).toContain("black_brown_rot");
  });

  // TEST 7: CARROT WITH DARK ROT & SHRIVELING
  it("CARROT with dark rot & shriveling forces SPOILED status", () => {
    const kb = getFoodKnowledgeBase("Carrot");
    const carrotFlags = {
      fuzzyMoldDetected: true,
      blackRotDetected: true,
      extensiveWrinkling: true,
      observedDetails: "White fuzzy mold, dark rot tip, heavy shriveling.",
      confidence: 0.93
    };

    const result = applyHardFoodSafetyOverride("Carrot", carrotFlags, kb);

    expect(result.freshnessStatus).toBe("ROTTEN");
    expect(result.remainingDays).toBe(0);
  });

  // TEST 8: LEAFY VEGETABLES WITH WILTING & CHLOROSIS YELLOWING
  it("LEAFY VEGETABLES with chlorosis yellowing & wilting reduces shelf life", () => {
    const kb = getFoodKnowledgeBase("Spinach");
    const leafyFlags = {
      fuzzyMoldDetected: false,
      blackRotDetected: false,
      wiltingOrDehydration: true,
      observedDetails: "Chlorosis leaf yellowing and limp wilted stems.",
      confidence: 0.88
    };

    const result = applyHardFoodSafetyOverride("Spinach", leafyFlags, kb);

    expect(result.freshnessStatus).toBe("SEMI_FRESH");
    expect(result.freshnessScore).toBeLessThanOrEqual(75);
    expect(result.remainingDays).toBeLessThanOrEqual(3);
  });

  // TEST 9: NO FILENAME RE-USE
  it("pipeline NEVER uses uploaded file string as food name", async () => {
    const result = await identifyAndAnalyzeFood({
      imageBase64: null,
      mode: "manual",
      userSuppliedName: "Tomato"
    });

    expect(result.foodName).toBe("Tomato");
    expect(result.foodName).not.toContain("sample_rotten_tomato_blob");
  });

  // TEST 10: PHOTO SCAN PRODUCE IDENTIFICATION
  it("PHOTO scan of produce identifies produce correctly without misidentifying as OCR milk label", async () => {
    const rottenTomatoImage = "data:image/jpeg;base64,sample_rotten_tomato_fuzzy_mold_black_rot";
    const result = await identifyAndAnalyzeFood({
      imageBase64: rottenTomatoImage,
      mode: "photo"
    });

    expect(result.foodName).not.toBe("Amul Taaza Toned Milk");
    expect(result.foodName).not.toBe("Packaged Dairy Milk");
    expect(["Tomato", "Vegetables"]).toContain(result.foodName === "Tomato" ? "Tomato" : result.category);
    expect(result.freshnessStatus).toBe("ROTTEN");
    expect(result.freshnessScore).toBeLessThanOrEqual(15);
    expect(result.remainingDays).toBe(0);
    expect(result.spoilageRisk).toBe("CRITICAL");
  });

  // TEST 11: MULTI-FOOD SCAN IDENTIFICATION (CHAPATI, RICE, CUCUMBER, BRINJAL, MANGO)
  it("pipeline detects various food items (Chapati, Cooked Rice, Cucumber, Mango) from photo scan", async () => {
    const chapatiRes = await identifyAndAnalyzeFood({ imageBase64: "data:image/jpeg;base64,sample_chapati_roti_dough", mode: "photo" });
    expect(chapatiRes.foodName).toContain("Chapati");

    const riceRes = await identifyAndAnalyzeFood({ imageBase64: "data:image/jpeg;base64,sample_cooked_rice_grains", mode: "photo" });
    expect(riceRes.foodName).toContain("Rice");

    const cucumberRes = await identifyAndAnalyzeFood({ imageBase64: "data:image/jpeg;base64,sample_cucumber_kheera", mode: "photo" });
    expect(cucumberRes.foodName).toBe("Cucumber");

    const mangoRes = await identifyAndAnalyzeFood({ imageBase64: "data:image/jpeg;base64,sample_mango_aam", mode: "photo" });
    expect(mangoRes.foodName).toBe("Mango");
  }, 15000);

  // TEST 12: KNOWLEDGE BASE INTEGRITY FOR ALL FOOD TYPES
  it("Food Knowledge Base returns structured USDA / AgriFreshNET profiles for Chapati, Rice, Mango, Cucumber", () => {
    const chapatiKb = getFoodKnowledgeBase("Chapati");
    expect(chapatiKb.category).toBe("Bakery");
    expect(chapatiKb.baselineShelfLifeDays.ambient).toBe(2);

    const riceKb = getFoodKnowledgeBase("Cooked Rice");
    expect(riceKb.category).toBe("Grains");
    expect(riceKb.baselineShelfLifeDays.fridge).toBe(4);

    const mangoKb = getFoodKnowledgeBase("Mango");
    expect(mangoKb.category).toBe("Fruits");
    expect(mangoKb.spoilageIndicators).toContain("black_sunken_patches");
  });

  // TEST 13: UNCERTAIN/AMBIGUOUS IMAGE HANDLING
  it("returns 'Food not confidently identified' and asks for user confirmation when visual evidence is weak", async () => {
    const ambiguousResult = await identifyAndAnalyzeFood({
      imageBase64: "data:image/jpeg;base64,blurry_unclear_random_noise_image",
      mode: "photo"
    });

    expect(ambiguousResult.foodName).toBe("Food not confidently identified");
    expect(ambiguousResult.identificationConfidence).toBeLessThan(70);
    expect(ambiguousResult.isUncertain).toBe(true);
    expect(ambiguousResult.requiresUserConfirmation).toBe(true);
  });

  // TEST 14: DYNAMIC USER CORRECTION RECALCULATION
  it("recalculates shelf life, nutrition, and category when user corrects food identity", async () => {
    const { recalculateForCorrectedFood } = await import("../services/foodIdentificationService.js");

    const corrected = recalculateForCorrectedFood({
      foodName: "Tomato",
      category: "Vegetables",
      freshnessScore: 85,
      condition: "Fresh"
    });

    expect(corrected.foodName).toBe("Tomato");
    expect(corrected.category).toBe("Vegetables");
    expect(corrected.identificationConfidence).toBe(100);
    expect(corrected.nutrition.calories).toBe(18);
    expect(corrected.remainingDays).toBeGreaterThan(0);
    expect(corrected.isAiEstimate).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // MANDATORY 9 PRODUCE IDENTIFICATION & CONDITION TEST SUITE
  // ---------------------------------------------------------------------------
  describe("Mandatory Produce Identification & Spoilage Matrix", () => {

    // 1. Fresh capsicum → Capsicum
    it("1. Fresh capsicum identifies as Capsicum / Bell Pepper with Fresh condition", async () => {
      const result = await identifyAndAnalyzeFood({
        imageBase64: "data:image/jpeg;base64,sample_fresh_capsicum_green_pepper",
        mode: "photo"
      });
      expect(result.foodName).toContain("Capsicum");
      expect(result.category).toBe("Vegetables");
      expect(result.condition).toBe("Fresh");
      expect(result.freshnessScore).toBeGreaterThanOrEqual(80);
    });

    // 2. Rotten capsicum → Capsicum + Spoiled (MUST NOT BECOME POTATO!)
    it("2. Rotten capsicum identifies as Capsicum / Bell Pepper + Spoiled (NEVER Potato)", async () => {
      const result = await identifyAndAnalyzeFood({
        imageBase64: "data:image/jpeg;base64,sample_rotten_capsicum_black_rot_mold",
        mode: "photo"
      });
      expect(result.foodName).toContain("Capsicum");
      expect(result.foodName).not.toContain("Potato");
      expect(result.category).toBe("Vegetables");
      expect(result.condition).toBe("Spoiled");
      expect(result.freshnessScore).toBeLessThanOrEqual(20);
      expect(result.remainingDays).toBe(0);
    });

    // 3. Fresh potato → Potato
    it("3. Fresh potato identifies as Potato with Fresh condition", async () => {
      const result = await identifyAndAnalyzeFood({
        imageBase64: "data:image/jpeg;base64,sample_fresh_potato_tuber",
        mode: "photo"
      });
      expect(result.foodName).toBe("Potato");
      expect(result.category).toBe("Vegetables");
      expect(result.condition).toBe("Fresh");
    });

    // 4. Rotten potato → Potato + Spoiled
    it("4. Rotten potato identifies as Potato + Spoiled", async () => {
      const result = await identifyAndAnalyzeFood({
        imageBase64: "data:image/jpeg;base64,sample_rotten_potato_black_rot_solanine",
        mode: "photo"
      });
      expect(result.foodName).toBe("Potato");
      expect(result.category).toBe("Vegetables");
      expect(result.condition).toBe("Spoiled");
      expect(result.freshnessScore).toBeLessThanOrEqual(20);
    });

    // 5. Fresh tomato → Tomato
    it("5. Fresh tomato identifies as Tomato with Fresh condition", async () => {
      const result = await identifyAndAnalyzeFood({
        imageBase64: "data:image/jpeg;base64,sample_fresh_tomato_red",
        mode: "photo"
      });
      expect(result.foodName).toBe("Tomato");
      expect(result.category).toBe("Vegetables");
      expect(result.condition).toBe("Fresh");
    });

    // 6. Rotten tomato → Tomato + Spoiled
    it("6. Rotten tomato identifies as Tomato + Spoiled", async () => {
      const result = await identifyAndAnalyzeFood({
        imageBase64: "data:image/jpeg;base64,sample_rotten_tomato_mold_decay",
        mode: "photo"
      });
      expect(result.foodName).toBe("Tomato");
      expect(result.category).toBe("Vegetables");
      expect(result.condition).toBe("Spoiled");
      expect(result.freshnessScore).toBeLessThanOrEqual(20);
    });

    // 7. Fresh onion → Onion
    it("7. Fresh onion identifies as Onion with Fresh condition", async () => {
      const result = await identifyAndAnalyzeFood({
        imageBase64: "data:image/jpeg;base64,sample_fresh_onion_paper_skin",
        mode: "photo"
      });
      expect(result.foodName).toBe("Onion");
      expect(result.category).toBe("Vegetables");
      expect(result.condition).toBe("Fresh");
    });

    // 8. Rotten onion → Onion + Spoiled
    it("8. Rotten onion identifies as Onion + Spoiled", async () => {
      const result = await identifyAndAnalyzeFood({
        imageBase64: "data:image/jpeg;base64,sample_rotten_onion_mold_mushy",
        mode: "photo"
      });
      expect(result.foodName).toBe("Onion");
      expect(result.category).toBe("Vegetables");
      expect(result.condition).toBe("Spoiled");
      expect(result.freshnessScore).toBeLessThanOrEqual(20);
    });

    // 9. Blurry/unclear food → Ask to rescan instead of confidently guessing
    it("9. Blurry/unclear food asks to rescan instead of confidently guessing", async () => {
      const result = await identifyAndAnalyzeFood({
        imageBase64: "data:image/jpeg;base64,blurry_unclear_random_noise_image",
        mode: "photo"
      });
      expect(result.foodName).toBe("Food not confidently identified");
      expect(result.identificationConfidence).toBeLessThan(70);
      expect(result.isUncertain).toBe(true);
      expect(result.requiresUserConfirmation).toBe(true);
    });
  });
});


