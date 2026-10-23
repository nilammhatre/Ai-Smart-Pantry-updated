// Food Knowledge Base & USDA FoodKeeper / AgriFreshNET Standards Database
// Defines detailed visual characteristics, warning signals, critical spoilage criteria, and storage lifespans per food item.

export const DETAILED_FOOD_KNOWLEDGE_BASE = {
  tomato: {
    name: "Tomato",
    category: "Vegetables",
    expectedVisuals: {
      normal: "Smooth, glossy red or orange-red skin, firm stem end, solid skin tension.",
      warning: "Significant surface wrinkling, dulling color, mild soft patches, stem detachment.",
      criticalSpoilage: "Black or dark brown rot spots, fuzzy mold (white, green, or black), liquid leakage, tissue collapse, deep sunken lesions, broken skin."
    },
    baselineShelfLifeDays: { ambient: 7, fridge: 12, freezer: 60 },
    spoilageIndicators: ["fuzzy_mold", "black_brown_rot", "tissue_collapse", "liquid_leakage", "broken_skin", "severe_wrinkles"],
    ripenessStages: ["UNRIPE_GREEN", "RIPE_RED", "OVER_RIPE"],
    foodKeeperRef: "USDA FoodKeeper & AgriFreshNET: Fresh Produce - Tomatoes (Ambient 7d)"
  },

  potato: {
    name: "Potato",
    category: "Vegetables",
    expectedVisuals: {
      normal: "Dry firm skin, smooth surface, neutral earthy smell.",
      warning: "Small green skin tinting, tiny sprout nubs, slight wrinkling.",
      criticalSpoilage: "Extensive green solanine patches, sprouts (> 1 inch), soft squishy texture, black/brown rot lesions, shriveling, watery decay."
    },
    baselineShelfLifeDays: { ambient: 30, fridge: 45, freezer: 240 },
    spoilageIndicators: ["green_solanine", "sprouts", "black_brown_lesions", "shriveling", "squishy_rot"],
    foodKeeperRef: "USDA FoodKeeper: Vegetables - Potatoes (Cool Pantry 30d)"
  },

  onion: {
    name: "Onion",
    category: "Vegetables",
    expectedVisuals: {
      normal: "Dry papery outer skin, firm tight bulb, dry neck.",
      warning: "Soft outer layer, green sprouting shoots.",
      criticalSpoilage: "Fuzzy mold spores under paper skin, soft/wet patches, discoloration, green sprouts, collapsed inner layers, liquid leakage."
    },
    baselineShelfLifeDays: { ambient: 30, fridge: 45, freezer: 180 },
    spoilageIndicators: ["fuzzy_mold", "soft_wet_patches", "discoloration", "green_sprouts", "collapsed_layers"],
    foodKeeperRef: "USDA FoodKeeper: Vegetables - Onions (Cool Pantry 30d)"
  },

  brinjal: {
    name: "Brinjal (Eggplant)",
    category: "Vegetables",
    expectedVisuals: {
      normal: "Glossy deep purple/violet skin, firm green calyx, solid plump body.",
      warning: "Dull skin finish, slight softness near base, minor skin indentations.",
      criticalSpoilage: "Sunken brown/black patches, mushy soft areas, heavy skin wrinkling, fuzzy mold growth, spongy pulp collapse."
    },
    baselineShelfLifeDays: { ambient: 4, fridge: 9, freezer: 90 },
    spoilageIndicators: ["brown_black_patches", "mushy_soft_areas", "heavy_wrinkles", "fuzzy_mold"],
    foodKeeperRef: "AgriFreshNET & USDA FoodKeeper: Vegetables - Eggplants (Fridge 7-9d)"
  },

  capsicum: {
    name: "Capsicum (Bell Pepper)",
    category: "Vegetables",
    expectedVisuals: {
      normal: "Firm thick glossy skin (green, red, yellow), crisp flesh, stiff green stem.",
      warning: "Dull skin, slight surface shriveling near stem.",
      criticalSpoilage: "Extensive deep wrinkles, dark sunken rot spots, fuzzy mold growth, collapsed/soft mushy regions, watery breakdown."
    },
    baselineShelfLifeDays: { ambient: 5, fridge: 12, freezer: 120 },
    spoilageIndicators: ["extensive_wrinkles", "dark_rot_spots", "fuzzy_mold", "collapsed_soft_regions"],
    foodKeeperRef: "USDA FoodKeeper: Vegetables - Peppers (Fridge 7-14d)"
  },

  carrot: {
    name: "Carrot",
    category: "Vegetables",
    expectedVisuals: {
      normal: "Bright orange, firm snap texture, smooth root body.",
      warning: "White blush oxidation, bendable rubbery texture.",
      criticalSpoilage: "Fuzzy mold (white/black), dark brown rot, excessive shriveling, soft/wet mushy areas, slimy root tip."
    },
    baselineShelfLifeDays: { ambient: 5, fridge: 21, freezer: 180 },
    spoilageIndicators: ["fuzzy_mold", "dark_rot", "excessive_shriveling", "soft_wet_areas", "slimy_decay"],
    foodKeeperRef: "USDA FoodKeeper: Vegetables - Carrots (Fridge 2-3 weeks)"
  },

  spinach: {
    name: "Leafy Vegetables (Spinach, Pudina, Methi, Coriander, Lettuce)",
    category: "Vegetables",
    expectedVisuals: {
      normal: "Vibrant green crisp leaves, firm stems, fresh aroma.",
      warning: "Yellowing leaf tips, mild wilting, limp stems.",
      criticalSpoilage: "Chlorosis yellowing, severe wilting, browning, wet slimy black sludge, white/grey mold spores."
    },
    baselineShelfLifeDays: { ambient: 2, fridge: 6, freezer: 30 },
    spoilageIndicators: ["chlorosis_yellowing", "severe_wilting", "browning", "sliminess", "fuzzy_mold"],
    foodKeeperRef: "VegQual & USDA FoodKeeper: Fresh Produce - Leafy Greens (Fridge 5-7d)"
  },

  banana: {
    name: "Banana",
    category: "Fruits",
    expectedVisuals: {
      normal: "Bright yellow peel, green stem, light sugar freckles.",
      warning: "Extensive brown freckling, soft stem, darkened skin peel.",
      criticalSpoilage: "Blackened mushy peel with white mold, liquid oozing, greyish pulp rot, fermented vinegar odor."
    },
    baselineShelfLifeDays: { ambient: 5, fridge: 8, freezer: 90 },
    spoilageIndicators: ["black_mushy_skin", "fuzzy_mold", "liquid_leakage", "fermented_decay"],
    ripenessStages: ["GREEN_UNRIPE", "YELLOW_RIPE", "BROWN_FRECKLED_OVERRIPE", "BLACK_SPOILED"],
    foodKeeperRef: "USDA FoodKeeper: Fresh Produce - Bananas (Ambient 5d)"
  },

  apple: {
    name: "Apple",
    category: "Fruits",
    expectedVisuals: {
      normal: "Crisp smooth red/green skin, firm texture, tight stem.",
      warning: "Slight skin dullness, minor pressure bruises, mealy pulp.",
      criticalSpoilage: "Sunken brown rot lesions, white fuzzy mold, soft mushy core collapse, sour alcoholic odor."
    },
    baselineShelfLifeDays: { ambient: 7, fridge: 30, freezer: 180 },
    spoilageIndicators: ["brown_rot_lesions", "fuzzy_mold", "core_collapse"],
    foodKeeperRef: "USDA FoodKeeper: Fresh Produce - Apples (Fridge 30d)"
  },

  pomegranate: {
    name: "Pomegranate (Anar)",
    category: "Fruits",
    expectedVisuals: {
      normal: "Deep red or ruby-crimson leathery rind, firm crown, solid heavy weight.",
      warning: "Dull brownish-red rind, minor dry skin scratches.",
      criticalSpoilage: "Grey/white fuzzy mold, mushy soft pulp collapse, sour vinegar leakage, deep blackened soft lesions."
    },
    baselineShelfLifeDays: { ambient: 14, fridge: 45, freezer: 180 },
    spoilageIndicators: ["fuzzy_mold", "mushy_soft_collapse", "sour_leakage"],
    foodKeeperRef: "USDA FoodKeeper: Fresh Produce - Pomegranates (Fridge 1-2 months)"
  },

  milk: {
    name: "Fresh Milk",
    category: "Dairy",
    expectedVisuals: {
      normal: "Smooth opaque white liquid, intact sealed carton/packet.",
      warning: "Near end of date, slight cap residue.",
      criticalSpoilage: "Sour acidic smell, curdled lumpy texture, yellow/green surface mold, bulging carton."
    },
    baselineShelfLifeDays: { ambient: 0.5, fridge: 5, freezer: 60 },
    spoilageIndicators: ["curdled_lumps", "sour_odor", "bulging_carton"],
    foodKeeperRef: "USDA FoodKeeper: Dairy - Milk (Fridge 5-7d after open)"
  },

  paneer: {
    name: "Fresh Paneer / Cottage Cheese",
    category: "Dairy",
    expectedVisuals: {
      normal: "Clean white block, firm moist texture, fresh milky scent.",
      warning: "Slight yellow tinge, minor surface dryness.",
      criticalSpoilage: "Pink or green mold spots, slimy slippery surface, sharp sour yeast odor."
    },
    baselineShelfLifeDays: { ambient: 0.5, fridge: 6, freezer: 90 },
    spoilageIndicators: ["pink_green_mold", "slimy_surface", "sour_yeast_odor"],
    foodKeeperRef: "USDA FoodKeeper: Dairy - Fresh Cheese (Fridge 5d)"
  },

  bread: {
    name: "Fresh Bread",
    category: "Bakery",
    expectedVisuals: {
      normal: "Soft crumb structure, dry fresh crust.",
      warning: "Stale dry texture, slight hardness.",
      criticalSpoilage: "Green, white, or black fuzzy mold spots, sour odor."
    },
    baselineShelfLifeDays: { ambient: 4, fridge: 7, freezer: 90 },
    spoilageIndicators: ["fuzzy_mold_spots", "sour_odor"],
    foodKeeperRef: "USDA FoodKeeper: Bakery - Bread (Ambient 3-5d)"
  },

  chapati: {
    name: "Chapati / Roti / Naan",
    category: "Bakery",
    expectedVisuals: {
      normal: "Soft pliable flatbread, light golden brown char spots, dry wheat aroma.",
      warning: "Stiff dry texture, hard brittle edges, loss of elasticity.",
      criticalSpoilage: "White, green, or black fuzzy mold spots, sour fermented smell, slimy surface texture when damp."
    },
    baselineShelfLifeDays: { ambient: 2, fridge: 5, freezer: 60 },
    spoilageIndicators: ["fuzzy_mold_spots", "stiffness_brittleness", "sour_odor"],
    foodKeeperRef: "USDA FoodKeeper & Indian Food Safety: Prepared Flatbreads (Ambient 2d, Fridge 5d)"
  },

  rice: {
    name: "Cooked Rice / Biryani",
    category: "Grains",
    expectedVisuals: {
      normal: "Fluffy distinct grains, white or golden seasoned color, fresh steam aroma.",
      warning: "Slightly clumpy or dry grains, reduced aroma.",
      criticalSpoilage: "Yellowish/pinkish slime layer (Bacillus cereus risk), sour acidic smell, grey/white mold fuzz, rancid odor."
    },
    baselineShelfLifeDays: { ambient: 0.5, fridge: 4, freezer: 90 },
    spoilageIndicators: ["yellowish_pink_slime", "sour_fermented_odor", "fuzzy_mold", "clumped_slimy_decay"],
    foodKeeperRef: "USDA FoodKeeper: Prepared Grains - Cooked Rice (Fridge 3-4d)"
  },

  curry: {
    name: "Prepared Curry / Dal / Sabzi",
    category: "Cooked Food",
    expectedVisuals: {
      normal: "Aromatic gravy or lentils, rich uniform color, fresh steam scent.",
      warning: "Oil separation on surface, mild darkening.",
      criticalSpoilage: "Surface white/green mold fuzz layer, active bubbling/foaming (fermentation), sharp sour acidic smell."
    },
    baselineShelfLifeDays: { ambient: 0.5, fridge: 4, freezer: 90 },
    spoilageIndicators: ["surface_mold_layer", "foaming_fermentation", "sour_acidic_smell"],
    foodKeeperRef: "USDA FoodKeeper: Leftovers & Cooked Dishes (Fridge 3-4d)"
  },

  cucumber: {
    name: "Cucumber (Kheera)",
    category: "Vegetables",
    expectedVisuals: {
      normal: "Firm dark green skin, crisp solid body, fresh clean scent.",
      warning: "Dull skin, slight softness at tips, minor yellow tinting.",
      criticalSpoilage: "Translucent waterlogged spots, mushy soft pulp collapse, yellowing decay, white fuzzy mold."
    },
    baselineShelfLifeDays: { ambient: 3, fridge: 7, freezer: 30 },
    spoilageIndicators: ["waterlogged_spots", "mushy_pulp_collapse", "yellowing_decay", "fuzzy_mold"],
    foodKeeperRef: "USDA FoodKeeper: Fresh Produce - Cucumbers (Fridge 7d)"
  },

  cauliflower: {
    name: "Cauliflower / Broccoli (Gobi)",
    category: "Vegetables",
    expectedVisuals: {
      normal: "Tight creamy-white floret head, crisp green outer leaves.",
      warning: "Light tan freckling on florets, minor leaf wilting.",
      criticalSpoilage: "Dark brown/black rot spots on florets, slimy mushy stem decay, grey mold fuzz, strong sulfur odor."
    },
    baselineShelfLifeDays: { ambient: 3, fridge: 10, freezer: 180 },
    spoilageIndicators: ["dark_rot_florets", "slimy_mushy_stem", "fuzzy_mold"],
    foodKeeperRef: "USDA FoodKeeper: Vegetables - Cauliflower (Fridge 1-2 weeks)"
  },

  mango: {
    name: "Mango (Aam)",
    category: "Fruits",
    expectedVisuals: {
      normal: "Vibrant yellow/orange skin, sweet fragrance, yielding firm flesh.",
      warning: "Wrinkled skin, very soft flesh near stem.",
      criticalSpoilage: "Black sunken rot patches (anthracnose), squishy pulp collapse, sour vinegar smell, white mold."
    },
    baselineShelfLifeDays: { ambient: 5, fridge: 9, freezer: 180 },
    spoilageIndicators: ["black_sunken_patches", "squishy_pulp_collapse", "sour_vinegar_odor", "fuzzy_mold"],
    foodKeeperRef: "USDA FoodKeeper: Tropical Fruits - Mangoes (Fridge 5-9d)"
  },

  orange: {
    name: "Orange / Citrus / Lemon (Nimbu)",
    category: "Fruits",
    expectedVisuals: {
      normal: "Bright glossy orange/yellow peel, firm round body, citrus aroma.",
      warning: "Soft skin indentations, dull dry peel.",
      criticalSpoilage: "Green or white powdery mold patches (penicillium rot), mushy squishy body collapse, sour moldy odor."
    },
    baselineShelfLifeDays: { ambient: 10, fridge: 21, freezer: 120 },
    spoilageIndicators: ["green_white_powdery_mold", "mushy_squishy_body"],
    foodKeeperRef: "USDA FoodKeeper: Citrus Fruits - Oranges/Lemons (Fridge 2-3 weeks)"
  }
};

/**
 * Looks up food knowledge base rules by item name.
 * @param {string} itemName 
 * @returns {object} Knowledge base rules
 */
export function getFoodKnowledgeBase(itemName = "") {
  const clean = itemName.toLowerCase();

  if (clean.includes("chapati") || clean.includes("roti") || clean.includes("phulka") || clean.includes("naan") || clean.includes("paratha")) {
    return DETAILED_FOOD_KNOWLEDGE_BASE.chapati;
  }
  if (clean.includes("rice") || clean.includes("biryani") || clean.includes("pulao") || clean.includes("chawal")) {
    return DETAILED_FOOD_KNOWLEDGE_BASE.rice;
  }
  if (clean.includes("curry") || clean.includes("dal") || clean.includes("sabzi") || clean.includes("gravy") || clean.includes("sambar")) {
    return DETAILED_FOOD_KNOWLEDGE_BASE.curry;
  }
  if (clean.includes("cucumber") || clean.includes("kheera")) {
    return DETAILED_FOOD_KNOWLEDGE_BASE.cucumber;
  }
  if (clean.includes("cauliflower") || clean.includes("broccoli") || clean.includes("gobi")) {
    return DETAILED_FOOD_KNOWLEDGE_BASE.cauliflower;
  }
  if (clean.includes("pomegranate") || clean.includes("anar")) {
    return DETAILED_FOOD_KNOWLEDGE_BASE.pomegranate;
  }
  if (clean.includes("mango") || clean.includes("aam")) {
    return DETAILED_FOOD_KNOWLEDGE_BASE.mango;
  }
  if (clean.includes("orange") || clean.includes("lemon") || clean.includes("nimbu") || clean.includes("citrus")) {
    return DETAILED_FOOD_KNOWLEDGE_BASE.orange;
  }
  if (clean.includes("brinjal") || clean.includes("eggplant") || clean.includes("baingan")) {
    return DETAILED_FOOD_KNOWLEDGE_BASE.brinjal;
  }
  if (clean.includes("capsicum") || clean.includes("bell pepper") || clean.includes("shimla mirch")) {
    return DETAILED_FOOD_KNOWLEDGE_BASE.capsicum;
  }
  if (clean.includes("carrot") || clean.includes("gajar")) {
    return DETAILED_FOOD_KNOWLEDGE_BASE.carrot;
  }
  if (clean.includes("spinach") || clean.includes("palak") || clean.includes("pudina") || clean.includes("methi") || clean.includes("coriander") || clean.includes("leafy") || clean.includes("lettuce")) {
    return DETAILED_FOOD_KNOWLEDGE_BASE.spinach;
  }
  if (clean.includes("potato") || clean.includes("aloo")) {
    return DETAILED_FOOD_KNOWLEDGE_BASE.potato;
  }
  if (clean.includes("onion") || clean.includes("pyaz")) {
    return DETAILED_FOOD_KNOWLEDGE_BASE.onion;
  }
  if (clean.includes("tomato") || clean.includes("tamatar")) {
    return DETAILED_FOOD_KNOWLEDGE_BASE.tomato;
  }

  for (const key in DETAILED_FOOD_KNOWLEDGE_BASE) {
    if (clean.includes(key)) {
      return DETAILED_FOOD_KNOWLEDGE_BASE[key];
    }
  }

  // Generic fallback
  return {
    name: itemName || "Food Item",
    category: "Other",
    expectedVisuals: {
      normal: "Normal color, firm surface, intact skin.",
      warning: "Minor discoloration or softening.",
      criticalSpoilage: "Fuzzy mold, black rot, liquid leakage, collapsed areas."
    },
    baselineShelfLifeDays: { ambient: 5, fridge: 10, freezer: 60 },
    spoilageIndicators: ["fuzzy_mold", "black_brown_rot", "tissue_collapse"],
    foodKeeperRef: "USDA FoodKeeper & VegQual: Standard Food Storage Guidelines"
  };
}
