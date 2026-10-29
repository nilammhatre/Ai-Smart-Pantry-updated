// ML Model Inference Service using ONNX Runtime Web
// Loads trained MobileNetV3-Small models exported to ONNX format
// Provides real neural network inference for food identity and freshness classification
// Falls back gracefully to existing heuristic classifiers if models aren't available

let onnxSession = null;
let identitySession = null;
let freshnessSession = null;
let identityClassMapping = null;
let freshnessClassMapping = null;
let modelConfig = null;
let initPromise = null;
let initAttempted = false;

// ImageNet normalization constants
const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];
const IMAGE_SIZE = 224;

/**
 * Lazily initialize ONNX Runtime and load models.
 * Returns true if models loaded successfully, false otherwise.
 */
async function ensureModelsLoaded() {
  if (initAttempted) return !!(identitySession || freshnessSession);
  if (initPromise) return initPromise;

  initPromise = (async () => {
    initAttempted = true;
    try {
      // Dynamically import onnxruntime-web
      const ort = await import("onnxruntime-web");

      // Load model config
      const configResp = await fetch("/models/model_config.json");
      if (!configResp.ok) {
        console.warn("[MLInference] Model config not found at /models/model_config.json");
        return false;
      }
      modelConfig = await configResp.json();

      // Load identity model
      try {
        identitySession = await ort.InferenceSession.create(
          modelConfig.models.identity.path,
          { executionProviders: ["wasm"] }
        );
        const mappingResp = await fetch(modelConfig.models.identity.class_mapping);
        if (mappingResp.ok) {
          identityClassMapping = await mappingResp.json();
        }
        console.log("[MLInference] Identity model loaded successfully");
      } catch (e) {
        console.warn("[MLInference] Failed to load identity model:", e.message);
      }

      // Load freshness model
      try {
        freshnessSession = await ort.InferenceSession.create(
          modelConfig.models.freshness.path,
          { executionProviders: ["wasm"] }
        );
        const mappingResp = await fetch(modelConfig.models.freshness.class_mapping);
        if (mappingResp.ok) {
          freshnessClassMapping = await mappingResp.json();
        }
        console.log("[MLInference] Freshness model loaded successfully");
      } catch (e) {
        console.warn("[MLInference] Failed to load freshness model:", e.message);
      }

      return !!(identitySession || freshnessSession);
    } catch (e) {
      console.warn("[MLInference] ONNX Runtime not available:", e.message);
      return false;
    }
  })();

  return initPromise;
}

/**
 * Preprocess a base64 image into a Float32Array tensor [1, 3, 224, 224]
 * following ImageNet normalization.
 */
async function preprocessImage(imageBase64) {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      reject(new Error("Browser environment required"));
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

    const timeout = setTimeout(() => {
      reject(new Error("Image load timeout"));
    }, 5000);

    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = IMAGE_SIZE;
        canvas.height = IMAGE_SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context unavailable"));
          return;
        }

        ctx.drawImage(img, 0, 0, IMAGE_SIZE, IMAGE_SIZE);
        const imageData = ctx.getImageData(0, 0, IMAGE_SIZE, IMAGE_SIZE);
        const data = imageData.data;

        // Create tensor in NCHW format [1, 3, 224, 224]
        const tensor = new Float32Array(1 * 3 * IMAGE_SIZE * IMAGE_SIZE);
        const pixelCount = IMAGE_SIZE * IMAGE_SIZE;

        for (let i = 0; i < pixelCount; i++) {
          const srcIdx = i * 4;
          // Normalize: (pixel/255 - mean) / std
          tensor[0 * pixelCount + i] = (data[srcIdx] / 255.0 - IMAGENET_MEAN[0]) / IMAGENET_STD[0];     // R
          tensor[1 * pixelCount + i] = (data[srcIdx + 1] / 255.0 - IMAGENET_MEAN[1]) / IMAGENET_STD[1]; // G
          tensor[2 * pixelCount + i] = (data[srcIdx + 2] / 255.0 - IMAGENET_MEAN[2]) / IMAGENET_STD[2]; // B
        }

        resolve(tensor);
      } catch (e) {
        reject(e);
      }
    };

    img.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("Image load failed"));
    };

    img.src = imageBase64;
  });
}

/**
 * Apply softmax to logits array
 */
function softmax(logits) {
  const maxLogit = Math.max(...logits);
  const exps = logits.map(l => Math.exp(l - maxLogit));
  const sumExps = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sumExps);
}

/**
 * Run food identity classification using the trained ONNX model.
 * Returns null if model is not available (caller should fall back).
 *
 * @param {string} imageBase64
 * @returns {Promise<{foodName: string, category: string, confidence: number, isConfident: boolean, allProbabilities: object} | null>}
 */
export async function classifyFoodIdentityML(imageBase64) {
  if (!imageBase64 || typeof imageBase64 !== "string") return null;

  const loaded = await ensureModelsLoaded();
  if (!loaded || !identitySession || !identityClassMapping) return null;

  try {
    const ort = await import("onnxruntime-web");
    const tensorData = await preprocessImage(imageBase64);
    const inputTensor = new ort.Tensor("float32", tensorData, [1, 3, IMAGE_SIZE, IMAGE_SIZE]);

    const results = await identitySession.run({ input: inputTensor });
    const outputName = identitySession.outputNames[0];
    const logits = Array.from(results[outputName].data);
    const probs = softmax(logits);

    const idxToClass = identityClassMapping.idx_to_class;
    const threshold = modelConfig?.models?.identity?.confidence_threshold || 0.45;

    // Find top prediction
    let maxProb = 0;
    let maxIdx = 0;
    for (let i = 0; i < probs.length; i++) {
      if (probs[i] > maxProb) {
        maxProb = probs[i];
        maxIdx = i;
      }
    }

    const predictedName = idxToClass[String(maxIdx)] || "Unknown";
    const isConfident = maxProb >= threshold;

    // Build top-3 predictions for debugging / UI
    const allProbabilities = {};
    for (let i = 0; i < probs.length; i++) {
      const className = idxToClass[String(i)] || `class_${i}`;
      allProbabilities[className] = parseFloat(probs[i].toFixed(4));
    }

    // Category lookup
    const categoryMap = {
      apple: "Fruits", banana: "Fruits", mango: "Fruits", orange: "Fruits", pomegranate: "Fruits",
      brinjal: "Vegetables", cabbage: "Vegetables", capsicum: "Vegetables", carrot: "Vegetables",
      cucumber: "Vegetables", garlic: "Vegetables", ginger: "Vegetables", onion: "Vegetables",
      potato: "Vegetables", spinach: "Vegetables", tomato: "Vegetables"
    };

    const displayNameMap = {
      capsicum: "Capsicum (Bell Pepper)",
      brinjal: "Brinjal (Eggplant)",
      pomegranate: "Pomegranate (Anar)",
      spinach: "Leafy Vegetables (Spinach)"
    };

    const displayName = displayNameMap[predictedName] || (predictedName.charAt(0).toUpperCase() + predictedName.slice(1));
    const category = categoryMap[predictedName] || "Other";

    console.log(`[MLInference] Identity: ${displayName} (${(maxProb * 100).toFixed(1)}%) confident=${isConfident}`);

    return {
      predictedClassIndex: maxIdx,
      foodName: isConfident ? displayName : "Food not confidently identified",
      rawPredictedName: predictedName,
      category: isConfident ? category : "Other",
      confidence: parseFloat(maxProb.toFixed(4)),
      isConfident,
      allProbabilities,
      source: "MobileNetV3-Small ONNX"
    };
  } catch (e) {
    console.warn("[MLInference] Identity inference error:", e.message);
    return null;
  }
}

/**
 * Run freshness/spoilage classification using the trained ONNX model.
 * Returns null if model is not available (caller should fall back).
 *
 * @param {string} imageBase64
 * @returns {Promise<{condition: string, confidence: number, isFresh: boolean, probabilities: object} | null>}
 */
export async function classifyFreshnessML(imageBase64) {
  if (!imageBase64 || typeof imageBase64 !== "string") return null;

  const loaded = await ensureModelsLoaded();
  if (!loaded || !freshnessSession || !freshnessClassMapping) return null;

  try {
    const ort = await import("onnxruntime-web");
    const tensorData = await preprocessImage(imageBase64);
    const inputTensor = new ort.Tensor("float32", tensorData, [1, 3, IMAGE_SIZE, IMAGE_SIZE]);

    const results = await freshnessSession.run({ input: inputTensor });
    const outputName = freshnessSession.outputNames[0];
    const logits = Array.from(results[outputName].data);
    const probs = softmax(logits);

    const idxToClass = freshnessClassMapping.idx_to_class;
    const threshold = modelConfig?.models?.freshness?.confidence_threshold || 0.50;

    let maxProb = 0;
    let maxIdx = 0;
    for (let i = 0; i < probs.length; i++) {
      if (probs[i] > maxProb) {
        maxProb = probs[i];
        maxIdx = i;
      }
    }

    const predictedCondition = idxToClass[String(maxIdx)] || "unknown";
    const isFresh = predictedCondition === "fresh";

    const probabilities = {};
    for (let i = 0; i < probs.length; i++) {
      const className = idxToClass[String(i)] || `class_${i}`;
      probabilities[className] = parseFloat(probs[i].toFixed(4));
    }

    console.log(`[MLInference] Freshness: ${predictedCondition} (${(maxProb * 100).toFixed(1)}%)`);

    return {
      condition: maxProb >= threshold ? predictedCondition : "uncertain",
      confidence: parseFloat(maxProb.toFixed(4)),
      isFresh: isFresh && maxProb >= threshold,
      isSpoiled: !isFresh && maxProb >= threshold,
      isUncertain: maxProb < threshold,
      probabilities,
      source: "MobileNetV3-Small ONNX"
    };
  } catch (e) {
    console.warn("[MLInference] Freshness inference error:", e.message);
    return null;
  }
}

/**
 * Check if ML models are available for inference.
 */
export async function isMLModelAvailable() {
  return ensureModelsLoaded();
}

/**
 * Get model metadata (class count, architecture, etc.)
 */
export function getModelMetadata() {
  return {
    identity: identitySession ? {
      loaded: true,
      classes: identityClassMapping ? Object.keys(identityClassMapping.idx_to_class || {}).length : 0,
      architecture: "MobileNetV3-Small"
    } : { loaded: false },
    freshness: freshnessSession ? {
      loaded: true,
      classes: freshnessClassMapping ? Object.keys(freshnessClassMapping.idx_to_class || {}).length : 0,
      architecture: "MobileNetV3-Small"
    } : { loaded: false }
  };
}

