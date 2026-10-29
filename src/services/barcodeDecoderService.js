// Barcode decoding for uploaded/captured images, followed by Open Food Facts lookup & AI package inspection.
import { BrowserMultiFormatReader } from "@zxing/browser";
import { lookupBarcodeOpenFoodFacts, lookupBarcodeWithGemini } from "./openFoodFactsService.js";
import { scanFoodLabelOCR } from "./ocrService.js";

function normalizeBarcodeValue(value) {
  if (!value) return null;
  const digits = String(value).trim();
  // Standard numeric retail barcodes must be 8 to 14 digits
  if (/^\d+$/.test(digits)) {
    return /^\d{8,14}$/.test(digits) ? digits : null;
  }
  // Alphanumeric barcodes (Code-128, Code-39, QR code payload) must contain letters or symbols
  if (/^[A-Za-z0-9\-_./:]{4,48}$/.test(digits) && /[A-Za-z\-_./:]/.test(digits)) {
    return digits;
  }
  return null;
}

function isSupportedImageInput(image) {
  if (typeof image !== "string" || image.length < 50) return false;
  if (/^(blob:|https?:\/\/)/i.test(image)) return true;
  if (/^data:image\//i.test(image)) return true;
  return false;
}

async function decodeWithNativeBarcodeDetector(imageElementOrCanvas) {
  if (typeof window === "undefined" || !("BarcodeDetector" in window)) return null;
  try {
    const detector = new window.BarcodeDetector({
      formats: [
        "ean_13", "ean_8", "upc_a", "upc_e",
        "code_128", "code_39", "code_93", "itf",
        "codabar", "qr_code", "data_matrix"
      ]
    });
    const results = await detector.detect(imageElementOrCanvas);
    if (results && results.length > 0) {
      for (const res of results) {
        const val = normalizeBarcodeValue(res.rawValue);
        if (val) return val;
      }
    }
    return null;
  } catch (err) {
    console.warn("[BarcodeDecoder] Native detector note:", err?.message || err);
    return null;
  }
}

async function decodeWithZXing(imageElementOrUrl) {
  if (typeof window === "undefined") return null;

  const hints = new Map();
  hints.set(3, true); // TRY_HARDER = 3
  hints.set(2, [7, 6, 14, 15, 4, 2, 3, 8, 1, 11]); // POSSIBLE_FORMATS = 2: EAN-13, EAN-8, UPC-A, UPC-E, CODE-128, etc.
  const reader = new BrowserMultiFormatReader(hints);

  try {
    let img;
    if (typeof Image !== "undefined" && imageElementOrUrl instanceof Image) {
      img = imageElementOrUrl;
    } else if (typeof imageElementOrUrl === "string") {
      img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise((resolve, reject) => {
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Image element load failed"));
        img.src = imageElementOrUrl;
      });
    } else {
      return null;
    }

    // Pass 1: Direct decodeFromImageElement with TRY_HARDER hints
    try {
      const result = await reader.decodeFromImageElement(img);
      const val = normalizeBarcodeValue(result?.getText?.());
      if (val) return val;
    } catch {
      // Continue to canvas multi-pass
    }

    // Pass 2: Canvas multi-pass (rescaling, 90-degree rotation, contrast enhancement)
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        const maxDim = 1600;
        let w = img.naturalWidth || img.width || 800;
        let h = img.naturalHeight || img.height || 600;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        const targetW = Math.round(w * scale);
        const targetH = Math.round(h * scale);

        canvas.width = targetW;
        canvas.height = targetH;
        ctx.drawImage(img, 0, 0, targetW, targetH);

        // Pass 2a: Scaled canvas
        try {
          const res = await reader.decodeFromCanvas(canvas);
          const val = normalizeBarcodeValue(res?.getText?.());
          if (val) return val;
        } catch {}

        // Pass 2b: 90-degree rotated canvas (for vertical barcodes on bottles/boxes)
        try {
          const rotCanvas = document.createElement("canvas");
          rotCanvas.width = targetH;
          rotCanvas.height = targetW;
          const rotCtx = rotCanvas.getContext("2d", { willReadFrequently: true });
          if (rotCtx) {
            rotCtx.translate(targetH / 2, targetW / 2);
            rotCtx.rotate(Math.PI / 2);
            rotCtx.drawImage(canvas, -targetW / 2, -targetH / 2);
            const res = await reader.decodeFromCanvas(rotCanvas);
            const val = normalizeBarcodeValue(res?.getText?.());
            if (val) return val;
          }
        } catch {}

        // Pass 2c: High-contrast thresholding (for low-light or glare)
        try {
          const imgData = ctx.getImageData(0, 0, targetW, targetH);
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
            const b = gray > 120 ? 255 : 0;
            d[i] = b;
            d[i + 1] = b;
            d[i + 2] = b;
          }
          ctx.putImageData(imgData, 0, 0);
          const res = await reader.decodeFromCanvas(canvas);
          const val = normalizeBarcodeValue(res?.getText?.());
          if (val) return val;
        } catch {}
      }
    }

    return null;
  } finally {
    reader.reset();
  }
}

async function decodeNumberWithOCR(imageBase64) {
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    try {
      const result = await worker.recognize(imageBase64);
      const candidates = String(result.data?.text || "").match(/(?:\d[\s-]*){8,14}/g) || [];
      for (const candidate of candidates) {
        const cleaned = candidate.replace(/[\s-]/g, "");
        if (/^\d{8,14}$/.test(cleaned)) {
          return cleaned;
        }
      }
      return null;
    } finally {
      await worker.terminate();
    }
  } catch (error) {
    console.warn("[BarcodeDecoder] Numeric OCR fallback unavailable:", error?.message || error);
    return null;
  }
}

/** Decode a real barcode from an image data URL, blob, or URL. */
export async function decodeBarcodeFromImage(imageBase64) {
  if (typeof window === "undefined" || !isSupportedImageInput(imageBase64)) return null;

  let img;
  try {
    img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((resolve, reject) => {
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Image element load failed"));
      img.src = imageBase64;
    });
  } catch (error) {
    console.warn("[BarcodeDecoder] Image element load error:", error?.message || error);
    return null;
  }

  // 1. Native BarcodeDetector (instant, GPU accelerated in modern browsers)
  try {
    const nativeVal = await decodeWithNativeBarcodeDetector(img);
    if (nativeVal) {
      console.info("[BarcodeDecoder] Barcode decoded via native BarcodeDetector:", nativeVal);
      return nativeVal;
    }
  } catch (err) {
    console.warn("[BarcodeDecoder] Native detector unavailable:", err?.message || err);
  }

  // 2. ZXing multi-pass with hints
  try {
    const zxingVal = await decodeWithZXing(img);
    if (zxingVal) {
      console.info("[BarcodeDecoder] Barcode decoded via ZXing multi-pass:", zxingVal);
      return zxingVal;
    }
  } catch (error) {
    console.warn("[BarcodeDecoder] ZXing decode note:", error?.message || error);
  }

  // 3. Tesseract OCR printed numeric fallback
  try {
    const ocrVal = await decodeNumberWithOCR(imageBase64);
    if (ocrVal) {
      console.info("[BarcodeDecoder] Barcode number recovered from printed OCR text:", ocrVal);
      return ocrVal;
    }
  } catch (error) {
    console.warn("[BarcodeDecoder] Numeric OCR fallback unavailable:", error?.message || error);
  }

  return null;
}

/**
 * Start continuous barcode decoding from a live camera video element.
 * Supports native BarcodeDetector with fallback to multi-pass ZXing.
 * Flexible camera constraints prevent OverconstrainedError on webcams/laptops.
 */
export async function startBarcodeCamera(videoElement, onBarcode) {
  if (!videoElement || typeof onBarcode !== "function") throw new Error("CAMERA_TARGET_REQUIRED");

  let stopped = false;
  let animId = null;
  let nativeDetector = null;

  if (typeof window !== "undefined" && "BarcodeDetector" in window) {
    try {
      nativeDetector = new window.BarcodeDetector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "itf", "codabar", "qr_code"]
      });
    } catch {
      nativeDetector = null;
    }
  }

  const hints = new Map();
  hints.set(3, true); // TRY_HARDER
  hints.set(2, [7, 6, 14, 15, 4, 2, 3, 8, 1, 11]);
  const zxingReader = new BrowserMultiFormatReader(hints);

  // Flexible constraints: ideal environment (rear) camera on mobile, with fallback to any available camera on laptops
  let stream = null;
  const constraintsList = [
    { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
    { video: { facingMode: "environment" } },
    { video: true }
  ];

  for (const constraints of constraintsList) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (stream) break;
    } catch {
      // Continue to next constraint option
    }
  }

  if (!stream) {
    throw new Error("CAMERA_PERMISSION_DENIED");
  }

  videoElement.srcObject = stream;
  videoElement.setAttribute("playsinline", "true");
  await videoElement.play().catch(() => {});

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let lastScanTime = 0;

  const scanFrame = async (timestamp) => {
    if (stopped) return;

    if (timestamp - lastScanTime > 120 && videoElement.readyState >= 2 && videoElement.videoWidth > 0) {
      lastScanTime = timestamp;

      // Pass 1: Native BarcodeDetector directly on live video element
      if (nativeDetector) {
        try {
          const results = await nativeDetector.detect(videoElement);
          if (results && results.length > 0) {
            const detected = normalizeBarcodeValue(results[0]?.rawValue);
            if (detected) {
              stopped = true;
              let frameDataUrl = null;
              if (ctx) {
                canvas.width = videoElement.videoWidth;
                canvas.height = videoElement.videoHeight;
                ctx.drawImage(videoElement, 0, 0);
                frameDataUrl = canvas.toDataURL("image/jpeg", 0.85);
              }
              cleanup();
              onBarcode(detected, frameDataUrl);
              return;
            }
          }
        } catch {}
      }

      // Pass 2: ZXing from canvas
      if (!stopped && ctx) {
        try {
          const w = Math.min(1280, videoElement.videoWidth);
          const h = Math.min(720, videoElement.videoHeight);
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(videoElement, 0, 0, w, h);
          const res = await zxingReader.decodeFromCanvas(canvas);
          const detected = normalizeBarcodeValue(res?.getText?.());
          if (detected) {
            stopped = true;
            const frameDataUrl = canvas.toDataURL("image/jpeg", 0.85);
            cleanup();
            onBarcode(detected, frameDataUrl);
            return;
          }
        } catch {}
      }
    }

    if (!stopped) {
      animId = requestAnimationFrame(scanFrame);
    }
  };

  animId = requestAnimationFrame(scanFrame);

  const cleanup = () => {
    stopped = true;
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
    if (stream) {
      stream.getTracks().forEach((track) => {
        try { track.stop(); } catch {}
      });
      stream = null;
    }
    try { videoElement.srcObject = null; } catch {}
    try { zxingReader.reset(); } catch {}
  };

  return cleanup;
}

export async function processBarcodePipeline(imageBase64, manualBarcodeNumber = null) {
  const manual = normalizeBarcodeValue(manualBarcodeNumber);
  let decodedBarcode = manualBarcodeNumber ? manual : null;

  if (!decodedBarcode && imageBase64) {
    try {
      decodedBarcode = await decodeBarcodeFromImage(imageBase64);
    } catch (err) {
      console.warn("[BarcodeDecoder] Barcode decode exception:", err?.message || err);
    }
  }

  // 1. Barcode database lookup is an OPTIONAL enrichment source, never a strict requirement.
  let offResult = { found: false, status: "unknown" };
  if (decodedBarcode) {
    try {
      offResult = await lookupBarcodeOpenFoodFacts(decodedBarcode);
    } catch (offErr) {
      console.warn("[BarcodeDecoder] Open Food Facts lookup warning:", offErr?.message || offErr);
      offResult = { found: false, status: "network_error" };
    }
  }

  // 2. Package Image Analysis via OCR + Gemini Vision
  let labelData = null;
  if (imageBase64) {
    try {
      labelData = await scanFoodLabelOCR(imageBase64, "barcode", { barcode: decodedBarcode });
    } catch (ocrErr) {
      console.warn("[BarcodeDecoder] Package label inspection note:", ocrErr?.message || ocrErr);
    }
  }

  const expiryDate = labelData?.expiryDate || labelData?.calculatedExpiryDate || null;
  const manufacturingDate = labelData?.manufacturingDate || null;
  const bestBeforeDate = labelData?.bestBeforeDate || null;
  const packagingCondition = labelData?.packagingCondition || "INTACT";
  const visualNotes = labelData?.packagingNotes || null;

  // Case A: Barcode matched in Open Food Facts (or offline dataset registry)
  if (offResult.found) {
    return {
      success: true,
      barcode: decodedBarcode,
      productName: offResult.name,
      brand: offResult.brand || labelData?.brand || "",
      category: offResult.category || labelData?.category || "Packaged Foods",
      quantity: offResult.quantity || labelData?.quantity || "1 pack",
      imageUrl: offResult.imageUrl || "",
      ingredients: offResult.ingredients || labelData?.ingredients || "",
      allergens: offResult.allergens?.length ? offResult.allergens : (labelData?.allergens || []),
      nutrition: offResult.nutrition || labelData?.nutrition || null,
      expiryDate,
      manufacturingDate,
      bestBeforeDate,
      packagingCondition,
      visualNotes,
      confidence: 0.98,
      confidenceCategory: "VERY_HIGH",
      source: offResult.identificationMethod || "Open Food Facts",
      message: "Barcode matched in Open Food Facts; package analyzed for expiry and condition."
    };
  }

  // Case B: Not in Open Food Facts, but Package Image Analysis (Gemini Vision + OCR) extracted product details
  if (labelData && (labelData.productName || (expiryDate && labelData.success))) {
    const detectedName = labelData.productName || (decodedBarcode ? `Packaged Item (${decodedBarcode})` : null);
    if (detectedName) {
      return {
        success: true,
        barcode: decodedBarcode || null,
        productName: detectedName,
        brand: labelData.brand || "",
        category: labelData.category || "Packaged Foods",
        quantity: labelData.quantity || "1 pack",
        imageUrl: "",
        ingredients: labelData.ingredients || "",
        allergens: labelData.allergens || [],
        nutrition: labelData.nutrition || null,
        expiryDate,
        manufacturingDate,
        bestBeforeDate,
        packagingCondition,
        visualNotes,
        confidence: labelData.confidence || 0.88,
        confidenceCategory: labelData.confidenceCategory || "HIGH",
        requiresUserConfirmation: true,
        source: decodedBarcode
          ? "Package Vision & OCR (Barcode unlisted in Open Food Facts)"
          : "Package Vision & OCR Analysis",
        message: decodedBarcode
          ? `Barcode ${decodedBarcode} read; product details & dates extracted directly from package image.`
          : "Product details and expiry extracted directly from package image."
      };
    }
  }

  // Case C: Open Food Facts has no match AND labelData did not have a clear product name,
  // but we have a barcode and image where lookupBarcodeWithGemini might extract additional context
  if (imageBase64 && decodedBarcode && offResult.status === "unknown") {
    try {
      const aiResult = await lookupBarcodeWithGemini(decodedBarcode, imageBase64);
      if (aiResult?.found && (aiResult.productNameOnly || aiResult.name)) {
        return {
          success: true,
          barcode: decodedBarcode,
          productName: aiResult.productNameOnly || aiResult.name,
          brand: aiResult.brand || labelData?.brand || "",
          category: aiResult.category || labelData?.category || "Packaged Foods",
          quantity: aiResult.quantity || labelData?.quantity || "1 pack",
          imageUrl: "",
          ingredients: aiResult.ingredients || labelData?.ingredients || "",
          allergens: aiResult.allergens?.length ? aiResult.allergens : (labelData?.allergens || []),
          nutrition: aiResult.nutrition || labelData?.nutrition || null,
          expiryDate: aiResult.expiryDate || expiryDate,
          manufacturingDate,
          bestBeforeDate,
          packagingCondition: aiResult.packagingCondition || packagingCondition,
          visualNotes: aiResult.packagingNotes || visualNotes,
          confidence: aiResult.confidence || 0.85,
          confidenceCategory: "MEDIUM",
          requiresUserConfirmation: true,
          source: aiResult.identificationMethod || "Gemini Package Vision Enrichment",
          message: `Barcode ${decodedBarcode} enriched from package image.`
        };
      }
    } catch (aiErr) {
      console.warn("[BarcodeDecoder] Gemini package enrichment note:", aiErr?.message || aiErr);
    }
  }

  // Case D: A barcode was decoded, but neither database nor package OCR could identify product name
  if (decodedBarcode) {
    return {
      success: false,
      barcode: decodedBarcode,
      error: offResult.status === "network_error" ? "OPEN_FOOD_FACTS_UNAVAILABLE" : "PRODUCT_NOT_IN_DATABASE",
      message: offResult.status === "network_error"
        ? "The barcode was read, but Open Food Facts could not be reached. Confirm the product details manually."
        : `Barcode ${decodedBarcode} was read, but no matching database entry or package title was found. Enter the product details manually.`,
      confidence: 0.8,
      source: "Barcode decoded; product details required",
      expiryDate,
      manufacturingDate,
      bestBeforeDate,
      packagingCondition,
      visualNotes,
      requiresUserConfirmation: true
    };
  }

  // Case E: Neither barcode nor product package could be detected
  return {
    success: false,
    barcode: null,
    error: manualBarcodeNumber ? "INVALID_BARCODE" : "NO_BARCODE_DETECTED",
    message: manualBarcodeNumber
      ? "Enter a valid 8–14 digit barcode number."
      : "No readable barcode or package details were detected. Retake with good lighting, or enter details manually.",
    confidence: 0,
    requiresUserConfirmation: true
  };
}
