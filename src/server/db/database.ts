import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

// Initialize data directory
const DATA_DIR = path.resolve(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, "smart_pantry.db");

let dbInstance: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(DB_PATH);
    dbInstance.exec("PRAGMA journal_mode = WAL;");
    dbInstance.exec("PRAGMA busy_timeout = 5000;");
    dbInstance.exec("PRAGMA foreign_keys = ON;");
    initSchema(dbInstance);
  }
  return dbInstance;
}

export function createInMemoryDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA foreign_keys = ON;");
  initSchema(db);
  return db;
}

export function initSchema(db: DatabaseSync) {
  // 1. Food Items Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS food_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default_user',
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      quantity TEXT NOT NULL,
      purchase_date TEXT NOT NULL,
      printed_expiry_date TEXT,
      estimated_consume_by_date TEXT NOT NULL,
      consume_by_date TEXT NOT NULL,
      is_verified_expiry INTEGER NOT NULL DEFAULT 0,
      freshness_score INTEGER,
      spoilage_status TEXT NOT NULL,
      spoilage_indicators TEXT NOT NULL DEFAULT '[]',
      has_critical_spoilage INTEGER NOT NULL DEFAULT 0,
      requires_confirmation INTEGER NOT NULL DEFAULT 0,
      storage_method TEXT NOT NULL,
      storage_condition TEXT NOT NULL,
      storage_advice TEXT,
      notes TEXT,
      image TEXT,
      allergens TEXT NOT NULL DEFAULT '[]',
      nutrition TEXT NOT NULL DEFAULT '{}',
      scan_metadata TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active',
      consumed_at TEXT,
      discarded_at TEXT,
      reminder_enabled INTEGER NOT NULL DEFAULT 1,
      google_calendar_id TEXT DEFAULT 'primary',
      google_calendar_event_id TEXT,
      google_calendar_soon_event_id TEXT,
      google_calendar_expiry_event_id TEXT,
      google_calendar_sync_status TEXT NOT NULL DEFAULT 'NOT_SYNCED',
      google_calendar_last_synced_at TEXT,
      google_calendar_error TEXT,
      google_calendar_html_link TEXT,
      whatsapp_status TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
      whatsapp_message_id TEXT,
      whatsapp_last_sent_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  migrateNullableFreshnessScore(db);

  // Safe migrations for existing databases
  try { db.exec(`ALTER TABLE food_items ADD COLUMN requires_confirmation INTEGER NOT NULL DEFAULT 0;`); } catch {}
  try { db.exec(`ALTER TABLE food_items ADD COLUMN storage_location TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE alerts ADD COLUMN alert_type TEXT;`); } catch {}

  // 2. Alert Records Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      food_id TEXT NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'default_user',
      rule_type TEXT NOT NULL,
      alert_type TEXT,
      trigger_date TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      action_url TEXT,
      created_at TEXT NOT NULL,
      processed_at TEXT,
      cancelled_at TEXT,
      FOREIGN KEY (food_id) REFERENCES food_items(id) ON DELETE CASCADE
    );
  `);

  // Index for quick querying of due alerts
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_alerts_user_status_trigger 
    ON alerts(user_id, status, trigger_date);
  `);

  // 3. In-App Notifications Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default_user',
      alert_id TEXT,
      food_id TEXT,
      category TEXT NOT NULL DEFAULT 'Expiry',
      priority TEXT NOT NULL DEFAULT 'MEDIUM',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      action_url TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      dismissed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      read_at TEXT,
      dismissed_at TEXT
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_notifications_user_read 
    ON notifications(user_id, read, dismissed);
  `);

  // 4. Notification Deliveries Audit & Retry Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_deliveries (
      id TEXT PRIMARY KEY,
      alert_id TEXT NOT NULL,
      food_id TEXT NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'default_user',
      channel TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      next_retry_at TEXT,
      last_attempt_at TEXT,
      error_message TEXT,
      provider_message_id TEXT,
      created_at TEXT NOT NULL,
      sent_at TEXT,
      FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_deliveries_alert_channel 
    ON notification_deliveries(alert_id, channel);
  `);

  // 5. User Preferences Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
      channel_in_app INTEGER NOT NULL DEFAULT 1,
      channel_google_calendar INTEGER NOT NULL DEFAULT 1,
      channel_whatsapp INTEGER NOT NULL DEFAULT 1,
      remind_3_days_before INTEGER NOT NULL DEFAULT 1,
      remind_1_day_before INTEGER NOT NULL DEFAULT 1,
      remind_on_due_date INTEGER NOT NULL DEFAULT 1,
      remind_overdue INTEGER NOT NULL DEFAULT 1,
      reminder_time_of_day TEXT NOT NULL DEFAULT '09:00',
      whatsapp_phone TEXT,
      updated_at TEXT NOT NULL
    );
  `);

  seedInitialData(db);
}

function migrateNullableFreshnessScore(db: DatabaseSync) {
  const column = db.prepare("PRAGMA table_info(food_items)").all().find((item: any) => item.name === "freshness_score") as any;
  if (!column || column.notnull !== 1) return;

  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'food_items'").get() as any;
  if (!table?.sql) return;

  const columns = db.prepare("PRAGMA table_info(food_items)").all().map((item: any) => item.name).join(", ");
  const replacementSql = String(table.sql).replace(/CREATE TABLE\s+food_items/i, "CREATE TABLE food_items_new").replace(/freshness_score\s+INTEGER\s+NOT\s+NULL/i, "freshness_score INTEGER");

  db.exec("PRAGMA foreign_keys = OFF; BEGIN;");
  try {
    db.exec(replacementSql);
    db.exec(`INSERT INTO food_items_new (${columns}) SELECT ${columns} FROM food_items`);
    db.exec("DROP TABLE food_items; ALTER TABLE food_items_new RENAME TO food_items; COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK; PRAGMA foreign_keys = ON;");
    throw error;
  }
  db.exec("PRAGMA foreign_keys = ON;");
}

function seedInitialData(db: DatabaseSync) {
  const countRow: any = db.prepare("SELECT count(*) as c FROM food_items").get();
  if (countRow && countRow.c > 0) return;

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  const getIsoDate = (offsetDays: number) => {
    const d = new Date(now.getTime() + offsetDays * 864e5);
    return d.toISOString().split("T")[0];
  };

  const seedItems = [
    {
      id: "seed_spinach_01",
      name: "Fresh Organic Spinach (Palak)",
      category: "Vegetables",
      quantity: "250 g",
      purchase_date: getIsoDate(-3),
      printed_expiry_date: null,
      estimated_consume_by_date: todayStr, // Expires today
      consume_by_date: todayStr,
      is_verified_expiry: 0,
      freshness_score: 60,
      spoilage_status: "USE_SOON",
      spoilage_indicators: JSON.stringify(["minor_wilting"]),
      has_critical_spoilage: 0,
      storage_method: "Refrigerator",
      storage_condition: "fridge",
      storage_advice: "Store loosely wrapped in paper towels in crisper drawer.",
      notes: "Leafy green, highly perishable.",
      allergens: JSON.stringify([]),
      nutrition: JSON.stringify({ calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2, nutrients: ["Iron", "Vitamin K", "Folate"] }),
      scan_metadata: JSON.stringify({ scanMethod: "photo", confidence: 95, isUncertain: false, requiresConfirmation: false }),
      google_calendar_sync_status: "NOT_SYNCED",
      whatsapp_status: "NOT_CONFIGURED"
    },
    {
      id: "seed_milk_02",
      name: "Amul Taaza Toned Milk",
      category: "Dairy",
      quantity: "500 mL",
      purchase_date: getIsoDate(-2),
      printed_expiry_date: getIsoDate(2),
      estimated_consume_by_date: getIsoDate(2), // 2 days left
      consume_by_date: getIsoDate(2),
      is_verified_expiry: 1, // Printed date verified via label
      freshness_score: 75,
      spoilage_status: "GOOD",
      spoilage_indicators: JSON.stringify([]),
      has_critical_spoilage: 0,
      storage_method: "Refrigerator",
      storage_condition: "fridge",
      storage_advice: "Keep at 4°C in main refrigerator compartment, not door.",
      notes: "Label verified printed expiry.",
      allergens: JSON.stringify(["Milk"]),
      nutrition: JSON.stringify({ calories: 58, protein: 3.1, carbs: 4.8, fat: 3, fiber: 0, nutrients: ["Calcium", "Vitamin B12"] }),
      scan_metadata: JSON.stringify({ scanMethod: "label", confidence: 98, isUncertain: false, requiresConfirmation: false }),
      google_calendar_sync_status: "NOT_SYNCED",
      whatsapp_status: "NOT_CONFIGURED"
    },
    {
      id: "seed_bananas_03",
      name: "Ripe Bananas",
      category: "Fruits",
      quantity: "5 pcs",
      purchase_date: getIsoDate(-3),
      printed_expiry_date: null,
      estimated_consume_by_date: getIsoDate(1), // 1 day left
      consume_by_date: getIsoDate(1),
      is_verified_expiry: 0,
      freshness_score: 66,
      spoilage_status: "USE_SOON",
      spoilage_indicators: JSON.stringify(["sugar_spotting"]),
      has_critical_spoilage: 0,
      storage_method: "Counter",
      storage_condition: "ambient",
      storage_advice: "Keep at room temperature away from direct sunlight.",
      notes: "Fully ripe with sugar spots.",
      allergens: JSON.stringify([]),
      nutrition: JSON.stringify({ calories: 89, protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6, nutrients: ["Potassium", "Vitamin B6"] }),
      scan_metadata: JSON.stringify({ scanMethod: "photo", confidence: 92, isUncertain: false, requiresConfirmation: false }),
      google_calendar_sync_status: "NOT_SYNCED",
      whatsapp_status: "NOT_CONFIGURED"
    },
    {
      id: "seed_bread_04",
      name: "Whole Wheat Bread",
      category: "Packaged Food",
      quantity: "1 loaf",
      purchase_date: getIsoDate(-6),
      printed_expiry_date: getIsoDate(-1), // Expired yesterday
      estimated_consume_by_date: getIsoDate(-1),
      consume_by_date: getIsoDate(-1),
      is_verified_expiry: 1,
      freshness_score: 18,
      spoilage_status: "SPOILED",
      spoilage_indicators: JSON.stringify(["green_fuzzy_mold", "musty_odor"]),
      has_critical_spoilage: 1,
      storage_method: "Counter",
      storage_condition: "ambient",
      storage_advice: "Keep sealed in cool, dry breadbox.",
      notes: "Severe fuzzy mold detected.",
      allergens: JSON.stringify(["Gluten"]),
      nutrition: JSON.stringify({ calories: 247, protein: 13, carbs: 41, fat: 3.4, fiber: 7, nutrients: ["Fiber", "Iron"] }),
      scan_metadata: JSON.stringify({ scanMethod: "photo", confidence: 96, isUncertain: false, requiresConfirmation: false }),
      google_calendar_sync_status: "NOT_SYNCED",
      whatsapp_status: "NOT_CONFIGURED"
    },
    {
      id: "seed_tomatoes_05",
      name: "Fresh Hybrid Tomatoes",
      category: "Vegetables",
      quantity: "6 pcs",
      purchase_date: getIsoDate(-1),
      printed_expiry_date: null,
      estimated_consume_by_date: getIsoDate(3), // 3 days left
      consume_by_date: getIsoDate(3),
      is_verified_expiry: 0,
      freshness_score: 92,
      spoilage_status: "FRESH",
      spoilage_indicators: JSON.stringify([]),
      has_critical_spoilage: 0,
      storage_method: "Counter",
      storage_condition: "ambient",
      storage_advice: "Store stem-side down at room temperature.",
      notes: "Firm, glossy red produce.",
      allergens: JSON.stringify([]),
      nutrition: JSON.stringify({ calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2, nutrients: ["Vitamin C", "Lycopene"] }),
      scan_metadata: JSON.stringify({ scanMethod: "photo", confidence: 98, isUncertain: false, requiresConfirmation: false }),
      google_calendar_sync_status: "NOT_SYNCED",
      whatsapp_status: "NOT_CONFIGURED"
    }
  ];

  const insertFoodStmt = db.prepare(`
    INSERT INTO food_items (
      id, user_id, name, category, quantity, purchase_date,
      printed_expiry_date, estimated_consume_by_date, consume_by_date,
      is_verified_expiry, freshness_score, spoilage_status,
      spoilage_indicators, has_critical_spoilage, storage_method,
      storage_condition, storage_advice, notes, allergens,
      nutrition, scan_metadata, status, reminder_enabled,
      google_calendar_sync_status, whatsapp_status, created_at, updated_at
    ) VALUES (
      ?, 'default_user', ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, 'active', 1,
      ?, ?, ?, ?
    )
  `);

  const insertAlertStmt = db.prepare(`
    INSERT INTO alerts (
      id, food_id, user_id, rule_type, trigger_date,
      priority, status, title, message, action_url, created_at
    ) VALUES (?, ?, 'default_user', ?, ?, ?, 'PENDING', ?, ?, ?, ?)
  `);

  for (const item of seedItems) {
    insertFoodStmt.run(
      item.id, item.name, item.category, item.quantity, item.purchase_date,
      item.printed_expiry_date, item.estimated_consume_by_date, item.consume_by_date,
      item.is_verified_expiry, item.freshness_score, item.spoilage_status,
      item.spoilage_indicators, item.has_critical_spoilage, item.storage_method,
      item.storage_condition, item.storage_advice, item.notes, item.allergens,
      item.nutrition, item.scan_metadata, item.google_calendar_sync_status,
      item.whatsapp_status, now.toISOString(), now.toISOString()
    );

    // Generate alerts for each item
    if (item.has_critical_spoilage) {
      insertAlertStmt.run(
        `alert_${item.id}_CRITICAL_SPOILAGE`,
        item.id,
        "CRITICAL_SPOILAGE",
        todayStr,
        "CRITICAL",
        `🚨 CRITICAL SAFETY ALERT: ${item.name} is Spoiled!`,
        `Severe mold and decay detected on ${item.name}. Do NOT consume; discard immediately.`,
        `/app/pantry/${item.id}`,
        now.toISOString()
      );
    } else {
      // 1 day before alert
      insertAlertStmt.run(
        `alert_${item.id}_1_DAY_BEFORE`,
        item.id,
        "1_DAY_BEFORE",
        getIsoDate(item.id === "seed_spinach_01" ? -1 : item.id === "seed_bananas_03" ? 0 : 1),
        "HIGH",
        `🟠 Expiring Tomorrow: ${item.name}`,
        `Heads up! ${item.name} is reaching its consume-by date.`,
        `/app/pantry/${item.id}`,
        now.toISOString()
      );
      // On due date alert
      insertAlertStmt.run(
        `alert_${item.id}_ON_DUE_DATE`,
        item.id,
        "ON_DUE_DATE",
        item.consume_by_date,
        "HIGH",
        `🔴 Consume Today: ${item.name}`,
        `${item.name} reaches its consume-by date today (${item.consume_by_date}).`,
        `/app/pantry/${item.id}`,
        now.toISOString()
      );
    }
  }
}

