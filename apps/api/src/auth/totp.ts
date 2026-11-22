import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// TOTP (RFC 6238) con HMAC-SHA1, 6 dígitos y paso de 30 s: es lo que
// soportan Google Authenticator, Microsoft Authenticator, 1Password y Authy.
// Este módulo no importa nada del proyecto para poder probarse aislado.

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_WINDOW = 1;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(): Buffer {
  return randomBytes(20);
}

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function hotp(secret: Uint8Array, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac("sha1", secret).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

export function currentTotpStep(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
}

export function normalizeTotpCode(code: string): string | null {
  const digits = code.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

/**
 * Devuelve el paso (counter) que coincide con el código, o null.
 * - Acepta ±TOTP_WINDOW pasos por desfase de reloj.
 * - Rechaza pasos ya usados (`lastUsedStep`) para impedir la reutilización
 *   de un mismo código.
 * Recorre siempre todos los pasos y compara en tiempo constante.
 */
export function verifyTotp(
  secret: Uint8Array,
  code: string,
  options: { nowMs?: number; lastUsedStep?: number | null } = {}
): number | null {
  const normalized = normalizeTotpCode(code);
  if (!normalized) return null;

  const center = currentTotpStep(options.nowMs);
  const lastUsedStep = options.lastUsedStep ?? null;
  const candidate = Buffer.from(normalized);
  let matched: number | null = null;

  for (let step = center - TOTP_WINDOW; step <= center + TOTP_WINDOW; step += 1) {
    const expected = Buffer.from(hotp(secret, step));
    const equal = timingSafeEqual(candidate, expected);
    if (equal && (lastUsedStep === null || step > lastUsedStep)) {
      matched = step;
    }
  }

  return matched;
}

export function buildOtpauthUri(params: {
  secret: Uint8Array;
  accountName: string;
  issuer: string;
}): string {
  const label = `${encodeURIComponent(params.issuer)}:${encodeURIComponent(params.accountName)}`;
  const query = new URLSearchParams({
    secret: base32Encode(params.secret),
    issuer: params.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS)
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}
