/**
 * Título da aba: remove emojis e sufixo legado " - E-Commerce" que possa existir no store_name.
 */
export function formatTabTitle(raw) {
  if (typeof raw !== "string") return "NovaMart";
  let s = raw.trim();
  // Emojis e pictográficos comuns (incl. 🛍️ e similares)
  s = s.replace(/\p{Extended_Pictographic}/gu, "");
  s = s.replace(/\uFE0F/g, "");
  s = s.replace(/\s+/g, " ").trim();
  // Variações: " - E-Commerce", " – E-Commerce", " — E-Commerce"
  s = s.replace(/\s*[-–—]\s*E-Commerce\s*$/i, "").trim();
  return s || "NovaMart";
}
