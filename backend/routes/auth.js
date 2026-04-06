import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../database.js";
import { generateCode, codeExpiresAt } from "../services/sms.js";
import { sendEmailCode } from "../services/email.js";
import { isAdminIpAllowed } from "../utils/ipAllowlist.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "novamart-secret-dev";
const JWT_EXPIRES = "24h";

function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function userToResponse(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    active: row.active === 1,
  };
}

router.post("/login", async (req, res) => {
  const { email, password, channel: preferredChannel } = req.body ?? {};
  const user = db.prepare(
    "SELECT id, name, email, phone, password_hash, role, active FROM users WHERE email = ?"
  ).get(email);
  if (!user) {
    return res.status(401).json({ error: true, message: "E-mail ou senha incorretos" });
  }
  if (user.active !== 1) {
    return res.status(403).json({ error: true, message: "Conta desativada. Entre em contato com o suporte." });
  }
  const match = bcrypt.compareSync(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ error: true, message: "E-mail ou senha incorretos" });
  }

  // Admin: sem 2FA, mas só a partir de IPs permitidos (VPN / lista em ADMIN_ALLOWED_IPS)
  if (user.role === "admin") {
    if (!isAdminIpAllowed(req)) {
      return res.status(403).json({
        error: true,
        message:
          "Acesso de administrador permitido apenas pela rede autorizada (VPN). Verifique ADMIN_ALLOWED_IPS no servidor.",
      });
    }
    const token = generateToken(user.id);
    return res.status(200).json({ user: userToResponse(user), token });
  }

  // Demais usuários: 2FA somente por e-mail
  const code = generateCode();
  const expiresAt = codeExpiresAt(10);

  db.prepare(
    "INSERT INTO sms_codes (user_id, phone, code, expires_at, verified, attempts) VALUES (?, ?, ?, ?, 0, 0)"
  ).run(user.id, user.email, code, expiresAt);

  try {
    await sendEmailCode(user.email, code);
  } catch (err) {
    console.error("Erro ao enviar código 2FA:", err);
    return res.status(500).json({ error: true, message: "Não foi possível enviar o código de verificação" });
  }

  const maskEmail = (e) => {
    if (!e) return "";
    const [userPart, domain] = e.split("@");
    if (!domain) return e;
    if (userPart.length <= 2) return `${userPart[0]}***@${domain}`;
    return `${userPart[0]}***${userPart[userPart.length - 1]}@${domain}`;
  };

  const contact = maskEmail(user.email);

  return res.status(200).json({
    twoFactorRequired: true,
    channel: "email",
    contact,
  });
});

router.post("/register", (req, res) => {
  const { name, email, phone, password } = req.body ?? {};
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
  db.prepare(
    "INSERT INTO users (id, name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, 'customer')"
  ).run(id, name.trim(), email.trim(), (phone || "").trim(), hash);
  const user = db.prepare(
    "SELECT id, name, email, phone, role, active FROM users WHERE id = ?"
  ).get(id);
  const token = generateToken(user.id);
  res.status(201).json({ user: userToResponse(user), token });
});

router.post("/verify-2fa", (req, res) => {
  const { email, code } = req.body ?? {};
  if (!email || !code) {
    return res.status(400).json({ error: true, message: "E-mail e código são obrigatórios" });
  }
  const user = db.prepare(
    "SELECT id, name, email, phone, password_hash, role, active FROM users WHERE email = ?"
  ).get(email);
  if (!user) {
    return res.status(400).json({ error: true, message: "Sessão de verificação inválida" });
  }
  if (user.active !== 1) {
    return res.status(403).json({ error: true, message: "Conta desativada. Entre em contato com o suporte." });
  }

  const entry = db.prepare(
    `SELECT * FROM sms_codes
     WHERE user_id = ? AND verified = 0
     ORDER BY created_at DESC
     LIMIT 1`
  ).get(user.id);

  if (!entry) {
    return res.status(400).json({ error: true, message: "Nenhum código ativo encontrado. Faça login novamente." });
  }

  const nowIso = new Date().toISOString();
  if (entry.expires_at && entry.expires_at <= nowIso) {
    db.prepare("UPDATE sms_codes SET verified = 1 WHERE id = ?").run(entry.id);
    return res.status(400).json({ error: true, message: "Código expirado. Faça login novamente." });
  }

  if (entry.attempts >= 5) {
    db.prepare("UPDATE sms_codes SET verified = 1 WHERE id = ?").run(entry.id);
    return res.status(400).json({ error: true, message: "Número máximo de tentativas excedido. Faça login novamente." });
  }

  if (entry.code !== String(code).trim()) {
    db.prepare("UPDATE sms_codes SET attempts = attempts + 1 WHERE id = ?").run(entry.id);
    const updated = db.prepare("SELECT attempts FROM sms_codes WHERE id = ?").get(entry.id);
    const left = Math.max(0, 5 - (updated?.attempts ?? entry.attempts + 1));
    return res.status(400).json({ error: true, message: `Código incorreto. Restam ${left} tentativas.` });
  }

  db.prepare("UPDATE sms_codes SET verified = 1 WHERE id = ?").run(entry.id);

  const token = generateToken(user.id);
  res.status(200).json({ user: userToResponse(user), token });
});

export default router;
