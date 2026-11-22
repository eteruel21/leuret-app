import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomInt
} from "node:crypto";

import { env } from "../config/env.js";

export const MFA_KEY_VERSION = 1;
const RECOVERY_CODE_COUNT = 10;
// Sin 0/O/1/I/L para que se puedan leer y escribir sin error.
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export class MfaNotConfiguredError extends Error {
  constructor() {
    super("MFA_ENCRYPTION_KEY no está configurada.");
    this.name = "MfaNotConfiguredError";
  }
}

export function isMfaConfigured(): boolean {
  return Boolean(env.MFA_ENCRYPTION_KEY);
}

function getKey(): Buffer {
  const raw = env.MFA_ENCRYPTION_KEY;
  if (!raw) throw new MfaNotConfiguredError();
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new MfaNotConfiguredError();
  return key;
}

/** AES-256-GCM. El texto cifrado lleva la etiqueta de autenticación al final. */
export function encryptMfaSecret(secret: Uint8Array): { ciphertext: string; iv: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([encrypted, tag]).toString("base64"),
    iv: iv.toString("base64")
  };
}

export function decryptMfaSecret(ciphertext: string, iv: string): Buffer {
  const data = Buffer.from(ciphertext, "base64");
  if (data.length < 17) throw new Error("Secreto MFA inválido.");
  const tag = data.subarray(data.length - 16);
  const encrypted = data.subarray(0, data.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashRecoveryCode(code: string): string {
  return createHmac("sha256", getKey())
    .update(normalizeRecoveryCode(code))
    .digest("hex");
}

/** 10 códigos de 10 caracteres con formato XXXXX-XXXXX. */
export function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const chars = Array.from({ length: 10 }, () =>
      RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]
    ).join("");
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}
