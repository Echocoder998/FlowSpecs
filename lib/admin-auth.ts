export const ADMIN_SESSION_COOKIE = "mce_admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SESSION_LABEL = "mce-admin";

function constantTimeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string) {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function getSigningKey() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET is not configured.");
  }
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function checkAdminPassword(candidate: string) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;

  const [candidateDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(candidate)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(expected))
  ]);

  return constantTimeEqual(new Uint8Array(candidateDigest), new Uint8Array(expectedDigest));
}

export async function signAdminSession() {
  const key = await getSigningKey();
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${SESSION_LABEL}.${expires}`;
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${toHex(signature)}`;
}

export async function verifyAdminSession(token: string | undefined | null) {
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [label, expiresRaw, signatureHex] = parts;
  if (label !== SESSION_LABEL) return false;

  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || Date.now() > expires) return false;

  const signatureBytes = hexToBytes(signatureHex);
  if (!signatureBytes) return false;

  let key: CryptoKey;
  try {
    key = await getSigningKey();
  } catch {
    return false;
  }

  const payload = `${label}.${expiresRaw}`;
  return crypto.subtle.verify("HMAC", key, signatureBytes, new TextEncoder().encode(payload));
}
