import { Router } from "express";
import { db } from "../database.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = Router();

function rowToCat(row) {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji || "📦",
    sortOrder: row.sort_order,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Lista categorias ativas (loja + filtros). */
router.get("/", (req, res) => {
  const includeInactive = req.query.includeInactive === "true";
  let sql = "SELECT * FROM product_categories WHERE 1=1";
  if (!includeInactive) sql += " AND active = 1";
  sql += " ORDER BY sort_order ASC, name ASC";
  const rows = db.prepare(sql).all();
  res.json({ categories: rows.map(rowToCat) });
});

router.post("/", authenticate, requireAdmin, (req, res) => {
  const { name, emoji, sortOrder } = req.body ?? {};
  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return res.status(400).json({ error: true, message: "Nome da categoria é obrigatório (mín. 2 caracteres)" });
  }
  const nm = name.trim();
  const exists = db.prepare("SELECT id FROM product_categories WHERE LOWER(name) = LOWER(?)").get(nm);
  if (exists) {
    return res.status(400).json({ error: true, message: "Já existe uma categoria com esse nome" });
  }
  const id = "cat-" + Date.now();
  const em = typeof emoji === "string" && emoji.trim() ? emoji.trim().slice(0, 8) : "📦";
  const so = sortOrder != null ? parseInt(sortOrder, 10) || 0 : 0;
  db.prepare(`
    INSERT INTO product_categories (id, name, emoji, sort_order, active)
    VALUES (?, ?, ?, ?, 1)
  `).run(id, nm, em, so);
  const row = db.prepare("SELECT * FROM product_categories WHERE id = ?").get(id);
  res.status(201).json({ category: rowToCat(row) });
});

router.put("/:id", authenticate, requireAdmin, (req, res) => {
  const row = db.prepare("SELECT * FROM product_categories WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: true, message: "Categoria não encontrada" });
  const body = req.body ?? {};
  let name = body.name !== undefined ? String(body.name).trim() : row.name;
  if (name.length < 2) return res.status(400).json({ error: true, message: "Nome inválido" });
  const dup = db.prepare("SELECT id FROM product_categories WHERE LOWER(name) = LOWER(?) AND id != ?").get(name, req.params.id);
  if (dup) return res.status(400).json({ error: true, message: "Já existe outra categoria com esse nome" });
  const emoji = body.emoji !== undefined ? String(body.emoji).trim().slice(0, 8) || row.emoji : row.emoji;
  const sortOrder = body.sortOrder !== undefined ? parseInt(body.sortOrder, 10) || 0 : row.sort_order;
  const active = body.active !== undefined ? (body.active ? 1 : 0) : row.active;
  if (name !== row.name) {
    db.prepare("UPDATE products SET category = ?, updated_at = datetime('now') WHERE category = ?").run(name, row.name);
  }
  db.prepare(`
    UPDATE product_categories SET name = ?, emoji = ?, sort_order = ?, active = ?, updated_at = datetime('now') WHERE id = ?
  `).run(name, emoji, sortOrder, active, req.params.id);
  const updated = db.prepare("SELECT * FROM product_categories WHERE id = ?").get(req.params.id);
  res.json({ category: rowToCat(updated) });
});

router.delete("/:id", authenticate, requireAdmin, (req, res) => {
  const row = db.prepare("SELECT * FROM product_categories WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: true, message: "Categoria não encontrada" });
  const cnt = db.prepare("SELECT COUNT(*) as n FROM products WHERE category = ? COLLATE NOCASE").get(row.name);
  if (cnt.n > 0) {
    return res.status(400).json({
      error: true,
      message: `Existem ${cnt.n} produto(s) nesta categoria. Reatribua ou remova os produtos antes de excluir.`,
    });
  }
  db.prepare("DELETE FROM product_categories WHERE id = ?").run(req.params.id);
  res.status(204).send();
});

export default router;
