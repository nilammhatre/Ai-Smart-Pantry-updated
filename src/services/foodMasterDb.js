// Food Master Database containing item categories, typical shelf life, storage methods, and spoilage risk attributes

export const FOOD_MASTER_DATABASE = [
  // Vegetables
  {
    keywords: ["spinach", "palak", "lettuce", "coriander", "mint", "pudina", "methi", "greens", "leafy"],
    name: "Leafy Greens (Spinach, Coriander, etc.)",
    category: "Vegetables",
    storageMethod: "Refrigerated (1-4°C) in paper towel",
    baseShelfLifeDays: { ambient: 2, fridge: 6, freezer: 30 },
    spoilageRisk: "high",
    storageAdvice: "Keep dry in a paper towel inside a perforated container in the crisp drawer.",
    spoilageIndicators: "Wilting, yellowing leaves, slimy texture, foul odor."
  },
  {
    keywords: ["tomato", "tomatoes"],
    name: "Fresh Tomatoes",
    category: "Vegetables",
    storageMethod: "Ambient / Cool dry place stem-down",
    baseShelfLifeDays: { ambient: 7, fridge: 12, freezer: 60 },
    spoilageRisk: "medium",
    storageAdvice: "Store stem-side down at room temperature away from direct sunlight.",
    spoilageIndicators: "Soft spots, wrinkled skin, mold around stem, sour smell."
  },
  {
    keywords: ["onion", "onions"],
    name: "Onions",
    category: "Vegetables",
    storageMethod: "Cool, dark, dry well-ventilated space",
    baseShelfLifeDays: { ambient: 30, fridge: 45, freezer: 180 },
    spoilageRisk: "low",
    storageAdvice: "Store in a cool, dark mesh bag. Keep away from potatoes.",
    spoilageIndicators: "Sprouting green shoots, soft mushy spots, black mold."
  },
  {
    keywords: ["potato", "potatoes", "aloo"],
    name: "Potatoes",
    category: "Vegetables",
    storageMethod: "Cool, dark, dry place",
    baseShelfLifeDays: { ambient: 30, fridge: 60, freezer: 240 },
    spoilageRisk: "low",
    storageAdvice: "Store in a breathable paper bag or cardboard box in a dark pantry.",
    spoilageIndicators: "Green skin patches, soft wrinkly texture, long sprouts."
  },
  {
    keywords: ["carrot", "carrots", "gajar"],
    name: "Carrots",
    category: "Vegetables",
    storageMethod: "Refrigerated (1-4°C) in sealed container",
    baseShelfLifeDays: { ambient: 5, fridge: 21, freezer: 180 },
    spoilageRisk: "medium",
    storageAdvice: "Trim green tops and submerge in water or seal in an airtight container.",
    spoilageIndicators: "White blush, rubbery bendable texture, slimy surface."
  },

  // Fruits
  {
    keywords: ["apple", "apples"],
    name: "Fresh Apples",
    category: "Fruits",
    storageMethod: "Refrigerated crisper drawer",
    baseShelfLifeDays: { ambient: 7, fridge: 30, freezer: 180 },
    spoilageRisk: "low",
    storageAdvice: "Refrigerate in a plastic bag with holes to maintain humidity.",
    spoilageIndicators: "Soft brownish core, mealy texture, bruised skin."
  },
  {
    keywords: ["banana", "bananas", "kela"],
    name: "Bananas",
    category: "Fruits",
    storageMethod: "Ambient hanging hook",
    baseShelfLifeDays: { ambient: 5, fridge: 8, freezer: 90 },
    spoilageRisk: "high",
    storageAdvice: "Wrap stem in foil to slow ethylene gas ripening.",
    spoilageIndicators: "Blackened soft peel, mushy brown flesh, fermented scent."
  },
  {
    keywords: ["orange", "oranges", "citrus", "lemon", "lemons"],
    name: "Citrus Fruits",
    category: "Fruits",
    storageMethod: "Refrigerated mesh bag",
    baseShelfLifeDays: { ambient: 7, fridge: 21, freezer: 120 },
    spoilageRisk: "low",
    storageAdvice: "Keep loose in crisper drawer to prevent mold formation.",
    spoilageIndicators: "Blue-green mold, soft squishy spots, hard dried-out peel."
  },
  {
    keywords: ["pomegranate", "pomegranates", "anar"],
    name: "Pomegranate (Anar)",
    category: "Fruits",
    storageMethod: "Refrigerated crisper drawer",
    baseShelfLifeDays: { ambient: 14, fridge: 45, freezer: 180 },
    spoilageRisk: "low",
    storageAdvice: "Store whole in crisper drawer or extract arils into an airtight container.",
    spoilageIndicators: "Mold on crown, soft mushy skin, sour fermented leakage."
  },

  // Dairy & Bakery
  {
    keywords: ["milk", "doodh", "fresh milk"],
    name: "Fresh Milk",
    category: "Dairy",
    storageMethod: "Refrigerated (2-4°C) main shelf",
    baseShelfLifeDays: { ambient: 0.5, fridge: 5, freezer: 60 },
    spoilageRisk: "high",
    storageAdvice: "Store inside the main fridge shelves, avoid the door rack temperature fluctuations.",
    spoilageIndicators: "Sour odor, curdled texture, lumpy consistency when poured."
  },
  {
    keywords: ["paneer", "cottage cheese"],
    name: "Fresh Paneer",
    category: "Dairy",
    storageMethod: "Refrigerated submerged in cold water",
    baseShelfLifeDays: { ambient: 0.5, fridge: 6, freezer: 90 },
    spoilageRisk: "high",
    storageAdvice: "Keep submerged in clean water inside a sealed container; change water daily.",
    spoilageIndicators: "Yellowish discoloration, slimy surface, sour yeast smell."
  },
  {
    keywords: ["curd", "dahi", "yogurt", "yoghurt"],
    name: "Curd / Dahi",
    category: "Dairy",
    storageMethod: "Refrigerated (2-4°C)",
    baseShelfLifeDays: { ambient: 1, fridge: 10, freezer: 60 },
    spoilageRisk: "medium",
    storageAdvice: "Keep tightly sealed in a refrigerated glass or plastic tub.",
    spoilageIndicators: "Pink/green surface mold, excessively sharp acidic smell, watery separation."
  },
  {
    keywords: ["bread", "loaf", "bun", "pav", "toast"],
    name: "Fresh Bread / Pav",
    category: "Bakery",
    storageMethod: "Cool dry pantry or Freezer",
    baseShelfLifeDays: { ambient: 4, fridge: 7, freezer: 90 },
    spoilageRisk: "high",
    storageAdvice: "Store in a cool dry bread box. Freeze unused slices for extended fresh taste.",
    spoilageIndicators: "Green/white fuzzy mold spots, stale rock-hard crust, sour scent."
  },
  {
    keywords: ["butter", "ghee", "cheese"],
    name: "Butter & Cheese",
    category: "Dairy",
    storageMethod: "Refrigerated in butter dish or wrapper",
    baseShelfLifeDays: { ambient: 2, fridge: 30, freezer: 180 },
    spoilageRisk: "low",
    storageAdvice: "Keep wrapped tightly in parchment or foil to avoid odor absorption.",
    spoilageIndicators: "Rancid smell, dark yellow oxidation on edges, mold spots."
  },

  // Meat, Poultry & Eggs
  {
    keywords: ["egg", "eggs", "anda"],
    name: "Fresh Eggs",
    category: "Dairy",
    storageMethod: "Refrigerated original carton",
    baseShelfLifeDays: { ambient: 7, fridge: 30, freezer: 0 },
    spoilageRisk: "low",
    storageAdvice: "Keep in original carton on a middle fridge shelf to maintain steady humidity.",
    spoilageIndicators: "Floats in water test, sulfurous rotten smell when cracked."
  },
  {
    keywords: ["chicken", "poultry", "meat", "mutton", "fish"],
    name: "Fresh Meat & Poultry",
    category: "Meat/Poultry",
    storageMethod: "Freezer (-18°C) or Lowest fridge shelf",
    baseShelfLifeDays: { ambient: 0.2, fridge: 2, freezer: 120 },
    spoilageRisk: "high",
    storageAdvice: "Refrigerate on bottom shelf to prevent juice drips, or freeze immediately.",
    spoilageIndicators: "Greyish brown tint, sticky/slimy surface, pungent ammonia scent."
  },

  // Grains, Staples & Packaged Foods
  {
    keywords: ["rice", "atta", "flour", "dal", "pulses"],
    name: "Grains & Flour",
    category: "Grains",
    storageMethod: "Airtight container in dry pantry",
    baseShelfLifeDays: { ambient: 180, fridge: 360, freezer: 540 },
    spoilageRisk: "low",
    storageAdvice: "Store with dry bay leaves in airtight containers to discourage weevils.",
    spoilageIndicators: "Insect infestation (weevils), clumping from moisture, musty odor."
  },
  {
    keywords: ["juice", "soda", "drink", "beverage"],
    name: "Packaged Beverages",
    category: "Beverages",
    storageMethod: "Ambient before opening, Refrigerate after opening",
    baseShelfLifeDays: { ambient: 60, fridge: 7, freezer: 30 },
    spoilageRisk: "medium",
    storageAdvice: "Refrigerate once opened and consume within 5-7 days.",
    spoilageIndicators: "Bulging package/can, cloudiness, sour off-flavor."
  },
  {
    keywords: ["chips", "biscuits", "namkeen", "snack"],
    name: "Packaged Snacks",
    category: "Snacks",
    storageMethod: "Airtight dry container",
    baseShelfLifeDays: { ambient: 90, fridge: 120, freezer: 180 },
    spoilageRisk: "low",
    storageAdvice: "Clip opened bags securely or transfer to glass jars to preserve crispness.",
    spoilageIndicators: "Soggy soft texture, oil rancidity smell."
  }
];

/**
 * Finds matching food master entry for a given product name or category.
 * @param {string} itemName 
 * @param {string} category 
 * @returns {object} Food master record or default fallback
 */
export function lookupFoodMaster(itemName = "", category = "") {
  const cleanName = itemName.toLowerCase();
  
  // 1. Keyword search match
  for (const master of FOOD_MASTER_DATABASE) {
    if (master.keywords.some(kw => cleanName.includes(kw))) {
      return master;
    }
  }

  // 2. Category match fallback
  const catUpper = (category || "").toUpperCase();
  const categoryMatch = FOOD_MASTER_DATABASE.find(m => m.category.toUpperCase() === catUpper);
  if (categoryMatch) {
    return categoryMatch;
  }

  // 3. Default fallback
  return {
    keywords: [],
    name: itemName || "General Food Item",
    category: category || "Other",
    storageMethod: "Refrigerated or Cool Pantry",
    baseShelfLifeDays: { ambient: 5, fridge: 10, freezer: 60 },
    spoilageRisk: "medium",
    storageAdvice: "Keep stored in a clean, cool, and dry location.",
    spoilageIndicators: "Check for discoloration, mold, or off-odors."
  };
}
