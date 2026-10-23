// Utility for normalizing Swiggy Instamart responses into Smart Pantry formats

const CATEGORY_MAP = {
  "Fresh Vegetables": "Vegetables",
  "Fresh Fruits": "Fruits",
  "Dairy": "Dairy",
  "Dairy & Bread": "Dairy",
  "Atta, Rice & Dals": "Grains",
  "Grains": "Grains",
  "Ghee & Oils": "Grains",
  "Masalas & Spices": "Grains",
  "Soft Drinks & Juices": "Beverages",
  "Beverages": "Beverages",
  "Snacks & Munchies": "Snacks",
  "Snacks": "Snacks",
  "Frozen Food": "Frozen Food",
  "Bakery": "Bakery"
};

const NON_FOOD_CATEGORIES = [
  "cleaning & household",
  "cleaning",
  "household",
  "personal care",
  "cosmetics",
  "baby care",
  "pet care",
  "pooja needs",
  "stationery",
  "home & kitchen",
  "appliances",
  "otc & wellness",
  "pharmacy"
];

/**
 * Extracts quantity and unit from product name.
 * E.g. "Amul Fresh Cream 250ml" -> { name: "Amul Fresh Cream", packageSize: 250, unit: "mL" }
 */
export function parseUnitAndQuantity(productName) {
  const unitRegex = /(\d+(?:\.\d+)?)\s*(g|kg|ml|l|pieces|pcs|packets|can|unit|u)\b/i;
  const match = productName.match(unitRegex);

  if (match) {
    const size = parseFloat(match[1]);
    let unit = match[2].toLowerCase();

    // Clean name by removing the unit match
    const cleanName = productName.replace(match[0], "").trim().replace(/\s+$/, "");

    // Normalize unit
    if (unit === "ml") {
      unit = "mL";
    } else if (unit === "l") {
      unit = "L";
    } else if (unit === "pcs" || unit === "pieces" || unit === "packets" || unit === "can" || unit === "unit" || unit === "u") {
      unit = "pieces";
    }

    return {
      cleanName,
      packageSize: size,
      unit
    };
  }

  return {
    cleanName: productName.trim(),
    packageSize: 1,
    unit: "pieces"
  };
}

/**
 * Normalizes a single Swiggy item.
 */
export function normalizeSwiggyItem(item) {
  const { cleanName, packageSize, unit } = parseUnitAndQuantity(item.name);
  const rawCategory = item.category || "Other";
  
  // Categorize
  let mappedCategory = CATEGORY_MAP[rawCategory] || "Other";
  
  // Override for bakery items based on name search with word boundaries
  const bakeryRegex = /\b(breads?|loaves|loaf|buns?|pavs?|croissants?|toasts?|roti|rotis|buns)\b/i;
  if (bakeryRegex.test(cleanName)) {
    mappedCategory = "Bakery";
  }

  // Detect non-food items
  const isNonFood = NON_FOOD_CATEGORIES.some(cat => 
    rawCategory.toLowerCase().includes(cat) || 
    (item.category_group && item.category_group.toLowerCase().includes(cat))
  );
  
  const isFood = !isNonFood;

  // Calculate final quantity
  let quantity = item.quantity || 1;
  if (unit === "g" || unit === "kg" || unit === "mL" || unit === "L") {
    // If it's a measurable unit, total is ordered quantity * package size
    quantity = packageSize * (item.quantity || 1);
  }

  return {
    name: cleanName,
    quantity,
    unit,
    category: mappedCategory,
    isFood,
    originalCategory: rawCategory,
    price: item.price || 0
  };
}

/**
 * Normalizes an entire order detail payload.
 */
export function normalizeOrder(order) {
  if (!order) return null;

  const normalizedItems = (order.items || []).map(normalizeSwiggyItem);
  const foodItems = normalizedItems.filter(item => item.isFood);
  const nonFoodItems = normalizedItems.filter(item => !item.isFood);

  return {
    orderId: order.orderId,
    createdAt: order.createdAt,
    deliveredAt: order.deliveredAt || order.createdAt,
    status: order.status || "delivered",
    totalAmount: order.totalAmount || 0,
    items: normalizedItems,
    foodItems,
    nonFoodItems
  };
}
