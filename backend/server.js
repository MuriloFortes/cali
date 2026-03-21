import "dotenv/config";
import express from "express";
import path from "path";
import cors from "cors";
import { initDatabase } from "./database.js";
import authRoutes from "./routes/auth.js";
import productsRoutes from "./routes/products.js";
import usersRoutes from "./routes/users.js";
import ordersRoutes, { getInventory } from "./routes/orders.js";
import chatRoutes from "./routes/chat.js";
import profileRoutes from "./routes/profile.js";
import settingsRoutes from "./routes/settings.js";
import cepRoutes from "./routes/cep.js";
import { authenticate, requireAdmin } from "./middleware/auth.js";

initDatabase();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

// Servir arquivos estáticos de uploads (produtos e avatares)
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
app.use("/uploads/avatars", express.static(path.join(process.cwd(), "uploads", "avatars")));

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`[${req.method}] ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

app.use("/api/auth", authRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/cep", cepRoutes);
app.get("/api/inventory", authenticate, requireAdmin, getInventory);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: true, message: err.message || "Erro interno do servidor" });
});

app.listen(PORT, () => {
  console.log(`🚀 NovaMart API rodando em http://localhost:${PORT}`);
});
