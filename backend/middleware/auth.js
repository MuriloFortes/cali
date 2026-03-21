import jwt from "jsonwebtoken";
import { db } from "../database.js";

const JWT_SECRET = process.env.JWT_SECRET || "novamart-secret-dev";

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: true, message: "Token inválido ou expirado" });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare(
      "SELECT id, name, email, phone, role, active, created_at, updated_at FROM users WHERE id = ?"
    ).get(payload.userId);
    if (!user) {
      return res.status(401).json({ error: true, message: "Token inválido ou expirado" });
    }
    if (user.active !== 1) {
      return res.status(403).json({ error: true, message: "Conta desativada" });
    }
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: true, message: "Token inválido ou expirado" });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: true, message: "Acesso restrito a administradores" });
  }
  next();
}
