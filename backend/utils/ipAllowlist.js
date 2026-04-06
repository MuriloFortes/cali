/**
 * IP / CIDR allowlist for admin login (VPN).
 * ADMIN_ALLOWED_IPS: comma-separated, e.g. "10.8.0.0/24,192.168.1.50,127.0.0.1"
 */

function ipv4ToInt(ip) {
  const parts = String(ip).split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function ipv4InCidr(ip, cidr) {
  const [range, bitsStr] = String(cidr).trim().split("/");
  const bits = bitsStr != null ? parseInt(bitsStr, 10) : 32;
  if (Number.isNaN(bits) || bits < 0 || bits > 32) return false;
  const a = ipv4ToInt(ip);
  const b = ipv4ToInt(range);
  if (a == null || b == null) return false;
  const mask = bits === 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

/**
 * Express: best-effort client IP (behind Nginx use trust proxy).
 */
export function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) {
    return xf.split(",")[0].trim();
  }
  const raw = req.socket?.remoteAddress || req.connection?.remoteAddress || "";
  return String(raw).replace(/^::ffff:/, "");
}

/**
 * Returns true if IP is allowed for admin login.
 * - If ADMIN_ALLOWED_IPS is unset or empty: only loopback (127.0.0.1, ::1) for safety in dev.
 * - If set: must match at least one entry (IPv4 literal or CIDR).
 */
export function isAdminIpAllowed(req) {
  // Apenas desenvolvimento: desativa checagem de IP (não use em produção).
  if (process.env.ADMIN_ALLOW_LOCAL_ADMIN === "1") {
    return true;
  }

  const raw = process.env.ADMIN_ALLOWED_IPS;
  const ip = getClientIp(req);

  if (ip === "::1" || ip === "127.0.0.1" || ip === "localhost") {
    return true;
  }

  if (!raw || !String(raw).trim()) {
    // Sem lista: só localhost (desenvolvimento local). Em produção configure ADMIN_ALLOWED_IPS.
    return false;
  }

  const entries = String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const entry of entries) {
    if (entry.includes("/")) {
      if (ipv4InCidr(ip, entry)) return true;
    } else if (ip === entry) {
      return true;
    }
  }

  return false;
}
