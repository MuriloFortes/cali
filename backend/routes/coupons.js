import { Router } from "express";
import { db } from "../database.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = Router();

function rowToCoupon(row) {
  return {
    id: row.id,
    code: row.code,
    percent: row.percent,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get("/", authenticate, requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT * FROM coupons ORDER BY created_at DESC").all();
  res.json({ coupons: rows.map(rowToCoupon) });
});

router.post("/", authenticate, requireAdmin, (req, res) => {
  const { code, percent } = req.body ?? {};
  if (!code || typeof code !== "string" || code.trim().length < 3) {
    return res.status(400).json({ error: true, message: "Código do cupom é obrigatório (mín. 3 caracteres)" });
  }
  const pct = parseFloat(percent);
  if (Number.isNaN(pct) || pct <= 0 || pct > 100) {
    return res.status(400).json({ error: true, message: "Percentual deve ser entre 0 e 100" });
  }
  const normalized = code.trim().toUpperCase();
  const exists = db.prepare("SELECT id FROM coupons WHERE UPPER(code) = ?").get(normalized);
  if (exists) return res.status(400).json({ error: true, message: "Já existe um cupom com esse código" });
  const id = "cpn-" + Date.now();
  db.prepare(`
    INSERT INTO coupons (id, code, percent, active)
    VALUES (?, ?, ?, 1)
  `).run(id, normalized, pct);
  const row = db.prepare("SELECT * FROM coupons WHERE id = ?").get(id);
  res.status(201).json({ coupon: rowToCoupon(row) });
});

/** Pré-visualização / validação antes do checkout (uso único por utilizador). */
router.post("/validate", authenticate, (req, res) => {
  const { code, subtotal } = req.body ?? {};
  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: true, message: "Informe o código do cupom" });
  }
  const sub = parseFloat(subtotal);
  if (Number.isNaN(sub) || sub <= 0) {
    return res.status(400).json({ error: true, message: "Subtotal inválido" });
  }
  const normalized = code.trim().toUpperCase();
  const coupon = db.prepare("SELECT * FROM coupons WHERE UPPER(code) = ? AND active = 1").get(normalized);
  if (!coupon) {
    return res.status(400).json({ error: true, message: "Cupom inválido ou inativo" });
  }
  const used = db
    .prepare("SELECT 1 FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ?")
    .get(coupon.id, req.user.id);
  if (used) {
    return res.status(400).json({ error: true, message: "Este cupom já foi utilizado na sua conta" });
  }
  const discountAmount = Math.round(sub * (coupon.percent / 100) * 100) / 100;
  const capped = Math.min(discountAmount, sub);
  res.json({
    ok: true,
    code: coupon.code,
    percent: coupon.percent,
    discountAmount: capped,
  });
});

router.patch("/:id", authenticate, requireAdmin, (req, res) => {
  const row = db.prepare("SELECT * FROM coupons WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: true, message: "Cupom não encontrado" });
  const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : row.active;
  db.prepare("UPDATE coupons SET active = ?, updated_at = datetime('now') WHERE id = ?").run(active, req.params.id);
  const updated = db.prepare("SELECT * FROM coupons WHERE id = ?").get(req.params.id);
  res.json({ coupon: rowToCoupon(updated) });
});

router.delete("/:id", authenticate, requireAdmin, (req, res) => {
  const row = db.prepare("SELECT id FROM coupons WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: true, message: "Cupom não encontrado" });
  db.prepare("DELETE FROM coupons WHERE id = ?").run(req.params.id);
  res.status(204).send();
});

export default router;
