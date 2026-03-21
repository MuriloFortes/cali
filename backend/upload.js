// Configuração do Multer para upload de imagens de produtos
// - Destino: backend/uploads/products/
// - Nome do arquivo: product_<timestamp>_<random>.<ext>
// - Filtro: apenas imagens (jpeg, png, webp, gif)
// - Limite: 5MB

import multer from "multer";
import path from "path";
import { existsSync, mkdirSync } from "fs";

const PRODUCTS_DIR = path.join(process.cwd(), "uploads", "products");
const AVATARS_DIR = path.join(process.cwd(), "uploads", "avatars");
const SITE_DIR = path.join(process.cwd(), "uploads", "site");
const SITE_ICONS_DIR = path.join(process.cwd(), "uploads", "site", "icons");

if (!existsSync(PRODUCTS_DIR)) {
  mkdirSync(PRODUCTS_DIR, { recursive: true });
}
if (!existsSync(AVATARS_DIR)) {
  mkdirSync(AVATARS_DIR, { recursive: true });
}
if (!existsSync(SITE_DIR)) {
  mkdirSync(SITE_DIR, { recursive: true });
}
if (!existsSync(SITE_ICONS_DIR)) {
  mkdirSync(SITE_ICONS_DIR, { recursive: true });
}

const productStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PRODUCTS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const name = `product_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, name);
  },
});

const imageFileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Formato de imagem não suportado. Use JPEG, PNG, WebP ou GIF."), false);
  }
};

export const uploadProductImage = multer({
  storage: productStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
}).single("image");

export const uploadAvatar = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, AVATARS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      const base = `avatar-${req.user?.id || "user"}-${Date.now()}${ext}`;
      cb(null, base);
    },
  }),
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    cb(null, allowed.includes(file.mimetype));
  },
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
}).single("avatar");

// Configuração do Multer para upload de imagens do site (banners)
// - Destino: backend/uploads/site/
// - Campo esperado: "banner_image"
// - Limite: 5MB
export const uploadSiteBannerImage = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, SITE_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      const base = `site_banner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
      cb(null, base);
    },
  }),
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    cb(null, allowed.includes(file.mimetype));
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
}).single("banner_image");

// Upload unificado de assets do site (ícone do topo + banner)
// Campos esperados:
// - store_logo_image (ícone do topo)
// - banner_image (imagem do banner)
export const uploadSiteAssets = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (file.fieldname === "store_logo_image") return cb(null, SITE_ICONS_DIR);
      if (file.fieldname === "banner_image") return cb(null, SITE_DIR);
      if (file.fieldname === "site_background_image") return cb(null, SITE_DIR);
      cb(null, SITE_DIR);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      const base = `${file.fieldname}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
      cb(null, base);
    },
  }),
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    cb(null, allowed.includes(file.mimetype));
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
}).fields([
  { name: "store_logo_image", maxCount: 1 },
  { name: "banner_image", maxCount: 1 },
  { name: "site_background_image", maxCount: 1 },
]);

