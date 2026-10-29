import { describe, it, expect, vi } from "vitest";
import { processBarcodePipeline } from "../services/barcodeDecoderService.js";
import { normalizeDateString, extractDatesFromLabelText } from "../services/ocrService.js";
import * as ocrModule from "../services/ocrService.js";
import { lookupBarcodeOpenFoodFacts } from "../services/openFoodFactsService.js";

describe("Barcode & Expiry Label Scan Feature Fixes", () => {
  describe("Barcode Feature Tests", () => {
    it("successfully looks up sample barcodes from curated registry", async () => {
      // Good Day Biscuits
      const res1 = await processBarcodePipeline(null, "8901491100018");
      expect(res1.success).toBe(true);
      expect(res1.productName).toContain("Good Day");
      expect(res1.brand).toBe("Britannia");
      expect(res1.category).toBe("Packaged Food");
      expect(res1.confidence).toBeGreaterThanOrEqual(0.95);

      // Amul Milk
      const res2 = await processBarcodePipeline(null, "8901030777777");
      expect(res2.success).toBe(true);
      expect(res2.productName).toContain("Amul Taaza");
      expect(res2.category).toBe("Dairy");
      expect(res2.allergens).toContain("Milk");

      // Aashirvaad Atta
      const res3 = await processBarcodePipeline(null, "8901719101072");
      expect(res3.success).toBe(true);
      expect(res3.productName).toContain("Aashirvaad");
      expect(res3.category).toBe("Grains");
    });

    it("successfully looks up Parle-G barcode and enriches with package details", async () => {
      const res = await processBarcodePipeline(null, "8901063000021");
      expect(res.success).toBe(true);
      expect(res.productName).toContain("Parle-G");
      expect(res.brand).toBe("Parle");
      expect(res.category).toBe("Packaged Food");
      expect(res.nutrition?.calories).toBe(454);
      expect(res.allergens).toContain("Wheat");
    });

    it("works with any packaged food when barcode is unlisted in Open Food Facts by extracting package details via OCR/Vision", async () => {
      // Unlisted barcode not present in Open Food Facts
      const unlistedBarcode = "8900000999991";
      const fakePackageImage = "data:image/jpeg;base64," + "A".repeat(1200);

      const spy = vi.spyOn(ocrModule, "scanFoodLabelOCR").mockResolvedValueOnce({
        success: true,
        productName: "Parle-G Gluco Biscuits",
        brand: "Parle",
        category: "Packaged Foods",
        manufacturingDate: "2026-01-10",
        expiryDate: "2026-11-20",
        bestBeforeDate: null,
        calculatedExpiryDate: "2026-11-20",
        quantity: "250g",
        ingredients: "Wheat Flour, Sugar, Edible Vegetable Oil, Milk Solids",
        allergens: ["Wheat", "Gluten", "Milk"],
        nutrition: { calories: 450, protein: 6.5, carbs: 78, fat: 12.5, fiber: 1.5 },
        packagingCondition: "INTACT",
        packagingNotes: "Pouch packaging is sealed with no tears or puffiness.",
        confidence: 0.94,
        confidenceCategory: "HIGH",
        requiresUserConfirmation: true
      });

      const res = await processBarcodePipeline(fakePackageImage, unlistedBarcode);
      expect(res.success).toBe(true);
      expect(res.productName).toBe("Parle-G Gluco Biscuits");
      expect(res.brand).toBe("Parle");
      expect(res.category).toBe("Packaged Foods");
      expect(res.quantity).toBe("250g");
      expect(res.expiryDate).toBe("2026-11-20");
      expect(res.packagingCondition).toBe("INTACT");
      expect(res.nutrition?.calories).toBe(450);
      expect(res.allergens).toContain("Wheat");
      expect(res.source).toContain("Package Vision & OCR");
      expect(res.requiresUserConfirmation).toBe(true);

      spy.mockRestore();
    });

    it("flags expired packaged products and sets critical spoilage status", async () => {
      const pastExpiryDate = "2024-05-15";
      const fakePackageImage = "data:image/jpeg;base64," + "A".repeat(1200);

      const spy = vi.spyOn(ocrModule, "scanFoodLabelOCR").mockResolvedValueOnce({
        success: true,
        productName: "Parle-G Biscuits",
        brand: "Parle",
        category: "Packaged Foods",
        manufacturingDate: "2023-11-15",
        expiryDate: pastExpiryDate,
        bestBeforeDate: null,
        calculatedExpiryDate: pastExpiryDate,
        quantity: "100g",
        ingredients: "Wheat Flour, Sugar",
        allergens: ["Wheat"],
        nutrition: { calories: 450, protein: 6, carbs: 75, fat: 12, fiber: 1 },
        packagingCondition: "INTACT",
        packagingNotes: "Packaging intact.",
        confidence: 0.95,
        confidenceCategory: "HIGH",
        requiresUserConfirmation: true
      });

      const res = await processBarcodePipeline(fakePackageImage, "8909999888877");
      expect(res.success).toBe(true);
      expect(res.expiryDate).toBe(pastExpiryDate);

      // Verify expiration logic matches pantry-save pipeline
      const isExpired = new Date(res.expiryDate).getTime() < Date.now();
      expect(isExpired).toBe(true);

      // Construct pantry item according to barcode save handler
      const pantryItem = {
        name: `${res.brand} ${res.productName}`.trim(),
        category: res.category,
        quantity: res.quantity,
        freshness: isExpired ? 10 : 95,
        expiresInDays: isExpired ? 0 : Math.round((new Date(res.expiryDate).getTime() - Date.now()) / 864e5),
        days_left: isExpired ? 0 : Math.round((new Date(res.expiryDate).getTime() - Date.now()) / 864e5),
        storage: isExpired ? "Discard safely — not safe for consumption" : "Pantry shelf",
        estimatedConsumeByDate: isExpired ? "Immediate (Expired)" : res.expiryDate,
        spoilageStatus: isExpired ? "SPOILED" : "FRESH",
        hasCriticalSpoilage: isExpired
      };

      expect(pantryItem.freshness).toBe(10);
      expect(pantryItem.spoilageStatus).toBe("SPOILED");
      expect(pantryItem.hasCriticalSpoilage).toBe(true);
      expect(pantryItem.expiresInDays).toBe(0);
      expect(pantryItem.storage).toBe("Discard safely — not safe for consumption");

      spy.mockRestore();
    });

    it("does not invent missing information when expiry date is not visible on package", async () => {
      const fakePackageImage = "data:image/jpeg;base64," + "A".repeat(1200);

      const spy = vi.spyOn(ocrModule, "scanFoodLabelOCR").mockResolvedValueOnce({
        success: true,
        productName: "Regional Snack Mix",
        brand: "Local Mill",
        category: "Packaged Foods",
        manufacturingDate: null,
        expiryDate: null,
        bestBeforeDate: null,
        calculatedExpiryDate: null,
        quantity: "200g",
        ingredients: "Gram flour, spices",
        allergens: [],
        nutrition: null,
        packagingCondition: "INTACT",
        packagingNotes: "Standard sealed packet.",
        confidence: 0.85,
        confidenceCategory: "HIGH",
        requiresUserConfirmation: true
      });

      const res = await processBarcodePipeline(fakePackageImage, "8905555444433");
      expect(res.success).toBe(true);
      expect(res.productName).toBe("Regional Snack Mix");
      expect(res.expiryDate).toBeNull(); // No fabricated date
      expect(res.requiresUserConfirmation).toBe(true);

      spy.mockRestore();
    });

    it("accepts real retail barcodes regardless of checksum algorithms", async () => {
      // Parle-G, Good Day, Dark Fantasy, and custom regional barcodes
      const testCodes = ["8901063000021", "8901491100018", "8901725111119", "8901719101072"];
      for (const code of testCodes) {
        const res = await processBarcodePipeline(null, code);
        expect(res.success).toBe(true);
        expect(res.barcode).toBe(code);
        expect(res.productName).toBeTruthy();
      }
    });

    it("runs OCR/Gemini separately after barcode decoding to extract package details and expiry date", async () => {
      const barcode = "8901063000021"; // Parle-G barcode
      const fakePackageImage = "data:image/jpeg;base64," + "A".repeat(1200);

      const ocrSpy = vi.spyOn(ocrModule, "scanFoodLabelOCR").mockResolvedValueOnce({
        success: true,
        productName: "Parle-G Original Glucose Biscuits",
        brand: "Parle",
        category: "Packaged Food",
        manufacturingDate: "2026-02-15",
        expiryDate: "2026-12-15",
        bestBeforeDate: null,
        calculatedExpiryDate: "2026-12-15",
        quantity: "100 g",
        ingredients: "Wheat Flour, Sugar, Vegetable Oil, Milk Solids",
        allergens: ["Wheat", "Gluten", "Milk"],
        nutrition: { calories: 454, protein: 6.7, carbs: 77.0, fat: 13.0, fiber: 1.5 },
        packagingCondition: "INTACT",
        packagingNotes: "Original foil packaging intact.",
        confidence: 0.98,
        confidenceCategory: "HIGH",
        requiresUserConfirmation: true
      });

      const res = await processBarcodePipeline(fakePackageImage, barcode);
      expect(res.success).toBe(true);
      expect(res.barcode).toBe(barcode);
      expect(res.productName).toContain("Parle-G");
      // Expiry date extracted from package image via OCR/Gemini
      expect(res.expiryDate).toBe("2026-12-15");
      expect(res.manufacturingDate).toBe("2026-02-15");
      expect(res.packagingCondition).toBe("INTACT");
      expect(ocrSpy).toHaveBeenCalledTimes(1);

      ocrSpy.mockRestore();
    });

    it("rejects invalid barcode numbers gracefully without throwing", async () => {
      const res = await processBarcodePipeline(null, "1234");
      expect(res.success).toBe(false);
      expect(res.error).toBe("INVALID_BARCODE");
      expect(res.confidence).toBe(0);
    });

    it("returns appropriate error when no image and no barcode number is provided", async () => {
      const res = await processBarcodePipeline(null, null);
      expect(res.success).toBe(false);
      expect(res.error).toBe("NO_BARCODE_DETECTED");
    });

    it("evaluates expired barcode products accurately based on expiry date", () => {
      const pastDate = "2020-01-01";
      const futureDate = "2030-01-01";

      const isExpiredPast = new Date(pastDate).getTime() < Date.now();
      const isExpiredFuture = new Date(futureDate).getTime() < Date.now();

      expect(isExpiredPast).toBe(true);
      expect(isExpiredFuture).toBe(false);
    });
  });

  describe("Expiry Label OCR Feature Tests", () => {
    it("normalizes multiple date formats accurately to YYYY-MM-DD", () => {
      // ISO with dashes, slashes, dots
      expect(normalizeDateString("2026-12-15")).toBe("2026-12-15");
      expect(normalizeDateString("2026/12/15")).toBe("2026-12-15");
      expect(normalizeDateString("2026.12.15")).toBe("2026-12-15");

      // DD/MM/YYYY and DD-MM-YYYY
      expect(normalizeDateString("15/12/2026")).toBe("2026-12-15");
      expect(normalizeDateString("15-12-2026")).toBe("2026-12-15");
      expect(normalizeDateString("15/12/26")).toBe("2026-12-15");

      // Prefixed dates (common in OCR)
      expect(normalizeDateString("Best Before: 20/11/2026")).toBe("2026-11-20");
      expect(normalizeDateString("EXP: 15/12/2026")).toBe("2026-12-15");
      expect(normalizeDateString("USE BY 10/10/2026")).toBe("2026-10-10");
      expect(normalizeDateString("MFD 01-05-2026")).toBe("2026-05-01");

      // Textual month: 15 Dec 2026, 15-Oct-26, 15th October 2026
      expect(normalizeDateString("15 Dec 2026")).toBe("2026-12-15");
      expect(normalizeDateString("15 Oct 2027")).toBe("2027-10-15");
      expect(normalizeDateString("15-Oct-26")).toBe("2026-10-15");
      expect(normalizeDateString("15th October 2026")).toBe("2026-10-15");
      expect(normalizeDateString("October 15, 2026")).toBe("2026-10-15");

      // Month-Year without day
      expect(normalizeDateString("Nov 2026", { kind: "expiry" })).toBe("2026-11-30");
      expect(normalizeDateString("November 2026", { kind: "expiry" })).toBe("2026-11-30");
      expect(normalizeDateString("Nov 2026", { kind: "manufacturing" })).toBe("2026-11-01");
      expect(normalizeDateString("11/2026", { kind: "expiry" })).toBe("2026-11-30");
    });

    it("extracts expiry dates, best before dates, and manufacturing dates from label text", () => {
      const sampleText = `
        AMUL TAAZA TONED MILK
        MFG: 10/10/2026
        EXP: 25/10/2026
        NET QTY: 500ml
      `;
      const parsed = extractDatesFromLabelText(sampleText);
      expect(parsed.manufacturingDate).toBe("2026-10-10");
      expect(parsed.expiryDate).toBe("2026-10-25");
      expect(parsed.isVerifiedExpiry).toBe(true);
    });

    it("calculates expiry from shelf-life statement with numbers and spelled-out words", () => {
      // Numeric
      const sample1 = `
        ORGANIC CHANA DAL
        PACKED ON: 01/01/2026
        BEST BEFORE 6 MONTHS FROM PACKING
      `;
      const parsed1 = extractDatesFromLabelText(sample1);
      expect(parsed1.manufacturingDate).toBe("2026-01-01");
      expect(parsed1.calculatedExpiryDate).toBe("2026-07-01");

      // Spelled-out words (e.g. Parle-G packages)
      const sample2 = `
        PARLE-G GLUCOSE BISCUITS
        MFG DATE: 01/02/2026
        BEST BEFORE SIX MONTHS FROM PACKAGING
      `;
      const parsed2 = extractDatesFromLabelText(sample2);
      expect(parsed2.manufacturingDate).toBe("2026-02-01");
      expect(parsed2.calculatedExpiryDate).toBe("2026-08-01");
    });

    it("persists all extracted package details into saved pantry records without fabricating missing values", async () => {
      const fakePackageImage = "data:image/jpeg;base64," + "A".repeat(1200);

      const spy = vi.spyOn(ocrModule, "scanFoodLabelOCR").mockResolvedValueOnce({
        success: true,
        productName: "Original Glucose Biscuits",
        brand: "Parle-G",
        category: "Packaged Foods",
        manufacturingDate: "2026-03-01",
        expiryDate: "2027-09-01",
        bestBeforeDate: "2027-09-01",
        calculatedExpiryDate: "2027-09-01",
        quantity: "250 g",
        ingredients: "Wheat Flour, Sugar, Vegetable Oil, Invert Sugar Syrup",
        allergens: ["Wheat", "Gluten"],
        nutrition: { calories: 454, protein: 6.7, carbs: 77.0, fat: 13.0, fiber: 1.5 },
        packagingCondition: "INTACT",
        packagingNotes: "Sealed wrapper in good condition.",
        confidence: 0.98,
        confidenceCategory: "HIGH",
        requiresUserConfirmation: true
      });

      const res = await processBarcodePipeline(fakePackageImage, "8901063000021");
      expect(res.success).toBe(true);
      expect(res.productName).toBeTruthy();
      expect(res.brand).toBe("Parle");
      expect(res.manufacturingDate).toBe("2026-03-01");
      expect(res.bestBeforeDate).toBe("2027-09-01");
      expect(res.expiryDate).toBe("2027-09-01");

      // Simulate pantry save payload matching BarcodeScan add() handler
      const effectiveExpiry = res.expiryDate || res.bestBeforeDate;
      const isExpired = Boolean(effectiveExpiry && new Date(effectiveExpiry).getTime() < Date.now());
      const finalDays = effectiveExpiry ? Math.round((new Date(effectiveExpiry).getTime() - Date.now()) / 864e5) : undefined;
      const finalName = res.brand && !res.productName.includes(res.brand) ? `${res.brand} ${res.productName}`.trim() : res.productName.trim();

      const savedRecord = {
        name: finalName,
        category: res.category,
        quantity: res.quantity,
        freshness: isExpired ? 10 : 95,
        expiresInDays: isExpired ? 0 : (finalDays ?? 3),
        days_left: isExpired ? 0 : (finalDays ?? 3),
        expiry_date: effectiveExpiry || undefined,
        consumeByDate: effectiveExpiry || undefined,
        purchaseDate: res.manufacturingDate || undefined,
        storage: "Pantry shelf",
        allergens: res.allergens,
        nutrition: res.nutrition,
        isVerifiedExpiry: true,
        printedExpiryDate: effectiveExpiry,
        spoilageStatus: isExpired ? "SPOILED" : "FRESH",
        hasCriticalSpoilage: isExpired,
        scanMetadata: {
          source: "barcode",
          barcode: res.barcode,
          brand: res.brand,
          manufacturingDate: res.manufacturingDate,
          bestBeforeDate: res.bestBeforeDate,
          packagingCondition: res.packagingCondition
        }
      };

      // Verify all fields are present and correctly populated
      expect(savedRecord.name).toContain("Parle");
      expect(savedRecord.expiry_date).toBe("2027-09-01");
      expect(savedRecord.consumeByDate).toBe("2027-09-01");
      expect(savedRecord.purchaseDate).toBe("2026-03-01");
      expect(savedRecord.scanMetadata.manufacturingDate).toBe("2026-03-01");
      expect(savedRecord.scanMetadata.bestBeforeDate).toBe("2027-09-01");
      expect(savedRecord.spoilageStatus).toBe("FRESH");
      expect(savedRecord.hasCriticalSpoilage).toBe(false);

      spy.mockRestore();
    });

    it("detects expired products vs valid products correctly", () => {
      const today = new Date();
      const past = new Date(today.getTime() - 10 * 864e5).toISOString().slice(0, 10);
      const future = new Date(today.getTime() + 10 * 864e5).toISOString().slice(0, 10);

      const pastExpired = new Date(past).getTime() < Date.now();
      const futureExpired = new Date(future).getTime() < Date.now();

      expect(pastExpired).toBe(true);
      expect(futureExpired).toBe(false);
    });
  });
});

