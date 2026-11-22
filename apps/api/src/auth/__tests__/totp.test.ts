import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { beforeAll, describe, test } from "vitest";

import { env } from "../../config/env.js";
import {
  decryptMfaSecret,
  encryptMfaSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode
} from "../mfa-crypto.js";
import { base32Encode, buildOtpauthUri, hotp, verifyTotp } from "../totp.js";

// RFC 6238, Apéndice B (SHA-1): secreto ASCII "12345678901234567890".
const rfcSecret = Buffer.from("12345678901234567890");

describe("TOTP (RFC 6238)", () => {
  test("coincide con los vectores de la RFC (últimos 6 dígitos)", () => {
    assert.equal(hotp(rfcSecret, Math.floor(59 / 30)), "287082");
    assert.equal(hotp(rfcSecret, Math.floor(1111111109 / 30)), "081804");
    assert.equal(hotp(rfcSecret, Math.floor(1111111111 / 30)), "050471");
    assert.equal(hotp(rfcSecret, Math.floor(1234567890 / 30)), "005924");
    assert.equal(hotp(rfcSecret, Math.floor(2000000000 / 30)), "279037");
  });

  test("base32 según RFC 4648", () => {
    assert.equal(base32Encode(Buffer.from("foobar")), "MZXW6YTBOI");
  });

  test("acepta ±1 paso, ignora espacios y rechaza códigos inválidos o fuera de ventana", () => {
    const nowMs = 1111111109 * 1000;
    const step = Math.floor(nowMs / 1000 / 30);
    assert.equal(verifyTotp(rfcSecret, "081804", { nowMs }), step);
    assert.equal(verifyTotp(rfcSecret, "081 804", { nowMs }), step);
    assert.equal(verifyTotp(rfcSecret, hotp(rfcSecret, step - 1), { nowMs }), step - 1);
    assert.equal(verifyTotp(rfcSecret, hotp(rfcSecret, step - 2), { nowMs }), null);
    assert.equal(verifyTotp(rfcSecret, "abcdef", { nowMs }), null);
    assert.equal(verifyTotp(rfcSecret, "12345", { nowMs }), null);
  });

  test("no reutiliza un paso ya usado", () => {
    const nowMs = 1111111109 * 1000;
    const step = Math.floor(nowMs / 1000 / 30);
    assert.equal(verifyTotp(rfcSecret, hotp(rfcSecret, step), { nowMs, lastUsedStep: step }), null);
    assert.equal(verifyTotp(rfcSecret, hotp(rfcSecret, step + 1), { nowMs, lastUsedStep: step }), step + 1);
  });

  test("la URI otpauth lleva el emisor, la cuenta y el secreto en base32", () => {
    const uri = buildOtpauthUri({ secret: rfcSecret, accountName: "admin@leurettech.com", issuer: "Leuret" });
    assert.ok(uri.startsWith("otpauth://totp/Leuret:admin%40leurettech.com?"));
    assert.ok(uri.includes(`secret=${base32Encode(rfcSecret)}`));
    assert.ok(uri.includes("digits=6") && uri.includes("period=30"));
  });
});

describe("Cifrado y códigos de recuperación", () => {
  beforeAll(() => {
    (env as unknown as { MFA_ENCRYPTION_KEY: string }).MFA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });

  test("el secreto cifrado se recupera y no se repite el texto cifrado", () => {
    const secret = randomBytes(20);
    const first = encryptMfaSecret(secret);
    const second = encryptMfaSecret(secret);
    assert.notEqual(first.ciphertext, second.ciphertext);
    assert.deepEqual(decryptMfaSecret(first.ciphertext, first.iv), secret);
  });

  test("un texto cifrado alterado se rechaza", () => {
    const encrypted = encryptMfaSecret(randomBytes(20));
    const bytes = Buffer.from(encrypted.ciphertext, "base64");
    bytes[0] = bytes[0]! ^ 0xff;
    assert.throws(() => decryptMfaSecret(bytes.toString("base64"), encrypted.iv));
  });

  test("genera 10 códigos únicos, legibles y con hash estable", () => {
    const codes = generateRecoveryCodes();
    assert.equal(codes.length, 10);
    assert.equal(new Set(codes).size, 10);
    for (const code of codes) assert.match(code, /^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
    const code = codes[0]!;
    assert.equal(hashRecoveryCode(code), hashRecoveryCode(code.toLowerCase().replace("-", " ")));
    assert.equal(normalizeRecoveryCode("ab-cd 12"), "ABCD12");
    assert.notEqual(hashRecoveryCode(codes[0]!), hashRecoveryCode(codes[1]!));
  });
});
