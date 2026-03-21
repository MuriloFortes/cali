import { Router } from "express";
import { db } from "../database.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import bcrypt from "bcryptjs";

const router = Router();

function userToResponse(row) {
  if (!row) return null;
  const u = {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.order_count !== undefined) u.orderCount = row.order_count;
  return u;
}

router.get("/", authenticate, requireAdmin, (req, res) => {
  const { search, role, active } = req.query;
  let sql = `
    SELECT u.id, u.name, u.email, u.phone, u.role, u.active, u.created_at, u.updated_at,
           COUNT(o.id) as order_count
    FROM users u
    LEFT JOIN orders o ON o.user_id = u.id
    WHERE 1=1
  `;
  const params = [];
  if (search && String(search).trim()) {
    const term = "%" + String(search).trim() + "%";
    sql += " AND (u.name LIKE ? OR u.email LIKE ?)";
    params.push(term, term);
  }
  if (role && String(role).trim()) {
    sql += " AND u.role = ?";
    params.push(String(role).trim());
  }
  if (active !== undefined && active !== "") {
    if (active === "true" || active === "1") {
      sql += " AND u.active = 1";
    } else if (active === "false" || active === "0") {
      sql += " AND u.active = 0";
    }
  }
  sql += " GROUP BY u.id ORDER BY u.created_at DESC";
  const rows = db.prepare(sql).all(...params);
  res.status(200).json({ users: rows.map(userToResponse) });
});

router.post("/", authenticate, requireAdmin, (req, res) => {
  const { name, email, phone, password, role } = req.body ?? {};
  const errors = [];
  if (!name || typeof name !== "string" || name.trim().length < 2) {
    errors.push("Nome é obrigatório (mín. 2 caracteres)");
  }
  if (!email || typeof email !== "string") {
    errors.push("E-mail é obrigatório");
  } else if (!/\S+@\S+\.\S+/.test(email)) {
    errors.push("E-mail inválido");
  }
  const phoneDigits = (phone != null ? String(phone) : "").replace(/\D/g, "");
  if (!phone || phoneDigits.length < 10) {
    errors.push("Telefone é obrigatório (mín. 10 dígitos)");
  }
  if (!password || typeof password !== "string" || password.length < 6) {
    errors.push("Senha é obrigatória (mín. 6 caracteres)");
  }
  if (errors.length) {
    return res.status(400).json({ error: true, message: errors[0] });
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.trim());
  if (existing) {
    return res.status(400).json({ error: true, message: "E-mail já cadastrado" });
  }

  const id = "u" + Date.now();
  const hash = bcrypt.hashSync(password, 10);
  const userRole = role === "admin" ? "admin" : "customer";

  db.prepare(
    "INSERT INTO users (id, name, email, phone, password_hash, role, active) VALUES (?, ?, ?, ?, ?, ?, 1)"
  ).run(id, name.trim(), email.trim(), String(phone).trim(), hash, userRole);

  const row = db.prepare(
    "SELECT id, name, email, phone, role, active, created_at, updated_at FROM users WHERE id = ?"
  ).get(id);

  res.status(201).json({ user: userToResponse(row) });
});

router.get("/:id", authenticate, (req, res) => {
  const isAdmin = req.user.role === "admin";
  const isSelf = req.user.id === req.params.id;
  if (!isAdmin && !isSelf) {
    return res.status(403).json({ error: true, message: "Acesso negado" });
  }
  const user = db.prepare(
    "SELECT id, name, email, phone, role, active, created_at, updated_at FROM users WHERE id = ?"
  ).get(req.params.id);
  if (!user) {
    return res.status(404).json({ error: true, message: "Usuário não encontrado" });
  }
  const orders = db.prepare(
    "SELECT id, total, status, payment_method, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC"
  ).all(req.params.id);
  res.status(200).json({ user: userToResponse(user), orders });
});

router.put("/:id", authenticate, requireAdmin, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) {
    return res.status(404).json({ error: true, message: "Usuário não encontrado" });
  }
  const body = req.body ?? {};
  const name = body.name !== undefined ? body.name : user.name;
  const phone = body.phone !== undefined ? String(body.phone) : user.phone;
  let role = body.role !== undefined ? body.role : user.role;
  let active = body.active !== undefined ? (body.active ? 1 : 0) : user.active;
  if (body.phone !== undefined) {
    const phoneDigits = String(phone).replace(/\D/g, "");
    if (phoneDigits.length < 10) {
      return res.status(400).json({ error: true, message: "Telefone deve ter mín. 10 dígitos" });
    }
  }
  if (req.user.id === req.params.id && active === 0) {
    return res.status(400).json({ error: true, message: "Não é possível desativar sua própria conta" });
  }
  if (user.role === "admin" && active === 0) {
    const adminCount = db.prepare("SELECT COUNT(*) as n FROM users WHERE role='admin' AND active=1").get();
    if (adminCount.n <= 1) {
      return res.status(400).json({ error: true, message: "Deve haver pelo menos 1 administrador ativo" });
    }
  }
  if (body.role !== undefined && user.role === "admin" && role !== "admin") {
    const adminCount = db.prepare("SELECT COUNT(*) as n FROM users WHERE role='admin' AND active=1").get();
    if (adminCount.n <= 1) {
      return res.status(400).json({ error: true, message: "Deve haver pelo menos 1 administrador ativo" });
    }
  }
  if (role !== "admin" && role !== "customer") role = user.role;
  db.prepare(`
    UPDATE users SET name=?, phone=?, role=?, active=?, updated_at=datetime('now') WHERE id=?
  `).run(name, phone, role, active, req.params.id);
  const updated = db.prepare(
    "SELECT id, name, email, phone, role, active, created_at, updated_at FROM users WHERE id = ?"
  ).get(req.params.id);
  res.status(200).json({ user: userToResponse(updated) });
});

router.patch("/:id/toggle-active", authenticate, requireAdmin, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) {
    return res.status(404).json({ error: true, message: "Usuário não encontrado" });
  }
  const newActive = user.active === 1 ? 0 : 1;
  if (req.user.id === req.params.id && newActive === 0) {
    return res.status(400).json({ error: true, message: "Não é possível desativar sua própria conta" });
  }
  if (user.role === "admin" && newActive === 0) {
    const adminCount = db.prepare("SELECT COUNT(*) as n FROM users WHERE role='admin' AND active=1").get();
    if (adminCount.n <= 1) {
      return res.status(400).json({ error: true, message: "Deve haver pelo menos 1 administrador ativo" });
    }
  }
  db.prepare("UPDATE users SET active=?, updated_at=datetime('now') WHERE id=?").run(newActive, req.params.id);
  const updated = db.prepare(
    "SELECT id, name, email, phone, role, active, created_at, updated_at FROM users WHERE id = ?"
  ).get(req.params.id);
  res.status(200).json({ user: userToResponse(updated) });
});

export default router;
