/**
 * Gera o payload PIX Copia e Cola (BR Code / EMV QRCPS-MPM).
 *
 * @param {Object} params
 * @param {string} params.pixKey
 * @param {string} params.pixKeyType
 * @param {number} params.amount
 * @param {string} params.merchantName
 * @param {string} params.merchantCity
 * @param {string} params.txId
 * @param {string} [params.description]
 * @returns {string}
 */
export function generatePixPayload({ pixKey, pixKeyType, amount, merchantName, merchantCity, txId, description = "" }) {
  function emv(id, value) {
    const str = String(value ?? "");
    const len = str.length.toString().padStart(2, "0");
    return `${id}${len}${str}`;
  }

  function normalize(str, maxLen) {
    return String(str || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .trim()
      .slice(0, maxLen)
      .toUpperCase();
  }

  const pixGui = emv("00", "BR.GOV.BCB.PIX");
  const pixKeyField = emv("01", pixKey);
  const pixDescField = description ? emv("02", normalize(description, 40)) : "";
  const merchantAccountInfo = emv("26", pixGui + pixKeyField + pixDescField);

  const mcc = emv("52", "0000");
  const currency = emv("53", "986");

  const amountNum = Number(amount) || 0;
  const amountStr = amountNum.toFixed(2);
  const txAmount = emv("54", amountStr);

  const country = emv("58", "BR");
  const name = emv("59", normalize(merchantName, 25));
  const city = emv("60", normalize(merchantCity, 15));

  const txIdNorm = (txId || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 25) || "***";
  const additionalData = emv("62", emv("05", txIdNorm));

  const payloadSemCRC =
    emv("00", "01") +
    merchantAccountInfo +
    mcc +
    currency +
    txAmount +
    country +
    name +
    city +
    additionalData +
    "6304";

  function crc16(str) {
    let crc = 0xffff;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        if (crc & 0x8000) {
          crc = (crc << 1) ^ 0x1021;
        } else {
          crc <<= 1;
        }
      }
    }
    return (crc & 0xffff).toString(16).toUpperCase().padStart(4, "0");
  }

  return payloadSemCRC + crc16(payloadSemCRC);
}

export function pixPayloadToQrCodeUrl(payload, size = 300) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(
    payload
  )}&bgcolor=ffffff&color=000000&qzone=1&format=png`;
}

