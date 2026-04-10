import Database from "better-sqlite3-multiple-ciphers";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, "novamart.db");

/** Aspas simples em chaves PRAGMA key/rekey devem ser duplicadas. */
export function escapeSqliteKeyPhrase(key) {
  return String(key).replace(/'/g, "''");
}

/**
 * Abre o SQLite (criptografado se SQLITE_ENCRYPTION_KEY estiver definida).
 * Banco já existente em texto claro: rode `npm run db:encrypt` uma vez antes de ligar a API com a chave.
 */
function createConnection() {
  const db = new Database(dbPath);
  const encryptionKey = process.env.SQLITE_ENCRYPTION_KEY;

  if (encryptionKey) {
    db.pragma(`key='${escapeSqliteKeyPhrase(encryptionKey)}'`);
  }

  try {
    db.pragma("journal_mode = WAL");
  } catch {
    /* ignore */
  }

  return db;
}

const db = createConnection();

function runSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      email         TEXT UNIQUE NOT NULL,
      phone         TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('admin','customer')),
      active        INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      description    TEXT,
      price          REAL NOT NULL CHECK(price > 0),
      original_price REAL,
      image          TEXT DEFAULT '📦',
      gradient       TEXT DEFAULT 'from-violet-500 to-indigo-600',
      category       TEXT NOT NULL,
      stock          INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
      active         INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL,
      total           REAL NOT NULL,
      discount        REAL DEFAULT 0,
      shipping        REAL DEFAULT 15,
      status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','shipped','delivered','cancelled')),
      payment_method  TEXT NOT NULL,
      address_json    TEXT NOT NULL,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id     TEXT NOT NULL,
      product_id   TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity     INTEGER NOT NULL CHECK(quantity > 0),
      unit_price   REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id           TEXT PRIMARY KEY,
      customer_id  TEXT NOT NULL REFERENCES users(id),
      subject      TEXT DEFAULT '',
      status       TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      sender_id       TEXT NOT NULL REFERENCES users(id),
      content         TEXT NOT NULL,
      read            INTEGER NOT NULL DEFAULT 0 CHECK(read IN (0,1)),
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sms_codes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL REFERENCES users(id),
      phone       TEXT NOT NULL,
      code        TEXT NOT NULL,
      expires_at  TEXT NOT NULL,
      verified    INTEGER NOT NULL DEFAULT 0 CHECK(verified IN (0,1)),
      attempts    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS store_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migrações progressivas para colunas opcionais em users
  const alterStatements = [
    "ALTER TABLE users ADD COLUMN phone_verified INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT NULL",
    "ALTER TABLE users ADD COLUMN default_address TEXT DEFAULT NULL",
    "ALTER TABLE users ADD COLUMN save_address INTEGER DEFAULT 1",
    "ALTER TABLE users ADD COLUMN session_token TEXT DEFAULT NULL",
    "ALTER TABLE users ADD COLUMN webauthn_registered INTEGER DEFAULT 0",
  ];

  for (const sql of alterStatements) {
    try {
      db.exec(sql);
    } catch (err) {
      const msg = String(err?.message || "").toLowerCase();
      if (!msg.includes("duplicate column name")) {
        throw err;
      }
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS webauthn_credentials (
      id             TEXT PRIMARY KEY,
      user_id        TEXT NOT NULL REFERENCES users(id),
      credential_id  TEXT NOT NULL UNIQUE,
      public_key     TEXT NOT NULL,
      counter        INTEGER NOT NULL DEFAULT 0,
      transports     TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user ON webauthn_credentials(user_id);
  `);
}

function runSeed() {
  const count = db.prepare("SELECT COUNT(*) as n FROM users").get();
  // Sempre garante defaults do store_settings (mesmo se o banco já tiver seed de usuários/produtos).
  // Isso evita que novas chaves (ex: site_hero_title e store_logo_image_path) fiquem vazias em bancos antigos.
  const insertIgnoreSetting = db.prepare(`
    INSERT OR IGNORE INTO store_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
  `);

  const settingsDefaults = [
    // PIX
    ["pix_key", ""],
    ["pix_key_type", "cpf"], // cpf | cnpj | email | phone | random
    ["pix_beneficiary_name", "NovaMart"],
    ["pix_city", "Sao Paulo"],
    // Loja (ícone em fotos)
    ["store_logo_icon", "Store"],
    ["store_logo_image_path", ""],
    ["store_name", "NovaMart"],
    // Home/Banners
    ["site_hero_title", "Sua experiência de compra, reinventada"],
    ["site_hero_description", "Explore nossos produtos com qualidade garantida."],
    ["site_footer_text", "© 2025 NovaMart — Todos os direitos reservados"],
    ["site_primary_color", "#8b5cf6"],
    ["site_secondary_color", "#6366f1"],
    ["site_banner_image_path", ""],
    // Background do site (cor + imagem)
    ["site_bg_color_top", "#0a0a14"],
    ["site_bg_color_bottom", "#0f0f1a"],
    ["site_background_image_path", ""],
    ["site_background_image_opacity", "0.35"],
    ["site_btn_primary_from", "#7c3aed"],
    ["site_btn_primary_to", "#6366f1"],
    ["site_btn_secondary", "#7c3aed"],
  ];

  for (const [key, value] of settingsDefaults) {
    insertIgnoreSetting.run(key, value);
  }

  if (count.n > 0) return;

  const users = [
    { id: "u1", name: "Admin Master", email: "admin@loja.com", phone: "(11) 99999-0001", password: "admin123", role: "admin" },
    { id: "u2", name: "Maria Silva", email: "cliente@loja.com", phone: "(11) 98765-4321", password: "123456", role: "customer" },
  ];

  const insUser = db.prepare(`
    INSERT INTO users (id, name, email, phone, password_hash, role, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);
  for (const u of users) {
    const hash = bcrypt.hashSync(u.password, 10);
    insUser.run(u.id, u.name, u.email, u.phone, hash, u.role);
  }

  const products = [
    { id: "p1", name: "Fone Bluetooth Pro", description: "Som cristalino com cancelamento de ruído ativo e 30h de bateria.", price: 349.90, original_price: 449.90, image: "🎧", category: "Eletrônicos", stock: 12, gradient: "from-violet-500 to-indigo-600" },
    { id: "p2", name: "Smartwatch Pulse X", description: "Monitor cardíaco, GPS integrado e tela AMOLED vibrante.", price: 899.00, original_price: 1099.00, image: "⌚", category: "Eletrônicos", stock: 4, gradient: "from-cyan-500 to-blue-600" },
    { id: "p3", name: "Camiseta Urban Fit", description: "Algodão premium com corte moderno e acabamento impecável.", price: 129.90, original_price: null, image: "👕", category: "Roupas", stock: 25, gradient: "from-emerald-400 to-teal-600" },
    { id: "p4", name: "Jaqueta Storm Shield", description: "Impermeável, respirável e perfeita para aventuras urbanas.", price: 459.00, original_price: null, image: "🧥", category: "Roupas", stock: 8, gradient: "from-slate-500 to-zinc-700" },
    { id: "p5", name: "Luminária Orbit LED", description: "Design minimalista com luz ajustável e carregador wireless na base.", price: 289.90, original_price: null, image: "💡", category: "Casa", stock: 15, gradient: "from-amber-400 to-orange-500" },
    { id: "p6", name: "Kit Vasos Cerâmica", description: "Conjunto de 3 vasos artesanais com acabamento matte.", price: 179.90, original_price: null, image: "🪴", category: "Casa", stock: 0, gradient: "from-lime-400 to-green-600" },
    { id: "p7", name: "Tênis Runner Boost", description: "Amortecimento responsivo com solado de alta durabilidade.", price: 599.90, original_price: 749.90, image: "👟", category: "Esportes", stock: 3, gradient: "from-rose-500 to-pink-600" },
    { id: "p8", name: "Bola Futebol Match", description: "Padrão oficial FIFA com termosoldagem e grip superior.", price: 199.90, original_price: null, image: "⚽", category: "Esportes", stock: 20, gradient: "from-yellow-400 to-amber-500" },
    { id: "p9", name: "Teclado Mecânico RGB", description: "Switches tácteis, iluminação por tecla e corpo em alumínio.", price: 749.00, original_price: null, image: "⌨️", category: "Eletrônicos", stock: 6, gradient: "from-purple-500 to-fuchsia-600" },
    { id: "p10", name: "Yoga Mat Premium", description: "Espessura 8mm, antiderrapante, com alça de transporte.", price: 149.90, original_price: null, image: "🧘", category: "Esportes", stock: 18, gradient: "from-teal-400 to-cyan-500" },
  ];

  const insProduct = db.prepare(`
    INSERT INTO products (id, name, description, price, original_price, image, gradient, category, stock, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  for (const p of products) {
    insProduct.run(p.id, p.name, p.description, p.price, p.original_price ?? null, p.image, p.gradient, p.category, p.stock);
  }

  const orders = [
    {
      id: "ORD-001", user_id: "u2", total: 609.70, discount: 0, shipping: 15, status: "delivered",
      payment_method: "pix",
      address_json: JSON.stringify({ street: "Rua das Flores", number: "123", complement: "", neighborhood: "Centro", city: "São Paulo", state: "SP", zip: "01234-567" }),
      items: [
        { product_id: "p1", product_name: "Fone Bluetooth Pro", quantity: 1, unit_price: 349.90 },
        { product_id: "p3", product_name: "Camiseta Urban Fit", quantity: 2, unit_price: 129.90 },
      ],
    },
    {
      id: "ORD-002", user_id: "u2", total: 304.90, discount: 0, shipping: 15, status: "shipped",
      payment_method: "pix",
      address_json: JSON.stringify({ street: "Rua das Flores", number: "123", complement: "", neighborhood: "Centro", city: "São Paulo", state: "SP", zip: "01234-567" }),
      items: [
        { product_id: "p5", product_name: "Luminária Orbit LED", quantity: 1, unit_price: 289.90 },
      ],
    },
    {
      id: "ORD-003", user_id: "u2", total: 749.80, discount: 0, shipping: 0, status: "pending",
      payment_method: "pix",
      address_json: JSON.stringify({ street: "Av. Paulista", number: "1000", complement: "Sala 501", neighborhood: "Bela Vista", city: "São Paulo", state: "SP", zip: "01310-100" }),
      items: [
        { product_id: "p7", product_name: "Tênis Runner Boost", quantity: 1, unit_price: 599.90 },
        { product_id: "p10", product_name: "Yoga Mat Premium", quantity: 1, unit_price: 149.90 },
      ],
    },
  ];

  const insOrder = db.prepare(`
    INSERT INTO orders (id, user_id, total, discount, shipping, status, payment_method, address_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const o of orders) {
    insOrder.run(o.id, o.user_id, o.total, o.discount, o.shipping, o.status, o.payment_method, o.address_json);
    for (const it of o.items) {
      insItem.run(o.id, it.product_id, it.product_name, it.quantity, it.unit_price);
    }
  }

  // Seed de configurações da loja (inclui chave PIX)
  const settingsCount = db.prepare("SELECT COUNT(*) as n FROM store_settings").get();
  const upsertSetting = db.prepare(`
    INSERT INTO store_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  if (settingsCount.n === 0) {
    upsertSetting.run("pix_key", "");
    upsertSetting.run("pix_key_type", "cpf"); // cpf | cnpj | email | phone | random
    upsertSetting.run("pix_beneficiary_name", "NovaMart");
    upsertSetting.run("pix_city", "Sao Paulo");
  }

  // Garante que exista um padrão para o ícone da loja (mesmo em bancos antigos).
  const logoCount = db.prepare("SELECT COUNT(*) as n FROM store_settings WHERE key = 'store_logo_icon'").get();
  if (logoCount.n === 0) {
    upsertSetting.run("store_logo_icon", "Store");
  }

  // Defaults do site (texto/cores/banner) para evitar telas vazias
  const defaults = [
    ["site_hero_description", "Explore nossos produtos com qualidade garantida."],
    ["site_hero_title", "Sua experiência de compra, reinventada"],
    ["site_footer_text", "© 2025 NovaMart — Todos os direitos reservados"],
    ["store_name", "NovaMart"],
    ["site_primary_color", "#8b5cf6"],
    ["site_secondary_color", "#6366f1"],
    ["site_banner_image_path", ""],
    ["store_logo_image_path", ""],
    ["site_bg_color_top", "#0a0a14"],
    ["site_bg_color_bottom", "#0f0f1a"],
    ["site_background_image_path", ""],
    ["site_background_image_opacity", "0.35"],
    ["site_btn_primary_from", "#7c3aed"],
    ["site_btn_primary_to", "#6366f1"],
    ["site_btn_secondary", "#7c3aed"],
  ];
  for (const [key, value] of defaults) {
    const c = db.prepare("SELECT COUNT(*) as n FROM store_settings WHERE key = ?").get(key);
    if (c.n === 0) upsertSetting.run(key, value);
  }
}

export function initDatabase() {
  runSchema();
  runSeed();
}

export function resetDatabase() {
  db.exec(`
    DROP TABLE IF EXISTS webauthn_credentials;
    DROP TABLE IF EXISTS sms_codes;
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS conversations;
    DROP TABLE IF EXISTS order_items;
    DROP TABLE IF EXISTS orders;
    DROP TABLE IF EXISTS products;
    DROP TABLE IF EXISTS store_settings;
    DROP TABLE IF EXISTS users;
  `);
  runSchema();
  runSeed();
  console.log("Database reset and seeded.");
}

export { db };
