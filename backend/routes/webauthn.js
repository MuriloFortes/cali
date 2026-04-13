import { Router } from "express";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { db } from "../database.js";
import { authenticatePendingWebAuthn } from "../middleware/pendingWebAuthn.js";
import {
  generateAccessToken,
  rotateSessionToken,
  userToResponse,
} from "../utils/jwtAuth.js";
import { setChallenge, takeChallenge } from "../services/webauthnChallenges.js";

const router = Router();

function isLikelyIPv4(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(String(host || "").trim());
}

/**
 * RP ID = hostname público (ex.: calicream.club), **nunca** o IP quando a página abre por domínio.
 * IPv4 como RP ID só é válido em cenários muito limitados; o browser rejeita se Origin for https://domínio.
 */
function getRpId(req) {
  const fromEnv = process.env.WEBAUTHN_RP_ID;
  if (fromEnv != null && String(fromEnv).trim() !== "") {
    const v = String(fromEnv).trim().split(":")[0].toLowerCase();
    if (!isLikelyIPv4(v)) return v;
  }
  if (req) {
    const origin = getRequestOrigin(req);
    if (origin) {
      try {
        const h = new URL(origin).hostname;
        if (h && !isLikelyIPv4(h)) return h.toLowerCase();
      } catch {
        /* ignore */
      }
    }
    const raw = (req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim();
    const host = raw.split(":")[0].toLowerCase();
    if (host && !isLikelyIPv4(host)) return host;
  }
  const fallback = fromEnv != null && String(fromEnv).trim() !== ""
    ? String(fromEnv).trim().split(":")[0].toLowerCase()
    : "";
  if (fallback) return fallback;
  return "localhost";
}

function getRpName() {
  return process.env.WEBAUTHN_RP_NAME || "NovaMart";
}

function getRequestOrigin(req) {
  const o = req.headers.origin;
  if (o) return o;
  const ref = req.headers.referer;
  if (ref && /^https?:\/\//i.test(ref)) {
    try {
      return new URL(ref).origin;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function userIdToBytes(uid) {
  const b = Buffer.from(String(uid), "utf8");
  const out = Buffer.alloc(64);
  b.copy(out);
  return new Uint8Array(out);
}

function rowToCredential(row) {
  return {
    id: row.credential_id,
    publicKey: Buffer.from(row.public_key, "base64url"),
    counter: row.counter,
    transports: row.transports ? JSON.parse(row.transports) : [],
  };
}

/** POST /api/auth/webauthn/register-options */
router.post("/webauthn/register-options", authenticatePendingWebAuthn, async (req, res, next) => {
  try {
    const userId = req.pendingUserId;
    const user = db.prepare("SELECT id, email, name FROM users WHERE id = ?").get(userId);
    if (!user) {
      return res.status(404).json({ error: true, message: "Usuário não encontrado" });
    }

    const rpID = getRpId(req);
    const options = await generateRegistrationOptions({
      rpName: getRpName(),
      rpID,
      userName: user.email,
      userDisplayName: user.name || user.email,
      userID: userIdToBytes(user.id),
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    setChallenge(`reg:${userId}`, options.challenge);

    res.json(options);
  } catch (err) {
    next(err);
  }
});

/** POST /api/auth/webauthn/register-verify */
router.post("/webauthn/register-verify", authenticatePendingWebAuthn, async (req, res, next) => {
  try {
    const userId = req.pendingUserId;
    const expectedChallenge = takeChallenge(`reg:${userId}`);
    if (!expectedChallenge) {
      return res.status(400).json({ error: true, message: "Desafio expirado. Solicite novamente." });
    }

    const origin = getRequestOrigin(req);
    if (!origin) {
      return res.status(400).json({
        error: true,
        message: "Origin ausente. Confirme proxy_set_header Origin $http_origin; no Nginx.",
      });
    }

    const rpID = getRpId(req);
    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: true, message: "Registro biométrico inválido" });
    }

    const cred = verification.registrationInfo.credential;
    const credId = cred.id;
    const pubKey = Buffer.from(cred.publicKey).toString("base64url");

    db.prepare("DELETE FROM webauthn_credentials WHERE user_id = ?").run(userId);
    db.prepare(
      `INSERT INTO webauthn_credentials (id, user_id, credential_id, public_key, counter, transports)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      `wc_${Date.now()}_${userId.slice(0, 8)}`,
      userId,
      credId,
      pubKey,
      cred.counter,
      JSON.stringify(cred.transports || [])
    );

    db.prepare("UPDATE users SET webauthn_registered = 1, updated_at = datetime('now') WHERE id = ?").run(userId);

    const sid = rotateSessionToken(userId);
    const user = db.prepare(
      "SELECT id, name, email, phone, role, active FROM users WHERE id = ?"
    ).get(userId);
    const token = generateAccessToken(userId, sid);

    res.json({ user: userToResponse(user), token });
  } catch (err) {
    next(err);
  }
});

/** POST /api/auth/webauthn/login-options */
router.post("/webauthn/login-options", authenticatePendingWebAuthn, async (req, res, next) => {
  try {
    const userId = req.pendingUserId;
    const rows = db.prepare("SELECT * FROM webauthn_credentials WHERE user_id = ?").all(userId);
    if (!rows.length) {
      return res.status(400).json({ error: true, message: "Nenhuma credencial biométrica. Registre primeiro." });
    }

    const allowCredentials = rows.map((r) => ({
      id: r.credential_id,
      transports: r.transports ? JSON.parse(r.transports) : [],
    }));

    const rpID = getRpId(req);
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: "preferred",
    });

    setChallenge(`auth:${userId}`, options.challenge);
    res.json(options);
  } catch (err) {
    next(err);
  }
});

/** POST /api/auth/webauthn/login-verify */
router.post("/webauthn/login-verify", authenticatePendingWebAuthn, async (req, res, next) => {
  try {
    const userId = req.pendingUserId;
    const expectedChallenge = takeChallenge(`auth:${userId}`);
    if (!expectedChallenge) {
      return res.status(400).json({ error: true, message: "Desafio expirado. Solicite novamente." });
    }

    const origin = getRequestOrigin(req);
    if (!origin) {
      return res.status(400).json({
        error: true,
        message: "Origin ausente. Confirme proxy_set_header Origin $http_origin; no Nginx.",
      });
    }

    const body = req.body;
    const credId = body?.id || body?.rawId;
    if (!credId) {
      return res.status(400).json({ error: true, message: "Credencial ausente" });
    }

    const row = db
      .prepare("SELECT * FROM webauthn_credentials WHERE user_id = ? AND credential_id = ?")
      .get(userId, credId);
    if (!row) {
      return res.status(400).json({ error: true, message: "Credencial não encontrada" });
    }

    const credential = rowToCredential(row);
    const rpID = getRpId(req);

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential,
      requireUserVerification: false,
    });

    if (!verification.verified) {
      return res.status(400).json({ error: true, message: "Autenticação biométrica inválida" });
    }

    const newCounter = verification.authenticationInfo.newCounter;
    db.prepare("UPDATE webauthn_credentials SET counter = ? WHERE user_id = ? AND credential_id = ?").run(
      newCounter,
      userId,
      credId
    );

    const sid = rotateSessionToken(userId);
    const user = db.prepare(
      "SELECT id, name, email, phone, role, active FROM users WHERE id = ?"
    ).get(userId);
    const token = generateAccessToken(userId, sid);

    res.json({ user: userToResponse(user), token });
  } catch (err) {
    next(err);
  }
});

export default router;
