// Verification Script for Swiggy normalizer unit/category parsing and separation
import { parseUnitAndQuantity, normalizeSwiggyItem } from "./normalizer.js";

const testCases = [
  {
    input: { name: "Fresh Tomato (Hybrid) 500g", category: "Fresh Vegetables", quantity: 1, price: 38.0 },
    expectedName: "Fresh Tomato (Hybrid)",
    expectedQuantity: 500,
    expectedUnit: "g",
    expectedCategory: "Vegetables",
    expectedIsFood: true
  },
  {
    input: { name: "Amul Taaza Toned Milk 1L", category: "Dairy", quantity: 2, price: 54.0 },
    expectedName: "Amul Taaza Toned Milk",
    expectedQuantity: 2, // 2 * 1L = 2 L (using L unit)
    expectedUnit: "L",
    expectedCategory: "Dairy",
    expectedIsFood: true
  },
  {
    input: { name: "Whole Wheat Bread 400g", category: "Dairy & Bread", quantity: 1, price: 45.0 },
    expectedName: "Whole Wheat Bread",
    expectedQuantity: 400,
    expectedUnit: "g",
    expectedCategory: "Bakery", // Overridden by keyword bread
    expectedIsFood: true
  },
  {
    input: { name: "Comfort Fabric Conditioner (Morning Fresh) 860ml", category: "Cleaning & Household", quantity: 1, price: 235.0 },
    expectedName: "Comfort Fabric Conditioner (Morning Fresh)",
    expectedQuantity: 860,
    expectedUnit: "mL",
    expectedIsFood: false // Should filter out household cleaning products
  },
  {
    input: { name: "Colgate Strong Teeth Toothpaste 100g", category: "Personal Care", quantity: 1, price: 65.0 },
    expectedName: "Colgate Strong Teeth Toothpaste",
    expectedQuantity: 100,
    expectedUnit: "g",
    expectedIsFood: false // Should filter out personal care
  },
  {
    input: { name: "Fortune Soya Health Refined Soyabean Oil 1L", category: "Atta, Rice & Dals", quantity: 1, price: 145.0 },
    expectedName: "Fortune Soya Health Refined Soyabean Oil",
    expectedQuantity: 1,
    expectedUnit: "L",
    expectedCategory: "Grains",
    expectedIsFood: true
  },
  {
    input: { name: "Fresh Cavendish Banana 1 bunch", category: "Fresh Fruits", quantity: 1, price: 65.0 },
    expectedName: "Fresh Cavendish Banana 1 bunch", // no unit regex match for "bunch"
    expectedQuantity: 1,
    expectedUnit: "pieces",
    expectedCategory: "Fruits",
    expectedIsFood: true
  }
];

console.log("--------------------------------------------------");
console.log("RUNNING SWIGGY PARSING AND SEPARATION VALIDATION");
console.log("--------------------------------------------------");

let passed = 0;
let failed = 0;

testCases.forEach((tc, index) => {
  const result = normalizeSwiggyItem(tc.input);
  const casePassed = 
    result.name === tc.expectedName &&
    result.quantity === tc.expectedQuantity &&
    result.unit === tc.expectedUnit &&
    (tc.expectedCategory ? result.category === tc.expectedCategory : true) &&
    result.isFood === tc.expectedIsFood;

  if (casePassed) {
    console.log(`✅ Case ${index + 1} PASSED: "${tc.input.name}"`);
    passed++;
  } else {
    console.error(`❌ Case ${index + 1} FAILED: "${tc.input.name}"`);
    console.error("  Expected:", {
      name: tc.expectedName,
      quantity: tc.expectedQuantity,
      unit: tc.expectedUnit,
      category: tc.expectedCategory,
      isFood: tc.expectedIsFood
    });
    console.error("  Got:", {
      name: result.name,
      quantity: result.quantity,
      unit: result.unit,
      category: result.category,
      isFood: result.isFood
    });
    failed++;
  }
});

console.log("--------------------------------------------------");
console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
console.log("--------------------------------------------------");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("All normalizer validation checks passed successfully!");
  process.exit(0);
}
