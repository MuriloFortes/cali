import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../utils/jwtAuth.js";

export function authenticatePendingWebAuthn(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: true, message: "Token pendente inválido" });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.scope !== "webauthn_pending") {
      return res.status(401).json({ error: true, message: "Token inválido" });
    }
    req.pendingUserId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: true, message: "Token expirado. Faça login novamente." });
  }
}
