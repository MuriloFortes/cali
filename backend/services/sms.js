import https from "https";
import querystring from "querystring";

function normalizePhone(phone) {
  const raw = String(phone || "").trim();
  if (!raw) throw new Error("Telefone não informado");
  if (raw.startsWith("+")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (!digits) throw new Error("Telefone inválido");
  const country = process.env.SMS_DEFAULT_COUNTRY || "+55";
  return `${country}${digits}`;
}

export async function sendSmsCode(phone, code) {
  const provider = process.env.SMS_PROVIDER || "twilio";

  if (provider === "twilio") {
    const sid = process.env.TWILIO_SID;
    const token = process.env.TWILIO_TOKEN;
    const from = process.env.TWILIO_FROM;

    if (!sid || !token || !from) {
      throw new Error("Twilio não configurado. Defina TWILIO_SID, TWILIO_TOKEN e TWILIO_FROM.");
    }

    const to = normalizePhone(phone);

    const postData = querystring.stringify({
      To: to,
      From: from,
      Body: `Seu código NovaMart: ${code}`,
    });

    const auth = Buffer.from(`${sid}:${token}`).toString("base64");

    const options = {
      hostname: "api.twilio.com",
      port: 443,
      path: `/2010-04-01/Accounts/${sid}/Messages.json`,
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            const body = Buffer.concat(chunks).toString("utf8");
            console.error("Twilio SMS error:", res.statusCode, body);
            reject(new Error("Falha ao enviar SMS"));
          }
        });
      });
      req.on("error", reject);
      req.write(postData);
      req.end();
    });

    return;
  }

  // Fallback: log apenas, mas sem retornar código (ainda é considerado não-produtivo)
  console.log(`[SMS LOG] Para: ${phone} | Código: ${code}`);
}

export function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function codeExpiresAt(minutesFromNow = 10) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutesFromNow);
  return d.toISOString();
}

