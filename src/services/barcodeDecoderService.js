// Real Browser Barcode Decoding & Open Food Facts Lookup Engine
// Decodes numeric EAN/UPC barcodes directly from camera/image element using standard browser BarcodeDetector API.

import { lookupBarcodeOpenFoodFacts } from "./openFoodFactsService.js";

/**
 * Decodes numeric barcode from an image element or Base64 data URL.
 * 
 * @param {string} imageBase64 - Base64 data URL or image source
 * @returns {Promise<string|null>} Decoded numeric barcode string or null
 */
export async function decodeBarcodeFromImage(imageBase64) {
  if (typeof window === "undefined" || !imageBase64) return null;

  // 1. Native Browser BarcodeDetector API (Supported in Chrome/Edge/Safari/Android)
  if ("BarcodeDetector" in window) {
    try {
      const barcodeDetector = new window.BarcodeDetector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"]
      });

      const img = new Image();
      img.crossOrigin = "anonymous";
      
      const loaded = new Promise((resolve) => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
      });
      img.src = imageBase64;
      await loaded;

      const barcodes = await barcodeDetector.detect(img);
      if (barcodes && barcodes.length > 0) {
        const rawValue = barcodes[0].rawValue;
        console.log(`[BarcodeDecoder] 🎯 Native BarcodeDetector found numeric barcode: ${rawValue}`);
        return rawValue;
      }
    } catch (err) {
      console.warn("[BarcodeDecoder] Native BarcodeDetector attempt error:", err.message);
    }
  }

  // Fallback: If no native barcode detector or image contains text barcode string
  const stringMatch = String(imageBase64).match(/\b(\d{8,14})\b/);
  if (stringMatch) {
    return stringMatch[1];
  }

  return null;
}

/**
 * Full Barcode Processing Pipeline:
 * Decode Barcode -> Query Open Food Facts -> Return Exact Product match or Unregistered Barcode status.
 * 
 * @param {string} imageBase64 
 * @param {string} [manualBarcodeNumber]
 * @returns {Promise<object>} Result
 */
export async function processBarcodePipeline(imageBase64, manualBarcodeNumber = null) {
  let decodedBarcode = manualBarcodeNumber ? String(manualBarcodeNumber).trim() : null;

  if (!decodedBarcode && imageBase64) {
    decodedBarcode = await decodeBarcodeFromImage(imageBase64);
  }

  if (!decodedBarcode) {
    return {
      success: false,
      barcode: null,
      error: "NO_BARCODE_DETECTED",
      message: "No readable numeric barcode was found in the image. Ensure the barcode is clear and well-lit.",
      confidence: 0
    };
  }

  console.log(`[BarcodePipeline] 🔍 Running Open Food Facts lookup for decoded barcode: ${decodedBarcode}...`);
  const offResult = await lookupBarcodeOpenFoodFacts(decodedBarcode);

  if (offResult.found) {
    return {
      success: true,
      barcode: decodedBarcode,
      productName: offResult.name,
      brand: offResult.brand || "Brand",
      category: offResult.category,
      quantity: offResult.quantity,
      imageUrl: offResult.imageUrl,
      ingredients: offResult.ingredients,
      allergens: offResult.allergens,
      nutrition: offResult.nutrition,
      confidence: 0.98,
      confidenceCategory: "VERY_HIGH",
      source: "Open Food Facts API",
      message: "Exact barcode product matched in database."
    };
  } else {
    // DO NOT INVENT A PRODUCT! State clearly that barcode was detected but not found.
    return {
      success: false,
      barcode: decodedBarcode,
      error: "PRODUCT_NOT_IN_DATABASE",
      message: `Barcode ${decodedBarcode} detected, but product was not found in Open Food Facts database. Please scan product label or enter name manually.`,
      confidence: 0.9, // High confidence in barcode number, 0 in product match
      source: "Open Food Facts Lookup (Unregistered Barcode)"
    };
  }
}
