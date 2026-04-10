/** Desafios WebAuthn em memória (TTL 5 min). Um servidor = OK; cluster exigiria Redis. */
const store = new Map();

export function setChallenge(key, challenge) {
  store.set(key, { challenge, expires: Date.now() + 5 * 60 * 1000 });
}

export function takeChallenge(key) {
  const v = store.get(key);
  if (!v) return null;
  store.delete(key);
  if (v.expires < Date.now()) return null;
  return v.challenge;
}
