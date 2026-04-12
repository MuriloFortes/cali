import nodemailer from "nodemailer";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("SMTP não configurado. Defina SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASS.");
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    /** Evita pedido de login a “pendurar” indefinidamente se o SMTP não responder. */
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });

  return transporter;
}

const SEND_MAIL_TIMEOUT_MS = 22_000;

export async function sendEmailCode(to, code) {
  const from = process.env.SMTP_FROM || "no-reply@novamart.local";
  const t = getTransporter();
  const mail = {
    from,
    to,
    subject: "Seu código de verificação - NovaMart",
    text: `Seu código de verificação é: ${code}`,
  };
  await Promise.race([
    t.sendMail(mail),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timeout ao enviar e-mail (${SEND_MAIL_TIMEOUT_MS}ms)`)),
        SEND_MAIL_TIMEOUT_MS
      )
    ),
  ]);
}

