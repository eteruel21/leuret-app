import { z } from "zod";

const uuid = z.string().uuid();

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));

const optionalAmount = z
  .number()
  .nonnegative()
  .lt(100_000_000)
  .nullable()
  .optional()
  .transform((value) => value ?? null);

export const jobRequestTimingSchema = z.enum(["urgent", "this_week", "this_month", "flexible"]);

export const createJobRequestSchema = z
  .object({
    title: z.string().trim().min(5).max(120),
    description: z.string().trim().min(20).max(4000),
    category: z.string().trim().min(2).max(60),
    province: z.string().trim().min(2).max(60),
    district: optionalText(80),
    corregimiento: optionalText(80),
    addressLine: z.string().trim().min(3).max(300),
    reference: optionalText(300),
    timing: jobRequestTimingSchema.default("flexible"),
    budgetMin: optionalAmount,
    budgetMax: optionalAmount
  })
  .refine(
    (value) => value.budgetMin === null || value.budgetMax === null || value.budgetMin <= value.budgetMax,
    { message: "El mínimo no puede ser mayor que el máximo.", path: ["budgetMin"] }
  );

export type CreateJobRequestInput = z.infer<typeof createJobRequestSchema>;

export const requestParamsSchema = z.object({ requestId: uuid });

export const photoParamsSchema = z.object({ requestId: uuid, photoId: uuid });

export const companyParamsSchema = z.object({ companyId: uuid });

export const companyRequestParamsSchema = z.object({ companyId: uuid, requestId: uuid });

export const conversationParamsSchema = z.object({ requestId: uuid, companyId: uuid });

export const closeJobRequestSchema = z.object({
  reason: optionalText(500)
});

export const imageMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;

export const uploadJobRequestPhotoSchema = z.object({
  fileData: z.string().min(1).max(8_000_000),
  mimeType: z.enum(imageMimeTypes).default("image/jpeg")
});

export const sendJobRequestMessageSchema = z
  .object({
    body: optionalText(2000),
    fileData: z.string().min(1).max(8_000_000).nullable().optional(),
    mimeType: z.enum(imageMimeTypes).nullable().optional()
  })
  .refine((value) => Boolean(value.body) || Boolean(value.fileData), {
    message: "Escribe un mensaje o adjunta una foto."
  });

export const feedScopeSchema = z.enum(["matching", "all", "engaged"]);

export const feedQuerySchema = z.object({
  scope: feedScopeSchema.default("matching"),
  search: z.string().trim().max(120).optional().transform((value) => value || null),
  category: z.string().trim().max(60).optional().transform((value) => value || null),
  province: z.string().trim().max(60).optional().transform((value) => value || null),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0)
});

export type FeedQuery = z.infer<typeof feedQuerySchema>;
