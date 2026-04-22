import { Router } from "express";
import { db } from "../database.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = Router();

function orderToResponse(row, items = [], userInfo = null) {
  const o = {
    id: row.id,
    userId: row.user_id,
    total: row.total,
    discount: row.discount,
    shipping: row.shipping,
    status: row.status,
    paymentMethod: row.payment_method,
    address: typeof row.address_json === "string" ? JSON.parse(row.address_json) : row.address_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: items.map((it) => ({
      productId: it.product_id,
      productName: it.product_name,
      quantity: it.quantity,
      unitPrice: it.unit_price,
      price: it.unit_price,
    })),
  };
  if (userInfo) o.user = userInfo;
  return o;
}

/** Polling para o admin: último pedido (novo pedido = id diferente do anterior). */
router.get("/admin/latest", authenticate, requireAdmin, (req, res) => {
  const row = db
    .prepare(
      `SELECT o.id, o.created_at, o.total, o.status, u.name as user_name, u.email as user_email
       FROM orders o
       JOIN users u ON u.id = o.user_id
       ORDER BY o.created_at DESC LIMIT 1`
    )
    .get();
  if (!row) {
    return res.json({ latestOrderId: null, latest: null });
  }
  res.json({
    latestOrderId: row.id,
    latest: {
      id: row.id,
      createdAt: row.created_at,
      total: row.total,
      status: row.status,
      userName: row.user_name,
      userEmail: row.user_email,
    },
  });
});

router.get("/", authenticate, (req, res) => {
  const { status, userId } = req.query;
  const isAdmin = req.user.role === "admin";
  let sql = `
    SELECT o.*, u.name as user_name, u.email as user_email
    FROM orders o
    JOIN users u ON u.id = o.user_id
    WHERE 1=1
  `;
  const params = [];
  if (!isAdmin) {
    sql += " AND o.user_id = ?";
    params.push(req.user.id);
  } else if (userId && String(userId).trim()) {
    sql += " AND o.user_id = ?";
    params.push(String(userId).trim());
  }
  if (status && String(status).trim()) {
    sql += " AND o.status = ?";
    params.push(String(status).trim());
  }
  sql += " ORDER BY o.created_at DESC";
  const rows = db.prepare(sql).all(...params);
  const orders = rows.map((row) => {
    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(row.id);
    return orderToResponse(row, items, { name: row.user_name, email: row.user_email });
  });
  res.status(200).json({ orders });
});

function getStoreShippingFixed() {
  const row = db.prepare("SELECT value FROM store_settings WHERE key = ?").get("site_shipping_fixed");
  const n = parseFloat(String(row?.value ?? "15").replace(",", "."));
  if (Number.isFinite(n) && n >= 0 && n <= 999999.99) return Math.round(n * 100) / 100;
  return 15;
}

router.post("/", authenticate, (req, res) => {
  const { items, paymentMethod, address, couponCode } = req.body ?? {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: true, message: "Itens são obrigatórios" });
  }
  if (paymentMethod !== "pix") {
    return res.status(400).json({ error: true, message: "Apenas pagamento via PIX é aceito" });
  }
  if (!address || typeof address !== "object") {
    return res.status(400).json({ error: true, message: "Endereço é obrigatório" });
  }
  const addressJson = JSON.stringify(address);
  /** Desconto só via cupom validado no servidor (não confiar em `discount` do cliente). */
  let discountNum = 0;
  const shippingNum = getStoreShippingFixed();
  const couponNormalized =
    couponCode != null && String(couponCode).trim() ? String(couponCode).trim().toUpperCase() : null;

  const unavailable = [];
  for (const it of items) {
    const productId = it.productId || it.product_id;
    const quantity = parseInt(it.quantity, 10) || 0;
    if (!productId || quantity < 1) continue;
    const prod = db.prepare("SELECT id, name, price, stock FROM products WHERE id = ? AND active = 1").get(productId);
    if (!prod) {
      unavailable.push({ productId, name: it.productName || "?", quantity, reason: "Produto não encontrado ou inativo" });
    } else if (prod.stock < quantity) {
      unavailable.push({ productId, name: prod.name, quantity, available: prod.stock, reason: "Estoque insuficiente" });
    }
  }
  if (unavailable.length > 0) {
    return res.status(400).json({ error: true, message: "Alguns itens não estão disponíveis", unavailable });
  }

  const getNextOrderId = () => {
    const row = db.prepare("SELECT id FROM orders ORDER BY id DESC LIMIT 1").get();
    if (!row) return "ORD-001";
    const num = parseInt(row.id.replace("ORD-", ""), 10);
    return "ORD-" + String(num + 1).padStart(3, "0");
  };

  const insertOrder = db.prepare(`
    INSERT INTO orders (id, user_id, total, discount, shipping, status, payment_method, address_json)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
  `);
  const insertRedemption = db.prepare(`
    INSERT INTO coupon_redemptions (coupon_id, user_id, order_id)
    VALUES (?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price)
    VALUES (?, ?, ?, ?, ?)
  `);
  const updateStock = db.prepare(`
    UPDATE products SET stock = stock - ?, updated_at = datetime('now') WHERE id = ?
  `);

  let total = 0;
  const orderId = getNextOrderId();

  try {
    db.transaction(() => {
      // Primeiro: validar e calcular itens totais (sem inserir em order_items ainda)
      const preparedItems = [];
      for (const it of items) {
        const productId = it.productId || it.product_id;
        const quantity = parseInt(it.quantity, 10) || 0;
        const prod = db.prepare("SELECT id, name, price, stock FROM products WHERE id = ?").get(productId);
        if (!prod || prod.stock < quantity) throw new Error("Estoque insuficiente");
        total += prod.price * quantity;
        preparedItems.push({
          productId,
          productName: prod.name,
          quantity,
          unitPrice: prod.price,
        });
      }
      let couponIdForRedeem = null;
      if (couponNormalized) {
        const coupon = db
          .prepare("SELECT * FROM coupons WHERE UPPER(code) = ? AND active = 1")
          .get(couponNormalized);
        if (!coupon) throw new Error("Cupom inválido ou inativo");
        const used = db
          .prepare("SELECT 1 FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ?")
          .get(coupon.id, req.user.id);
        if (used) throw new Error("Este cupom já foi utilizado na sua conta");
        const pctDiscount = Math.round(total * (coupon.percent / 100) * 100) / 100;
        discountNum = Math.min(pctDiscount, total);
        couponIdForRedeem = coupon.id;
      }
      const finalTotal = total - discountNum + shippingNum;
      // Segundo: inserir o pedido para garantir que order_items (FK) vai existir
      insertOrder.run(orderId, req.user.id, finalTotal, discountNum, shippingNum, paymentMethod, addressJson);
      if (couponIdForRedeem) {
        insertRedemption.run(couponIdForRedeem, req.user.id, orderId);
      }
      // Terceiro: inserir itens e atualizar estoque
      for (const pi of preparedItems) {
        insertItem.run(orderId, pi.productId, pi.productName, pi.quantity, pi.unitPrice);
        updateStock.run(pi.quantity, pi.productId);
      }
    })();
  } catch (e) {
    return res.status(400).json({ error: true, message: e.message || "Erro ao criar pedido", unavailable });
  }

  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  const orderItems = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(orderId);
  res.status(201).json({ order: orderToResponse(row, orderItems) });
});

router.patch("/:id/cancel", authenticate, (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  if (!order) {
    return res.status(404).json({ error: true, message: "Pedido não encontrado" });
  }
  const isAdmin = req.user.role === "admin";
  if (!isAdmin && order.user_id !== req.user.id) {
    return res.status(403).json({ error: true, message: "Acesso negado" });
  }
  if (order.status !== "pending") {
    return res.status(400).json({ error: true, message: "Apenas pedidos pendentes podem ser cancelados" });
  }
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(req.params.id);
  const updateStock = db.prepare("UPDATE products SET stock = stock + ?, updated_at = datetime('now') WHERE id = ?");
  const updateOrder = db.prepare("UPDATE orders SET status='cancelled', updated_at=datetime('now') WHERE id=?");
  try {
    db.transaction(() => {
      for (const it of items) {
        updateStock.run(it.quantity, it.product_id);
      }
      updateOrder.run(req.params.id);
    })();
  } catch (e) {
    return res.status(500).json({ error: true, message: e.message });
  }
  const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  const orderItems = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(req.params.id);
  res.status(200).json({ order: orderToResponse(updated, orderItems) });
});

router.patch("/:id/status", authenticate, requireAdmin, (req, res) => {
  const { status } = req.body ?? {};
  if (!status || !["confirmed", "shipped", "delivered", "cancelled"].includes(status)) {
    return res.status(400).json({ error: true, message: "Status inválido" });
  }
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  if (!order) {
    return res.status(404).json({ error: true, message: "Pedido não encontrado" });
  }
  if (status === "cancelled") {
    if (order.status !== "pending") {
      return res.status(400).json({ error: true, message: "Apenas pedidos pendentes podem ser cancelados" });
    }
    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(req.params.id);
    const updateStock = db.prepare("UPDATE products SET stock = stock + ?, updated_at = datetime('now') WHERE id = ?");
    const updateOrder = db.prepare("UPDATE orders SET status='cancelled', updated_at=datetime('now') WHERE id=?");
    db.transaction(() => {
      for (const it of items) updateStock.run(it.quantity, it.product_id);
      updateOrder.run(req.params.id);
    })();
  } else {
    db.prepare("UPDATE orders SET status=?, updated_at=datetime('now') WHERE id=?").run(status, req.params.id);
  }
  const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  const orderItems = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(req.params.id);
  res.status(200).json({ order: orderToResponse(updated, orderItems) });
});

function getInventory(req, res) {
  const rows = db.prepare(`
    SELECT p.id, p.name, p.image, p.category, p.price, p.stock, p.active,
           COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN oi.quantity ELSE 0 END), 0) as total_sold
    FROM products p
    LEFT JOIN order_items oi ON oi.product_id = p.id
    LEFT JOIN orders o ON o.id = oi.order_id
    GROUP BY p.id
    ORDER BY p.stock ASC
  `).all();
  const products = rows.map((r) => ({
    id: r.id,
    name: r.name,
    image: r.image,
    category: r.category,
    price: r.price,
    stock: r.stock,
    active: r.active === 1,
    totalSold: r.total_sold,
  }));
  const activeProducts = rows.filter((r) => r.active === 1);
  const totalProducts = activeProducts.length;
  const totalStock = activeProducts.reduce((s, r) => s + r.stock, 0);
  const lowStockCount = activeProducts.filter((r) => r.stock >= 1 && r.stock <= 4).length;
  const outOfStockCount = activeProducts.filter((r) => r.stock === 0).length;
  const revenueRow = db.prepare(
    "SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status != 'cancelled'"
  ).get();
  res.status(200).json({
    products,
    summary: {
      totalProducts,
      totalStock,
      lowStockCount,
      outOfStockCount,
      totalRevenue: revenueRow.total ?? 0,
    },
  });
}

router.get("/inventory", authenticate, requireAdmin, getInventory);

export default router;
export { getInventory };
