import express from "express";
import { db } from "../database.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

function getNextConversationId() {
  const row = db.prepare("SELECT id FROM conversations ORDER BY created_at DESC LIMIT 1").get();
  if (!row?.id) return "CONV-001";
  const num = parseInt(String(row.id).replace("CONV-", ""), 10) || 0;
  const next = (num + 1).toString().padStart(3, "0");
  return `CONV-${next}`;
}

function canAccessConversation(conversation, user) {
  if (!conversation || !user) return false;
  if (user.role === "admin") return true;
  return conversation.customer_id === user.id;
}

router.post("/conversations", authenticate, (req, res, next) => {
  try {
    const user = req.user;
    if (user.role !== "customer") {
      return res.status(403).json({ message: "Apenas clientes podem criar conversas" });
    }
    const { subject, content } = req.body || {};
    if (!subject || !content) {
      return res.status(400).json({ message: "Assunto e mensagem são obrigatórios" });
    }
    const id = getNextConversationId();
    const now = new Date().toISOString();
    const insertConv = db.prepare(`
      INSERT INTO conversations (id, customer_id, subject, status, created_at, updated_at)
      VALUES (?, ?, ?, 'open', ?, ?)
    `);
    insertConv.run(id, user.id, subject, now, now);

    const insertMsg = db.prepare(`
      INSERT INTO messages (conversation_id, sender_id, content, read, created_at)
      VALUES (?, ?, ?, 0, ?)
    `);
    insertMsg.run(id, user.id, content, now);

    const conversation = db.prepare(`
      SELECT c.*, u.name as customer_name
      FROM conversations c
      JOIN users u ON u.id = c.customer_id
      WHERE c.id = ?
    `).get(id);

    res.status(201).json({ conversation });
  } catch (err) {
    next(err);
  }
});

router.get("/conversations", authenticate, (req, res, next) => {
  try {
    const user = req.user;
    const isAdmin = user.role === "admin";
    const baseSql = `
      SELECT
        c.*,
        u.name as customer_name,
        (
          SELECT content
          FROM messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) as last_message,
        (
          SELECT created_at
          FROM messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) as last_message_at,
        (
          SELECT COUNT(*)
          FROM messages m
          WHERE m.conversation_id = c.id
            AND m.read = 0
            AND m.sender_id != ?
        ) as unread_count
      FROM conversations c
      JOIN users u ON u.id = c.customer_id
    `;
    let rows;
    if (isAdmin) {
      rows = db.prepare(`${baseSql} ORDER BY c.updated_at DESC`).all(user.id);
    } else {
      rows = db.prepare(`${baseSql} WHERE c.customer_id = ? ORDER BY c.updated_at DESC`).all(user.id, user.id);
    }
    res.json({ conversations: rows || [] });
  } catch (err) {
    next(err);
  }
});

router.get("/conversations/:id", authenticate, (req, res, next) => {
  try {
    const user = req.user;
    const id = req.params.id;
    const conversation = db.prepare(`
      SELECT c.*, u.name as customer_name
      FROM conversations c
      JOIN users u ON u.id = c.customer_id
      WHERE c.id = ?
    `).get(id);
    if (!canAccessConversation(conversation, user)) {
      return res.status(404).json({ message: "Conversa não encontrada" });
    }
    const messages = db.prepare(`
      SELECT m.*, us.name as sender_name, us.role as sender_role
      FROM messages m
      JOIN users us ON us.id = m.sender_id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at ASC, m.id ASC
    `).all(id);
    res.json({ conversation, messages });
  } catch (err) {
    next(err);
  }
});

router.post("/conversations/:id/messages", authenticate, (req, res, next) => {
  try {
    const user = req.user;
    const id = req.params.id;
    const { content } = req.body || {};
    if (!content || !content.trim()) {
      return res.status(400).json({ message: "Mensagem obrigatória" });
    }
    const conversation = db.prepare("SELECT * FROM conversations WHERE id = ?").get(id);
    if (!canAccessConversation(conversation, user)) {
      return res.status(404).json({ message: "Conversa não encontrada" });
    }
    if (conversation.status === "closed") {
      return res.status(400).json({ message: "Conversa encerrada" });
    }
    const now = new Date().toISOString();
    const insertMsg = db.prepare(`
      INSERT INTO messages (conversation_id, sender_id, content, read, created_at)
      VALUES (?, ?, ?, 0, ?)
    `);
    const info = insertMsg.run(id, user.id, content, now);
    db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(now, id);
    const message = db.prepare(`
      SELECT m.*, u.name as sender_name, u.role as sender_role
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.id = ?
    `).get(info.lastInsertRowid);
    res.status(201).json({ message });
  } catch (err) {
    next(err);
  }
});

router.patch("/conversations/:id/close", authenticate, requireAdmin, (req, res, next) => {
  try {
    const id = req.params.id;
    const conv = db.prepare("SELECT * FROM conversations WHERE id = ?").get(id);
    if (!conv) {
      return res.status(404).json({ message: "Conversa não encontrada" });
    }
    const now = new Date().toISOString();
    db.prepare("UPDATE conversations SET status = 'closed', updated_at = ? WHERE id = ?").run(now, id);
    const updated = db.prepare("SELECT * FROM conversations WHERE id = ?").get(id);
    res.json({ conversation: updated });
  } catch (err) {
    next(err);
  }
});

router.patch("/conversations/:id/read", authenticate, (req, res, next) => {
  try {
    const user = req.user;
    const id = req.params.id;
    const conv = db.prepare("SELECT * FROM conversations WHERE id = ?").get(id);
    if (!canAccessConversation(conv, user)) {
      return res.status(404).json({ message: "Conversa não encontrada" });
    }
    db.prepare(`
      UPDATE messages
      SET read = 1
      WHERE conversation_id = ?
        AND sender_id != ?
        AND read = 0
    `).run(id, user.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get("/unread-count", authenticate, (req, res, next) => {
  try {
    const user = req.user;
    const countRow = db.prepare(`
      SELECT COUNT(*) as total
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.read = 0
        AND m.sender_id != ?
        AND (
          (? = 'admin') OR
          (c.customer_id = ?)
        )
    `).get(user.id, user.role, user.id);
    res.json({ unread: countRow?.total || 0 });
  } catch (err) {
    next(err);
  }
});

export default router;

