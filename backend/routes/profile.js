import { Router } from "express";
import path from "path";
import fs from "fs";
import { db } from "../database.js";
import { authenticate } from "../middleware/auth.js";
import { uploadAvatar } from "../upload.js";
import { sendSmsCode, generateCode, codeExpiresAt } from "../services/sms.js";

const router = Router();

function userToProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    active: row.active === 1,
    phone_verified: row.phone_verified === 1,
    avatar: row.avatar || null,
    default_address: row.default_address || null,
    save_address: row.save_address == null ? 1 : row.save_address,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

router.get("/me", authenticate, (req, res) => {
  const row = db.prepare(
    "SELECT id, name, email, phone, role, active, created_at, updated_at, phone_verified, avatar, default_address, save_address FROM users WHERE id = ?"
  ).get(req.user.id);
  res.json({ user: userToProfile(row) });
});

router.put("/me", authenticate, (req, res) => {
  const { name, save_address, default_address } = req.body ?? {};
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!user) return res.status(404).json({ message: "Usuário não encontrado" });

  const newName = typeof name === "string" && name.trim().length >= 2 ? name.trim() : user.name;
  let saveAddr = save_address != null ? (save_address ? 1 : 0) : (user.save_address ?? 1);
  let addr = default_address ?? user.default_address;
  if (!saveAddr) {
    addr = null;
  } else if (addr && typeof addr !== "string") {
    addr = JSON.stringify(addr);
  }

  db.prepare(
    "UPDATE users SET name = ?, save_address = ?, default_address = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(newName, saveAddr, addr, req.user.id);

  const updated = db.prepare(
    "SELECT id, name, email, phone, role, active, created_at, updated_at, phone_verified, avatar, default_address, save_address FROM users WHERE id = ?"
  ).get(req.user.id);
  res.json({ user: userToProfile(updated) });
});

router.post("/avatar", authenticate, (req, res, next) => {
  uploadAvatar(req, res, (err) => {
    if (err) return next(err);
    if (!req.file) return res.status(400).json({ message: "Nenhum arquivo enviado" });

    const user = db.prepare("SELECT avatar FROM users WHERE id = ?").get(req.user.id);
    if (user?.avatar && user.avatar.startsWith("/uploads/avatars/")) {
      const oldPath = path.join(process.cwd(), user.avatar.replace(/^\//, ""));
      fs.promises.unlink(oldPath).catch(() => {});
    }

    const relativePath = `/uploads/avatars/${req.file.filename}`;
    db.prepare("UPDATE users SET avatar = ?, updated_at = datetime('now') WHERE id = ?").run(relativePath, req.user.id);

    res.status(200).json({ avatar: relativePath });
  });
});

router.delete("/avatar", authenticate, (req, res) => {
  const user = db.prepare("SELECT avatar FROM users WHERE id = ?").get(req.user.id);
  if (user?.avatar && user.avatar.startsWith("/uploads/avatars/")) {
    const filePath = path.join(process.cwd(), user.avatar.replace(/^\//, ""));
    fs.promises.unlink(filePath).catch(() => {});
  }
  db.prepare("UPDATE users SET avatar = NULL, updated_at = datetime('now') WHERE id = ?").run(req.user.id);
  res.json({ avatar: null });
});

router.post("/phone/send-code", authenticate, async (req, res, next) => {
  try {
    const phone = String(req.body?.phone ?? "").trim();
    const digits = phone.replace(/\D/g, "");
    if (!digits || digits.length < 10) {
      return res.status(400).json({ message: "Telefone inválido (mín. 10 dígitos)" });
    }

    const existing = db.prepare("SELECT id FROM users WHERE phone = ? AND id != ?").get(phone, req.user.id);
    if (existing) {
      return res.status(409).json({ message: "Este telefone já está em uso por outro usuário." });
    }

    db.prepare("UPDATE sms_codes SET verified = 1 WHERE user_id = ? AND verified = 0").run(req.user.id);

    const code = generateCode();
    const expiresAt = codeExpiresAt(10);

    db.prepare(
      "INSERT INTO sms_codes (user_id, phone, code, expires_at, verified, attempts) VALUES (?, ?, ?, ?, 0, 0)"
    ).run(req.user.id, phone, code, expiresAt);

    await sendSmsCode(phone, code);
    res.status(200).json({ success: true, expiresIn: 600 });
  } catch (err) {
    next(err);
  }
});

router.post("/phone/verify", authenticate, (req, res) => {
  const phone = String(req.body?.phone ?? "").trim();
  const code = String(req.body?.code ?? "").trim();
  if (!phone || !code) {
    return res.status(400).json({ message: "Telefone e código são obrigatórios" });
  }

  const entry = db.prepare(
    `SELECT * FROM sms_codes
     WHERE user_id = ? AND phone = ? AND verified = 0
     ORDER BY created_at DESC LIMIT 1`
  ).get(req.user.id, phone);

  if (!entry) {
    return res.status(400).json({ message: "Nenhum código ativo encontrado para este telefone" });
  }

  const nowIso = new Date().toISOString();
  if (entry.expires_at && entry.expires_at <= nowIso) {
    db.prepare("UPDATE sms_codes SET verified = 1 WHERE id = ?").run(entry.id);
    return res.status(400).json({ message: "Código expirado. Solicite um novo." });
  }

  if (entry.attempts >= 5) {
    db.prepare("UPDATE sms_codes SET verified = 1 WHERE id = ?").run(entry.id);
    return res.status(400).json({ message: "Número máximo de tentativas excedido. Solicite um novo código." });
  }

  if (entry.code !== code) {
    db.prepare("UPDATE sms_codes SET attempts = attempts + 1 WHERE id = ?").run(entry.id);
    const updated = db.prepare("SELECT attempts FROM sms_codes WHERE id = ?").get(entry.id);
    const left = Math.max(0, 5 - (updated?.attempts ?? entry.attempts + 1));
    return res.status(400).json({ message: `Código incorreto. Restam ${left} tentativas.` });
  }

  db.prepare("UPDATE sms_codes SET verified = 1 WHERE id = ?").run(entry.id);
  db.prepare(
    "UPDATE users SET phone = ?, phone_verified = 1, updated_at = datetime('now') WHERE id = ?"
  ).run(phone, req.user.id);

  const updated = db.prepare(
    "SELECT id, name, email, phone, role, active, created_at, updated_at, phone_verified, avatar, default_address, save_address FROM users WHERE id = ?"
  ).get(req.user.id);

  res.status(200).json({ success: true, user: userToProfile(updated) });
});

router.get("/phone/status", authenticate, (req, res) => {
  const row = db.prepare(
    "SELECT phone, phone_verified FROM users WHERE id = ?"
  ).get(req.user.id);
  res.json({ phone: row?.phone ?? null, verified: row?.phone_verified === 1 });
});

export default router;

