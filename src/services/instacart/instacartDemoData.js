/**
 * Instacart Online Grocery Basket Analysis Dataset - Demo Orders
 * Source: Kaggle (https://www.kaggle.com/datasets/yasserh/instacart-online-grocery-basket-analysis-dataset)
 * 
 * NOTE: This is strictly DEMO/MOCK order data loaded from the Kaggle dataset schema.
 * It is NOT real Swiggy/Instamart user data.
 */

export const INSTACART_DEMO_DATA_LABEL = "DEMO DATA (Kaggle Instacart Dataset)";

export const INSTACART_DEMO_ORDERS = [
  {
    order_id: "204811",
    order_number: 14,
    order_dow: 2, // Tuesday
    order_hour_of_day: 11,
    days_since_prior_order: 7,
    order_date: new Date().toISOString(), // Today
    total_items: 6,
    items: [
      {
        product_id: 21903,
        product_name: "Organic Baby Spinach 16 oz",
        department: "Vegetables",
        aisle: "packaged produce",
        quantity: 1,
        unit: "g",
        amount_g_ml: 450
      },
      {
        product_id: 13176,
        product_name: "Bag of Organic Bananas 2 lbs",
        department: "Fruits",
        aisle: "fresh fruits",
        quantity: 1,
        unit: "kg",
        amount_g_ml: 1000
      },
      {
        product_id: 27845,
        product_name: "Organic Whole Whole Milk 1 Gallon",
        department: "Dairy",
        aisle: "milk",
        quantity: 1,
        unit: "L",
        amount_g_ml: 1000
      },
      {
        product_id: 47209,
        product_name: "Organic Hass Avocado (Pack of 4)",
        department: "Fruits",
        aisle: "fresh fruits",
        quantity: 4,
        unit: "pieces",
        amount_g_ml: 4
      },
      {
        product_id: 21137,
        product_name: "Organic Strawberries 1 lb",
        department: "Fruits",
        aisle: "fresh fruits",
        quantity: 1,
        unit: "g",
        amount_g_ml: 450
      },
      {
        product_id: 24852,
        product_name: "Artisan Whole Wheat Bread Sliced 20 oz",
        department: "Bakery",
        aisle: "bread",
        quantity: 1,
        unit: "pieces",
        amount_g_ml: 1
      }
    ]
  },
  {
    order_id: "178942",
    order_number: 8,
    order_dow: 5, // Friday
    order_hour_of_day: 15,
    days_since_prior_order: 5,
    order_date: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), // 3 hours ago
    total_items: 5,
    items: [
      {
        product_id: 39275,
        product_name: "Organic Blueberries 6 oz",
        department: "Fruits",
        aisle: "packaged produce",
        quantity: 2,
        unit: "g",
        amount_g_ml: 340
      },
      {
        product_id: 47766,
        product_name: "Organic Yellow Onion 3 lb bag",
        department: "Vegetables",
        aisle: "fresh vegetables",
        quantity: 1,
        unit: "kg",
        amount_g_ml: 1300
      },
      {
        product_id: 22963,
        product_name: "Organic Greek Plain Whole Milk Yogurt 32 oz",
        department: "Dairy",
        aisle: "yogurt",
        quantity: 1,
        unit: "g",
        amount_g_ml: 900
      },
      {
        product_id: 19057,
        product_name: "Organic Large Brown Eggs 12 ct",
        department: "Dairy",
        aisle: "eggs",
        quantity: 1,
        unit: "pieces",
        amount_g_ml: 12
      },
      {
        product_id: 26209,
        product_name: "Limes 1 lb bag",
        department: "Fruits",
        aisle: "fresh fruits",
        quantity: 5,
        unit: "pieces",
        amount_g_ml: 5
      }
    ]
  },
  {
    order_id: "300124",
    order_number: 21,
    order_dow: 0, // Sunday
    order_hour_of_day: 9,
    days_since_prior_order: 10,
    order_date: new Date(Date.now() - 12 * 3600 * 1000).toISOString(), // Earlier today
    total_items: 6,
    items: [
      {
        product_id: 16797,
        product_name: "Organic Small Red Apples 3 lb bag",
        department: "Fruits",
        aisle: "fresh fruits",
        quantity: 1,
        unit: "kg",
        amount_g_ml: 1350
      },
      {
        product_id: 33731,
        product_name: "Grated Parmesan Cheese 8 oz",
        department: "Dairy",
        aisle: "specialty cheeses",
        quantity: 1,
        unit: "g",
        amount_g_ml: 225
      },
      {
        product_id: 43352,
        product_name: "Sparkling Lime Water 12 pk 12 fl oz",
        department: "Beverages",
        aisle: "water seltzer sparkling water",
        quantity: 1,
        unit: "pieces",
        amount_g_ml: 12
      },
      {
        product_id: 28204,
        product_name: "Organic Whole Carrots 2 lb bag",
        department: "Vegetables",
        aisle: "fresh vegetables",
        quantity: 1,
        unit: "kg",
        amount_g_ml: 900
      },
      {
        product_id: 17794,
        product_name: "Carrots & Dip Snack Pack",
        department: "Snacks",
        aisle: "snack foods",
        quantity: 3,
        unit: "pieces",
        amount_g_ml: 3
      },
      {
        product_id: 10246,
        product_name: "Organic Celery Hearts 1 lb",
        department: "Vegetables",
        aisle: "fresh vegetables",
        quantity: 1,
        unit: "g",
        amount_g_ml: 450
      }
    ]
  }
];
