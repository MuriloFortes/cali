/**
 * Executa schema + seed leve e sincroniza product_categories a partir de products.category.
 * Uso no VPS: cd backend && npm run db:sync-categories
 */
import "dotenv/config";
import { initDatabase } from "../database.js";

initDatabase();
console.log("OK: categorias alinhadas (defaults + nomes dos produtos).");
