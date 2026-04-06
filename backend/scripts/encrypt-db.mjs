/**
 * Criptografa um novamart.db existente em texto claro (SQLite padrão).
 * Uso: defina SQLITE_ENCRYPTION_KEY no .env, pare a API, faça backup do .db, depois:
 *   node scripts/encrypt-db.mjs
 * Em seguida inicie a API com a mesma SQLITE_ENCRYPTION_KEY.
 */
import "dotenv/config";
import Database from "better-sqlite3-multiple-ciphers";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync, copyFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "..", "novamart.db");

const key = process.env.SQLITE_ENCRYPTION_KEY;
if (!key || String(key).length < 8) {
  console.error("Defina SQLITE_ENCRYPTION_KEY no .env (mínimo 8 caracteres).");
  process.exit(1);
}

if (!existsSync(dbPath)) {
  console.error("Arquivo não encontrado:", dbPath);
  process.exit(1);
}

const esc = (k) => String(k).replace(/'/g, "''");

const backupPath = dbPath + ".backup-plain-" + Date.now();
copyFileSync(dbPath, backupPath);
console.log("Backup criado:", backupPath);

const db = new Database(dbPath);
try {
  db.pragma(`rekey='${esc(key)}'`);
  console.log("Banco criptografado com sucesso. Use a mesma SQLITE_ENCRYPTION_KEY ao iniciar o servidor.");
} catch (e) {
  console.error("Falha ao criptografar:", e.message);
  process.exit(1);
} finally {
  db.close();
}
