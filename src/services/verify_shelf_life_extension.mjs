// Node verification script for Smart Pantry extension services
import { lookupFoodMaster } from "./foodMasterDb.js";
import { calculateShelfLife } from "./shelfLifeEngine.js";

console.log("=========================================");
console.log("SMART PANTRY EXTENSION INTEGRATION TESTS");
console.log("=========================================");

let passed = 0;
let total = 0;

function assert(condition, testName) {
  total++;
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName}`);
  }
}

// Test 1: Food Master Database Lookup
const spinachMaster = lookupFoodMaster("Fresh Organic Spinach", "Vegetables");
assert(spinachMaster.category === "Vegetables" && spinachMaster.spoilageRisk === "high", "Food Master lookup for Spinach");

const milkMaster = lookupFoodMaster("Amul Fresh Milk 500ml", "Dairy");
assert(milkMaster.category === "Dairy" && milkMaster.baseShelfLifeDays.fridge === 5, "Food Master lookup for Milk");

// Test 2: Shelf-Life Engine Calculation
const deliveredAt = "2026-08-25T10:00:00.000Z";

const shelfLifeRes = calculateShelfLife({
  name: "Fresh Spinach",
  category: "Vegetables",
  receivedAt: deliveredAt,
  storageCondition: "fridge",
  freshnessScore: 100
});

assert(shelfLifeRes.consumeByDate === "2026-08-31", `Shelf life consume-by date calculation (Got: ${shelfLifeRes.consumeByDate}, Expected: 2026-08-31)`);
assert(shelfLifeRes.spoilageRisk === "high", "Shelf life engine spoilage risk assignment");

// Test 3: Freshness Score Adjustment
const degradedRes = calculateShelfLife({
  name: "Fresh Spinach",
  category: "Vegetables",
  receivedAt: deliveredAt,
  storageCondition: "fridge",
  freshnessScore: 50 // 50% score cuts shelf life in half (6 days * 0.5 = 3 days)
});

assert(degradedRes.estimatedShelfLifeDays === 3, `Freshness score multiplier calculation (Got: ${degradedRes.estimatedShelfLifeDays}, Expected: 3)`);

// Test 4: Contextual Storage Location Multiplier (Counter vs Refrigerator for Spinach: 60% reduction)
const counterSpinachRes = calculateShelfLife({
  name: "Fresh Spinach",
  category: "Vegetables",
  receivedAt: deliveredAt,
  storageCondition: "counter",
  freshnessScore: 100
});

assert(
  counterSpinachRes.estimatedShelfLifeDays === 2.4 && counterSpinachRes.storageMultiplier === 0.40,
  `Contextual Counter storage shelf life (Got: ${counterSpinachRes.estimatedShelfLifeDays} days with multiplier ${counterSpinachRes.storageMultiplier}, Expected: 2.4 days with 0.40 multiplier)`
);

console.log("=========================================");
console.log(`TEST RESULTS: ${passed} / ${total} PASSED`);
console.log("=========================================");

if (passed !== total) {
  process.exit(1);
}

