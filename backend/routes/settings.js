import { Router } from "express";
import { db } from "../database.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { generatePixPayload, pixPayloadToQrCodeUrl } from "../services/pixBrCode.js";
import { uploadSiteAssets } from "../upload.js";

const router = Router();

function getSetting(key) {
  const row = db.prepare("SELECT value FROM store_settings WHERE key = ?").get(key);
  return row?.value ?? "";
}

router.get("/pix", authenticate, (req, res) => {
  const pixKey = getSetting("pix_key");
  const pixKeyType = getSetting("pix_key_type");
  const pixBeneficiaryName = getSetting("pix_beneficiary_name");
  const pixCity = getSetting("pix_city");

  if (req.user.role === "admin") {
    return res.json({
      pixKey,
      pixKeyType,
      pixBeneficiaryName,
      pixCity,
      configured: !!pixKey,
    });
  }

  res.json({ configured: !!pixKey });
});

router.put("/pix", authenticate, requireAdmin, (req, res) => {
  const { pixKey, pixKeyType, pixBeneficiaryName, pixCity } = req.body ?? {};

  if (!pixKey || !pixKey.trim()) {
    return res.status(400).json({ error: true, message: "Chave PIX é obrigatória" });
  }
  if (!["cpf", "cnpj", "email", "phone", "random"].includes(pixKeyType)) {
    return res.status(400).json({ error: true, message: "Tipo de chave inválido" });
  }
  if (!pixBeneficiaryName || !pixBeneficiaryName.trim()) {
    return res.status(400).json({ error: true, message: "Nome do beneficiário é obrigatório" });
  }
  if (!pixCity || !pixCity.trim()) {
    return res.status(400).json({ error: true, message: "Cidade é obrigatória" });
  }

  const upsert = db.prepare(`
    INSERT INTO store_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  db.transaction(() => {
    upsert.run("pix_key", pixKey.trim());
    upsert.run("pix_key_type", pixKeyType);
    upsert.run("pix_beneficiary_name", pixBeneficiaryName.trim());
    upsert.run("pix_city", pixCity.trim());
  })();

  res.json({ success: true, message: "Chave PIX atualizada com sucesso" });
});

router.post("/pix/generate", authenticate, (req, res) => {
  const { amount, txId, description } = req.body ?? {};

  const amountNum = parseFloat(amount);
  if (!amountNum || Number.isNaN(amountNum) || amountNum <= 0) {
    return res.status(400).json({ error: true, message: "Valor inválido" });
  }

  const pixKey = getSetting("pix_key");
  const pixKeyType = getSetting("pix_key_type");
  const pixBeneficiaryName = getSetting("pix_beneficiary_name") || "NovaMart";
  const pixCity = getSetting("pix_city") || "Sao Paulo";

  if (!pixKey) {
    return res.status(503).json({ error: true, message: "Chave PIX não configurada" });
  }

  const payload = generatePixPayload({
    pixKey,
    pixKeyType,
    amount: amountNum,
    merchantName: pixBeneficiaryName,
    merchantCity: pixCity,
    txId: (txId || `NOVAMART${Date.now()}`).replace(/[^a-zA-Z0-9]/g, "").slice(0, 25),
    description: description || "Pedido NovaMart",
  });

  const qrCodeUrl = pixPayloadToQrCodeUrl(payload, 300);

  res.json({ payload, qrCodeUrl, amount: amountNum });
});

// GET /api/settings/store
// Retorna apenas o ícone configurado (admin pode editar no PUT)
router.get("/store", authenticate, (req, res) => {
  const icon = getSetting("store_logo_icon") || "Store";
  const logoImagePath = getSetting("store_logo_image_path") || "";
  res.json({
    icon,
    storeLogoImageUrl: logoImagePath ? `/uploads/site/icons/${logoImagePath}` : "",
  });
});

// PUT /api/settings/store
// Admin atualiza o ícone que aparece no topo do painel do admin
router.put("/store", authenticate, requireAdmin, (req, res) => {
  const { icon } = req.body ?? {};

  const allowedIcons = ["Store", "Home", "ShoppingCart", "Package"];
  if (!icon || typeof icon !== "string" || !allowedIcons.includes(icon)) {
    return res.status(400).json({
      error: true,
      message: "Ícone inválido. Opções válidas: Store, Home, ShoppingCart, Package.",
    });
  }

  const upsert = db.prepare(`
    INSERT INTO store_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  upsert.run("store_logo_icon", icon);

  res.json({ success: true, icon });
});

// GET /api/settings/site
// Retorna configurações do site (texto, banner, cores e ícone)
router.get("/site", authenticate, (req, res) => {
  const icon = getSetting("store_logo_icon") || "Store";
  const heroDescription = getSetting("site_hero_description");
  const heroTitle = getSetting("site_hero_title");
  const footerText = getSetting("site_footer_text");
  const storeName = getSetting("store_name") || "NovaMart";
  const primaryColor = getSetting("site_primary_color") || "#8b5cf6"; // violet-500
  const secondaryColor = getSetting("site_secondary_color") || "#6366f1"; // indigo-500
  const bannerImagePath = getSetting("site_banner_image_path") || ""; // filename
  const logoImagePath = getSetting("store_logo_image_path") || "";
  const storeLogoImageUrl = logoImagePath ? `/uploads/site/icons/${logoImagePath}` : "";
  const backgroundTopColor = getSetting("site_bg_color_top") || "#0a0a14";
  const backgroundBottomColor = getSetting("site_bg_color_bottom") || "#0f0f1a";
  const backgroundImagePath = getSetting("site_background_image_path") || "";
  const backgroundImageUrl = backgroundImagePath ? `/uploads/site/${backgroundImagePath}` : "";
  const backgroundImageOpacity = getSetting("site_background_image_opacity") || "0.35";
  const btnPrimaryFrom = getSetting("site_btn_primary_from") || "#7c3aed";
  const btnPrimaryTo = getSetting("site_btn_primary_to") || "#6366f1";
  const btnSecondary = getSetting("site_btn_secondary") || "#7c3aed";

  res.json({
    icon,
    storeName,
    storeLogoImageUrl,
    heroTitle,
    heroDescription,
    footerText,
    primaryColor,
    secondaryColor,
    bannerImageUrl: bannerImagePath ? `/uploads/site/${bannerImagePath}` : "",
    backgroundTopColor,
    backgroundBottomColor,
    backgroundImageUrl,
    backgroundImageOpacity,
    btnPrimaryFrom,
    btnPrimaryTo,
    btnSecondary,
  });
});

// GET /api/settings/site/public
// Versão pública para páginas sem login (ex: login)
router.get("/site/public", (req, res) => {
  const icon = getSetting("store_logo_icon") || "Store";
  const heroDescription = getSetting("site_hero_description");
  const heroTitle = getSetting("site_hero_title");
  const footerText = getSetting("site_footer_text");
  const storeName = getSetting("store_name") || "NovaMart";
  const primaryColor = getSetting("site_primary_color") || "#8b5cf6";
  const secondaryColor = getSetting("site_secondary_color") || "#6366f1";
  const bannerImagePath = getSetting("site_banner_image_path") || "";
  const logoImagePath = getSetting("store_logo_image_path") || "";
  const storeLogoImageUrl = logoImagePath ? `/uploads/site/icons/${logoImagePath}` : "";
  const backgroundTopColor = getSetting("site_bg_color_top") || "#0a0a14";
  const backgroundBottomColor = getSetting("site_bg_color_bottom") || "#0f0f1a";
  const backgroundImagePath = getSetting("site_background_image_path") || "";
  const backgroundImageUrl = backgroundImagePath ? `/uploads/site/${backgroundImagePath}` : "";
  const backgroundImageOpacity = getSetting("site_background_image_opacity") || "0.35";
  const btnPrimaryFrom = getSetting("site_btn_primary_from") || "#7c3aed";
  const btnPrimaryTo = getSetting("site_btn_primary_to") || "#6366f1";
  const btnSecondary = getSetting("site_btn_secondary") || "#7c3aed";

  res.json({
    icon,
    storeName,
    storeLogoImageUrl,
    heroTitle,
    heroDescription,
    footerText,
    primaryColor,
    secondaryColor,
    bannerImageUrl: bannerImagePath ? `/uploads/site/${bannerImagePath}` : "",
    backgroundTopColor,
    backgroundBottomColor,
    backgroundImageUrl,
    backgroundImageOpacity,
    btnPrimaryFrom,
    btnPrimaryTo,
    btnSecondary,
  });
});

// PUT /api/settings/site
// Admin atualiza texto, cores e banner/ícones do site
router.put("/site", authenticate, requireAdmin, uploadSiteAssets, (req, res) => {
  const {
    heroTitle,
    heroDescription,
    footerText,
    primaryColor,
    secondaryColor,
    icon,
    storeName,
    backgroundTopColor,
    backgroundBottomColor,
    backgroundImageOpacity,
    removeBackgroundImage,
    btnPrimaryFrom,
    btnPrimaryTo,
    btnSecondary,
  } = req.body ?? {};

  const allowedIcons = ["Store", "Home", "ShoppingCart", "Package"];
  const nextIcon = icon && typeof icon === "string" && allowedIcons.includes(icon) ? icon : null;

  // Permite salvar string vazia para que o admin consiga "colocar imagem no lugar" (sem textos)
  const nextHeroTitle = typeof heroTitle === "string" ? heroTitle.trim() : null;
  const nextHeroDescription = typeof heroDescription === "string" ? heroDescription.trim() : null;
  const nextFooterText = typeof footerText === "string" ? footerText.trim() : null;
  const nextPrimaryColor = typeof primaryColor === "string" && /^#([0-9a-fA-F]{3}){1,2}$/.test(primaryColor.trim()) ? primaryColor.trim() : null;
  const nextSecondaryColor = typeof secondaryColor === "string" && /^#([0-9a-fA-F]{3}){1,2}$/.test(secondaryColor.trim()) ? secondaryColor.trim() : null;
  const nextStoreName = typeof storeName === "string" ? storeName.trim() : null;
  const nextBackgroundTopColor = typeof backgroundTopColor === "string" && /^#([0-9a-fA-F]{3}){1,2}$/.test(backgroundTopColor.trim()) ? backgroundTopColor.trim() : null;
  const nextBackgroundBottomColor = typeof backgroundBottomColor === "string" && /^#([0-9a-fA-F]{3}){1,2}$/.test(backgroundBottomColor.trim()) ? backgroundBottomColor.trim() : null;

  const shouldRemoveBg = String(removeBackgroundImage || "") === "1";

  const opacityNum = backgroundImageOpacity != null ? parseFloat(backgroundImageOpacity) : NaN;
  const nextBackgroundImageOpacity = !Number.isNaN(opacityNum) && opacityNum >= 0 && opacityNum <= 1 ? String(opacityNum) : null;

  const storeLogoFile = req.files?.store_logo_image?.[0];
  const bannerFile = req.files?.banner_image?.[0];
  const bgFile = req.files?.site_background_image?.[0];
  const nextStoreLogoImagePath = storeLogoFile?.filename ? storeLogoFile.filename : null;
  const nextBannerImagePath = bannerFile?.filename ? bannerFile.filename : null;
  const nextBackgroundImagePath = shouldRemoveBg ? "" : (bgFile?.filename ? bgFile.filename : null);

  const nextBtnPrimaryFrom = typeof btnPrimaryFrom === "string" && /^#([0-9a-fA-F]{3}){1,2}$/.test(btnPrimaryFrom.trim()) ? btnPrimaryFrom.trim() : null;
  const nextBtnPrimaryTo = typeof btnPrimaryTo === "string" && /^#([0-9a-fA-F]{3}){1,2}$/.test(btnPrimaryTo.trim()) ? btnPrimaryTo.trim() : null;
  const nextBtnSecondary = typeof btnSecondary === "string" && /^#([0-9a-fA-F]{3}){1,2}$/.test(btnSecondary.trim()) ? btnSecondary.trim() : null;

  const upsert = db.prepare(`
    INSERT INTO store_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  // Atualização parcial: só grava o que vier na request
  db.transaction(() => {
    if (nextIcon) upsert.run("store_logo_icon", nextIcon);
    if (nextStoreName !== null) upsert.run("store_name", nextStoreName);
    if (nextHeroTitle !== null) upsert.run("site_hero_title", nextHeroTitle);
    if (nextHeroDescription !== null) upsert.run("site_hero_description", nextHeroDescription);
    if (nextFooterText !== null) upsert.run("site_footer_text", nextFooterText);
    if (nextPrimaryColor) upsert.run("site_primary_color", nextPrimaryColor);
    if (nextSecondaryColor) upsert.run("site_secondary_color", nextSecondaryColor);
    if (nextBannerImagePath !== null) upsert.run("site_banner_image_path", nextBannerImagePath);
    if (nextStoreLogoImagePath !== null) upsert.run("store_logo_image_path", nextStoreLogoImagePath);
    if (nextBackgroundTopColor) upsert.run("site_bg_color_top", nextBackgroundTopColor);
    if (nextBackgroundBottomColor) upsert.run("site_bg_color_bottom", nextBackgroundBottomColor);
    if (nextBackgroundImageOpacity !== null) upsert.run("site_background_image_opacity", nextBackgroundImageOpacity);
    if (nextBackgroundImagePath !== null) upsert.run("site_background_image_path", nextBackgroundImagePath);
    if (nextBtnPrimaryFrom !== null) upsert.run("site_btn_primary_from", nextBtnPrimaryFrom);
    if (nextBtnPrimaryTo !== null) upsert.run("site_btn_primary_to", nextBtnPrimaryTo);
    if (nextBtnSecondary !== null) upsert.run("site_btn_secondary", nextBtnSecondary);
  })();

  res.json({ success: true });
});

export default router;

