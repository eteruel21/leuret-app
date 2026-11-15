import { z } from "zod";

import { registrationLegalConfirmations } from "../account/legal-acceptances.js";

const uuidSchema = z.string().uuid();
const clientTypeSchema = z.enum(["native", "web", "app-web"]).optional();
const newPasswordSchema = z.string().min(8).max(72)
  .refine((password) => new TextEncoder().encode(password).length <= 72, "La contraseña admite hasta 72 bytes.");

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),

  password: z.string().min(1).max(128),
  captchaToken: z.string().trim().min(1).max(2048),
  clientType: clientTypeSchema
});

export const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),

  phone: z
    .string()
    .trim()
    .min(7)
    .max(30)
    .refine((value) => {
      const digits = value.replace(/\D/g, "");
      return digits.length >= 7 && digits.length <= 15;
    }, "Teléfono inválido."),

  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),

  password: newPasswordSchema,

  role: z
    .enum(["contractor", "client"])
    .default("client"),

  province: z.string().trim().min(1).max(100),
  district: z.string().trim().min(1).max(100),
  corregimiento: z.string().trim().min(1).max(100),

  legalConfirmations: registrationLegalConfirmations,

  notificationsOptIn: z
    .boolean()
    .default(false),

  registrationDevice: z
    .string()
    .trim()
    .max(250)
    .optional()
    .default(""),

  captchaToken: z
    .string()
    .trim()
    .min(1)
    .max(2048)
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(40).max(500).optional(),
  clientType: clientTypeSchema,
  sessionId: uuidSchema.optional()
});

export const logoutSchema = z.object({ clientType: clientTypeSchema });

export const verifyEmailSchema = z.object({
  token: z.string().trim().length(64)
});

export const resendVerificationSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  captchaToken: z.string().trim().min(1).max(2048)
});

export const recoverPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  captchaToken: z.string().trim().min(1).max(2048)
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().length(64),
  newPassword: newPasswordSchema
});

export const revokeSessionSchema = z.object({
  sessionId: uuidSchema
});
