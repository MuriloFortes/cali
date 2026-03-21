import { Router } from "express";
import path from "path";
import { unlinkSync, existsSync } from "fs";
import { db } from "../database.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { uploadProductImage } from "../upload.js";

const router = Router();

function maybeMulter(req, res, next) {
  if (!req.is("multipart/form-data")) return next();
  uploadProductImage(req, res, (err) => {
    if (err) {
      const msg = err.code === "LIMIT_FILE_SIZE" ? "Imagem deve ter no máximo 5MB" : (err.message || "Formato não suportado. Use JPEG, PNG, WebP ou GIF.");
      return res.status(400).json({ error: true, message: msg });
    }
    next();
  });
}

const CATEGORY_EMOJI = { Eletrônicos: "🔌", Roupas: "👕", Casa: "🏠", Esportes: "⚽" };
const GRADIENTS = [
  "from-violet-500 to-indigo-600",
  "from-cyan-500 to-blue-600",
  "from-emerald-400 to-teal-600",
  "from-amber-400 to-orange-500",
  "from-rose-500 to-pink-600",
];

function rowToProduct(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    originalPrice: row.original_price,
    image: row.image,
    gradient: row.gradient,
    category: row.category,
    stock: row.stock,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get("/", (req, res) => {
  const { search, category, minPrice, maxPrice, sortBy, includeInactive } = req.query;
  const conditions = [];
  const params = [];
  if (includeInactive !== "true") {
    conditions.push("active = 1");
  }
  if (search && String(search).trim()) {
    const term = "%" + String(search).trim() + "%";
    conditions.push("(name LIKE ? OR description LIKE ? OR category LIKE ?)");
    params.push(term, term, term);
  }
  if (category && String(category).trim()) {
    conditions.push("category = ?");
    params.push(String(category).trim());
  }
  if (minPrice != null && minPrice !== "") {
    const n = parseFloat(minPrice);
    if (!Number.isNaN(n)) {
      conditions.push("price >= ?");
      params.push(n);
    }
  }
  if (maxPrice != null && maxPrice !== "") {
    const n = parseFloat(maxPrice);
    if (!Number.isNaN(n)) {
      conditions.push("price <= ?");
      params.push(n);
    }
  }
  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  let orderBy = "ORDER BY created_at DESC";
  switch (sortBy) {
    case "price_asc": orderBy = "ORDER BY price ASC"; break;
    case "price_desc": orderBy = "ORDER BY price DESC"; break;
    case "name_asc": orderBy = "ORDER BY name ASC"; break;
    case "name_desc": orderBy = "ORDER BY name DESC"; break;
    case "newest": orderBy = "ORDER BY created_at DESC"; break;
    default: break;
  }
  const sql = `SELECT * FROM products ${where} ${orderBy}`;
  const rows = db.prepare(sql).all(...params);
  const products = rows.map(rowToProduct);
  res.status(200).json({ products, total: products.length });
});

router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!row) {
    return res.status(404).json({ error: true, message: "Produto não encontrado" });
  }
  res.status(200).json({ product: rowToProduct(row) });
});

router.post("/", authenticate, requireAdmin, maybeMulter, (req, res) => {
  const body = req.body ?? {};
  const name = (body.name != null && String(body.name).trim()) ? String(body.name).trim() : null;
  const description = body.description != null ? String(body.description).trim() : "";
  const price = body.price != null ? parseFloat(body.price) : NaN;
  const originalPrice = body.originalPrice != null && body.originalPrice !== "" ? parseFloat(body.originalPrice) : null;
  const category = (body.category != null && String(body.category).trim()) ? String(body.category).trim() : null;
  const stock = body.stock != null ? parseInt(body.stock, 10) : NaN;
  const gradient = body.gradient != null ? body.gradient : null;
  const active = body.active !== undefined && body.active !== false && body.active !== "0" ? 1 : 0;

  if (!name || name.length < 3) {
    return res.status(400).json({ error: true, message: "Nome é obrigatório (mín. 3 caracteres)" });
  }
  if (Number.isNaN(price) || price <= 0) {
    return res.status(400).json({ error: true, message: "Preço é obrigatório e deve ser maior que zero" });
  }
  if (originalPrice != null && !Number.isNaN(originalPrice) && originalPrice <= price) {
    return res.status(400).json({ error: true, message: "Preço original deve ser maior que o preço" });
  }
  if (!category) {
    return res.status(400).json({ error: true, message: "Categoria é obrigatória" });
  }
  if (Number.isNaN(stock) || stock < 0) {
    return res.status(400).json({ error: true, message: "Estoque é obrigatório e deve ser >= 0" });
  }

  const id = "p" + Date.now();
  let img = req.file ? `/uploads/products/${req.file.filename}` : (body.image || CATEGORY_EMOJI[category] || "📦");
  const grad = gradient || GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)];

  db.prepare(`
    INSERT INTO products (id, name, description, price, original_price, image, gradient, category, stock, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, description, price, originalPrice, img, grad, category, stock, active);
  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
  res.status(201).json({ product: rowToProduct(row) });
});

router.put("/:id", authenticate, requireAdmin, maybeMulter, (req, res) => {
  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!row) {
    return res.status(404).json({ error: true, message: "Produto não encontrado" });
  }
  const body = req.body ?? {};
  let name = body.name !== undefined ? String(body.name).trim() : row.name;
  let description = body.description !== undefined ? String(body.description).trim() : row.description;
  let price = body.price !== undefined ? parseFloat(body.price) : row.price;
  let originalPrice = body.originalPrice !== undefined ? (body.originalPrice == null || body.originalPrice === "" ? null : parseFloat(body.originalPrice)) : row.original_price;
  let image = row.image;
  if (req.file) {
    if (row.image && String(row.image).startsWith("/uploads/")) {
      const filePath = path.join(process.cwd(), row.image);
      if (existsSync(filePath)) {
        try { unlinkSync(filePath); } catch (_) {}
      }
    }
    image = `/uploads/products/${req.file.filename}`;
  } else if (body.image !== undefined) {
    image = body.image;
  }
  let gradient = body.gradient !== undefined ? body.gradient : row.gradient;
  let category = body.category !== undefined ? body.category : row.category;
  let stock = body.stock !== undefined ? parseInt(body.stock, 10) : row.stock;
  let active = body.active !== undefined ? (body.active && body.active !== "0" ? 1 : 0) : row.active;
  if (typeof name === "string" && name.length < 3) {
    return res.status(400).json({ error: true, message: "Nome deve ter mín. 3 caracteres" });
  }
  if (Number.isNaN(price) || price <= 0) {
    return res.status(400).json({ error: true, message: "Preço deve ser maior que zero" });
  }
  if (originalPrice != null && !Number.isNaN(originalPrice) && originalPrice <= price) {
    return res.status(400).json({ error: true, message: "Preço original deve ser maior que o preço" });
  }
  if (Number.isNaN(stock) || stock < 0) {
    return res.status(400).json({ error: true, message: "Estoque deve ser >= 0" });
  }
  db.prepare(`
    UPDATE products SET name=?, description=?, price=?, original_price=?, image=?, gradient=?, category=?, stock=?, active=?, updated_at=datetime('now')
    WHERE id=?
  `).run(name, description, price, originalPrice, image, gradient, category, stock, active, req.params.id);
  const updated = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  res.status(200).json({ product: rowToProduct(updated) });
});

router.delete("/:id", authenticate, requireAdmin, (req, res) => {
  const row = db.prepare("SELECT id FROM products WHERE id = ?").get(req.params.id);
  if (!row) {
    return res.status(404).json({ error: true, message: "Produto não encontrado" });
  }
  db.prepare("UPDATE products SET active=0, updated_at=datetime('now') WHERE id=?").run(req.params.id);
  res.status(200).json({ success: true, message: "Produto desativado" });
});

router.delete("/:id/image", authenticate, requireAdmin, (req, res) => {
  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!row) {
    return res.status(404).json({ error: true, message: "Produto não encontrado" });
  }
  if (row.image && String(row.image).startsWith("/uploads/")) {
    const filePath = path.join(process.cwd(), row.image);
    if (existsSync(filePath)) {
      try { unlinkSync(filePath); } catch (_) {}
    }
  }
  const defaultEmoji = CATEGORY_EMOJI[row.category] || "📦";
  db.prepare("UPDATE products SET image=?, updated_at=datetime('now') WHERE id=?").run(defaultEmoji, req.params.id);
  const updated = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  res.status(200).json({ product: rowToProduct(updated) });
});

export default router;
