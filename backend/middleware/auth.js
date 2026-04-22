import jwt from "jsonwebtoken";
import { db } from "../database.js";
import { JWT_SECRET } from "../utils/jwtAuth.js";

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: true, message: "Token inválido ou expirado" });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.scope === "webauthn_pending") {
      return res.status(401).json({ error: true, message: "Token inválido ou expirado" });
    }
    if (!payload.sid) {
      return res.status(401).json({ error: true, message: "Faça login novamente (sessão antiga)" });
    }
    const user = db.prepare(
      "SELECT id, name, email, phone, role, active, approved, created_at, updated_at, session_token FROM users WHERE id = ?"
    ).get(payload.userId);
    if (!user) {
      return res.status(401).json({ error: true, message: "Token inválido ou expirado" });
    }
    const approved = user.approved !== 0 && user.approved != null;
    if (!approved) {
      return res.status(403).json({
        error: true,
        message: "Cadastro aguardando aprovação do administrador.",
        code: "PENDING_APPROVAL",
      });
    }
    if (user.active !== 1) {
      return res.status(403).json({ error: true, message: "Conta desativada. Entre em contato com o suporte." });
    }
    if (user.session_token !== payload.sid) {
      return res.status(401).json({
        error: true,
        message: "Sessão encerrada: outro dispositivo iniciou sessão com esta conta.",
      });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: true, message: "Token inválido ou expirado" });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: true, message: "Acesso restrito a administradores" });
  }
  next();
}
