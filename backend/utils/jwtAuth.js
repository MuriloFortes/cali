import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { db } from "../database.js";

export const JWT_SECRET = process.env.JWT_SECRET || "novamart-secret-dev";
export const JWT_EXPIRES = "24h";

export function isWebAuthnDisabled() {
  const v = String(process.env.WEBAUTHN_DISABLED ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function generatePendingToken(userId) {
  return jwt.sign({ userId, scope: "webauthn_pending" }, JWT_SECRET, { expiresIn: "15m" });
}

export function generateAccessToken(userId, sessionToken) {
  return jwt.sign({ userId, sid: sessionToken }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

/** Nova sessão = invalida JWTs anteriores (um dispositivo ativo). */
export function rotateSessionToken(userId) {
  const sid = randomUUID();
  db.prepare("UPDATE users SET session_token = ?, updated_at = datetime('now') WHERE id = ?").run(sid, userId);
  return sid;
}

export function userToResponse(row) {
  const approved = row.approved !== 0 && row.approved != null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    active: row.active === 1,
    approved,
  };
}
