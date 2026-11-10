import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const userParamsSchema = z.object({
  userId: uuidSchema
});

export const companyParamsSchema = z.object({
  companyId: uuidSchema
});

export const companyStatusSchema = z
  .object({
    active: z.boolean(),
    reason: z.string().trim().max(500).default("")
  })
  .refine((value) => value.active || value.reason.length >= 5, {
    message: "Indica el motivo de la suspensión (mínimo 5 caracteres).",
    path: ["reason"]
  });

export const userSchema = z.object({
  id: z.string().optional(),
  fullName: z.string().trim().max(150),
  phone: z.string().trim().max(30),
  role: z.enum(["super_admin", "contractor", "client"]),
  active: z.boolean(),
  approvedAt: z.string().nullable().optional(),
  approvedBy: z.string().nullable().optional()
});

export const categorySchema = z.object({
  id: z.string().optional().default(""),
  companyId: uuidSchema,
  name: z.string().trim().min(1).max(180),
  description: z.string().trim().max(1000).optional().default(""),
  active: z.boolean()
});

export const itemSchema = z.object({
  id: z.string().optional().default(""),
  companyId: uuidSchema,
  sku: z.string().trim().max(100).optional().default(""),
  name: z.string().trim().min(1).max(250),
  description: z.string().trim().max(3000).optional().default(""),
  itemType: z.enum(["material", "labor", "equipment", "service", "subcontract"]),
  categoryId: z.string().nullable().optional(),
  unitId: uuidSchema,
  unitCost: z.number().min(0),
  salePrice: z.number().min(0),
  wastePercentage: z.number().min(0).max(100),
  active: z.boolean()
});

export const unitSchema = z.object({
  id: z.string().optional().default(""),
  companyId: uuidSchema,
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(150),
  symbol: z.string().trim().min(1).max(30),
  unitType: z.enum(["length", "area", "volume", "weight", "unit", "time", "package", "service"]),
  conversionFactor: z.number().positive(),
  active: z.boolean()
});

export const yieldSchema = z.object({
  id: z.string().optional().default(""),
  companyId: uuidSchema,
  catalogItemId: uuidSchema,
  outputUnitId: uuidSchema,
  name: z.string().trim().min(1).max(200),
  outputQuantity: z.number().positive(),
  laborHours: z.number().min(0),
  crewSize: z.number().positive(),
  wastePercentage: z.number().min(0).max(100),
  notes: z.string().trim().max(2000).optional().default(""),
  active: z.boolean()
});

export const formulaParameterSchema = z.object({
  id: z.string().optional(),
  parameterKey: z.string().trim().min(1).max(150),
  label: z.string().trim().min(1).max(250),
  numericValue: z.number().min(0),
  unitLabel: z.string().trim().max(100).optional().default(""),
  description: z.string().trim().max(1000).optional().default(""),
  active: z.boolean(),
  sortOrder: z.number().int()
});

export const formulaSchema = z.object({
  id: z.string().optional().default(""),
  companyId: uuidSchema,
  code: z.string().trim().min(1).max(150),
  name: z.string().trim().min(1).max(250),
  description: z.string().trim().max(2000).optional().default(""),
  active: z.boolean(),
  parameters: z.array(formulaParameterSchema).optional().default([])
});

export const globalPriceParamsSchema = z.object({
  itemId: uuidSchema
});

export const globalPriceSchema = z.object({
  unitCost: z.number().min(0),
  salePrice: z.number().min(0),
  wastePercentage: z.number().min(0).max(100)
});

export const adjustPricesSchema = z.object({
  itemIds: z.array(uuidSchema).min(1),
  target: z.enum(["unit_cost", "sale_price"]),
  percentage: z.number().gt(-100),
  notes: z.string().trim().max(2000).optional().default("")
});

export function normalizeCode(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export const priceHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  itemId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional()
});

export const priceAlertsQuerySchema = z.object({
  changeThreshold: z.coerce.number().min(1).max(100).optional().default(15),
  windowDays: z.coerce.number().int().min(1).max(365).optional().default(60),
  staleDays: z.coerce.number().int().min(30).max(1095).optional().default(180),
  minMargin: z.coerce.number().min(0).max(90).optional().default(5)
});

// ----- Centro de control: listados de obras, presupuestos, facturas, clientes y auditoría

export const adminListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z
    .string()
    .trim()
    .max(60)
    .regex(/^[A-Za-z_]*$/u, "Estado no válido.")
    .optional()
    .transform((value) => (value ? value : undefined)),
  companyId: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0)
});

export const entityParamsSchema = z.object({
  id: uuidSchema
});

export const adminSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120)
});

export const revokeSessionsSchema = z.object({
  reason: z.string().trim().min(5, "Indica el motivo (mínimo 5 caracteres).").max(500)
});

export const PROJECT_STATUSES = [
  "lead",
  "inspection",
  "quoted",
  "approved",
  "in_progress",
  "paused",
  "completed",
  "cancelled"
] as const;

export const adminProjectStatusSchema = z.object({
  status: z.enum(PROJECT_STATUSES),
  reason: z.string().trim().min(5, "Indica el motivo (mínimo 5 caracteres).").max(500)
});

export const adminCancelInvoiceSchema = z.object({
  reason: z.string().trim().min(5, "Indica el motivo (mínimo 5 caracteres).").max(500)
});
