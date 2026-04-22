import "dotenv/config";
import express from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import { initDatabase } from "./database.js";
import authRoutes from "./routes/auth.js";
import webauthnRoutes from "./routes/webauthn.js";
import productsRoutes from "./routes/products.js";
import usersRoutes from "./routes/users.js";
import ordersRoutes, { getInventory } from "./routes/orders.js";
import chatRoutes from "./routes/chat.js";
import profileRoutes from "./routes/profile.js";
import settingsRoutes from "./routes/settings.js";
import cepRoutes from "./routes/cep.js";
import categoriesRoutes from "./routes/categories.js";
import couponsRoutes from "./routes/coupons.js";
import { authenticate, requireAdmin } from "./middleware/auth.js";
import { isWebAuthnDisabled } from "./utils/jwtAuth.js";

initDatabase();

const app = express();
const PORT = process.env.PORT || 3002;

// Atrás do Nginx / proxy: IP real em logs e cabeçalhos X-Forwarded-*
app.set("trust proxy", 1);

const isProduction = process.env.NODE_ENV === "production";

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        ...(isProduction ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    crossOriginResourcePolicy: { policy: "same-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    strictTransportSecurity: isProduction
      ? { maxAge: 15768000, includeSubDomains: false, preload: false }
      : false,
    xFrameOptions: { action: "deny" },
    xContentTypeOptions: true,
  })
);

const corsOriginRaw = process.env.CORS_ORIGIN || "http://localhost:5173";

/** Aceita "http://host", "https://host" ou só "host" / IP (o browser envia Origin com esquema). */
function parseCorsOrigins(raw) {
  const out = new Set();
  for (const part of String(raw).split(",")) {
    const s = part.trim();
    if (!s) continue;
    if (/^https?:\/\//i.test(s)) {
      out.add(s.replace(/\/+$/, ""));
    } else {
      const h = s.replace(/\/+$/, "");
      out.add(`http://${h}`);
      out.add(`https://${h}`);
    }
  }
  return [...out];
}

const corsAllowed =
  corsOriginRaw.trim() === "*"
    ? true
    : (() => {
        const list = parseCorsOrigins(corsOriginRaw);
        return list.length ? list : ["http://localhost:5173"];
      })();

app.use(cors({ origin: corsAllowed }));
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
app.use("/api/auth", webauthnRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/cep", cepRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api/coupons", couponsRoutes);
app.get("/api/inventory", authenticate, requireAdmin, getInventory);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: true, message: err.message || "Erro interno do servidor" });
});

app.listen(PORT, () => {
  console.log(`🚀 NovaMart API rodando em http://localhost:${PORT}`);
  if (isWebAuthnDisabled()) {
    console.warn(
      "[WebAuthn] DESATIVADA (WEBAUTHN_DISABLED). Pós-2FA e admin emitem JWT sem passkey. Remova a variável ou use WEBAUTHN_DISABLED=0 para exigir biometria."
    );
  }
});
