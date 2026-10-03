import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Verificação em duas etapas: códigos de 6 dígitos que mudam a cada 30 s (TOTP, RFC 6238),
// compatíveis com Google Authenticator, Microsoft Authenticator, Authy, 1Password etc.

const STEP = 30;
const DIGITS = 6;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string) {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Código de um passo de tempo (HOTP, RFC 4226). */
export function hotp(key: Buffer, counter: number, digits = DIGITS) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", key).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const bin = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const currentStep = (ms = Date.now()) => Math.floor(ms / 1000 / STEP);

/** Novo segredo (160 bits, em base32 para digitar ou ler pelo QR). */
export const newTotpSecret = () => base32Encode(randomBytes(20));

/**
 * Confere o código aceitando 30 s de diferença no relógio do celular.
 * Devolve o passo usado (para não aceitar o mesmo código duas vezes) ou null.
 */
export function verifyTotp(secret: string, code: string, lastStep?: number | null, ms = Date.now()) {
  const digits = code.replace(/\D/g, "");
  if (digits.length !== DIGITS) return null;
  const key = base32Decode(secret);
  const now = currentStep(ms);
  for (const step of [now, now - 1, now + 1]) {
    if (lastStep != null && step <= lastStep) continue;
    const expected = hotp(key, step);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(digits))) return step;
  }
  return null;
}

/** Link otpauth:// que o app autenticador lê pelo QR. */
export function otpauthUri(secret: string, account: string, issuer = "Condtrack") {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP}`;
}

// ───── Códigos de recuperação (uso único, para quem perdeu o celular)

const hashCode = (c: string) => createHash("sha256").update(c.toLowerCase().replace(/[^a-z0-9]/g, "")).digest("hex");

/** 10 códigos no formato xxxx-xxxx; guarda só os hashes. */
export function newRecoveryCodes() {
  const codes = Array.from({ length: 10 }, () => {
    const h = randomBytes(4).toString("hex");
    return `${h.slice(0, 4)}-${h.slice(4)}`;
  });
  return { codes, stored: codes.map(hashCode).join(",") };
}

/** Usa um código de recuperação: devolve a lista restante (hashes) ou null se não confere. */
export function consumeRecoveryCode(stored: string, code: string) {
  const list = stored.split(",").filter(Boolean);
  const h = hashCode(code);
  if (!list.includes(h)) return null;
  return list.filter((x) => x !== h).join(",");
}

export const recoveryCount = (stored: string) => stored.split(",").filter(Boolean).length;
