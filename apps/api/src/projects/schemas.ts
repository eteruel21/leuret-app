import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const projectStatusSchema = z.enum([
  "lead",
  "inspection",
  "quoted",
  "approved",
  "in_progress",
  "paused",
  "completed",
  "cancelled"
]);

export const projectParamsSchema = z.object({
  projectId: uuidSchema
});

export const projectQuerySchema = z.object({
  companyId: uuidSchema,
  clientId: uuidSchema.optional()
});

export const companyQuerySchema = z.object({
  companyId: uuidSchema
});

export const createProjectSchema = z.object({
  companyId: uuidSchema,
  clientId: uuidSchema,
  addressId: uuidSchema.nullable().optional(),
  name: z.string().trim().min(2).max(250),
  description: z.string().trim().max(3000).optional().default(""),
  budgetEstimate: z.number().min(0).optional().default(0)
});

export const statusSchema = z.object({
  companyId: uuidSchema,
  status: projectStatusSchema
});

export const progressSchema = z.object({
  companyId: uuidSchema,
  progressPercentage: z.number().min(0).max(100)
});

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa fechas con formato AAAA-MM-DD.");

/** Datos de la obra que el equipo puede corregir después de crearla. */
export const updateProjectSchema = z
  .object({
    companyId: uuidSchema,
    name: z.string().trim().min(2).max(250).optional(),
    description: z.string().trim().max(3000).optional(),
    addressId: uuidSchema.nullable().optional(),
    startDate: dateKeySchema.nullable().optional(),
    estimatedEndDate: dateKeySchema.nullable().optional(),
    budgetEstimate: z.number().min(0).max(100_000_000).optional()
  })
  .refine(
    (input) => !input.startDate || !input.estimatedEndDate || input.estimatedEndDate >= input.startDate,
    { message: "La fecha estimada de fin no puede ser anterior al inicio.", path: ["estimatedEndDate"] }
  );
