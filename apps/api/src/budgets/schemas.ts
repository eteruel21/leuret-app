import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const budgetParamsSchema = z.object({
  budgetId: uuidSchema
});

export const budgetItemParamsSchema = z.object({
  budgetId: uuidSchema,
  itemId: uuidSchema
});

export const listBudgetSchema = z.object({
  companyId: uuidSchema,
  projectId: uuidSchema.optional()
});

export const companyQuerySchema = z.object({
  companyId: uuidSchema
});

export const createBudgetSchema = z.object({
  companyId: uuidSchema,
  projectId: uuidSchema,

  title: z
    .string()
    .trim()
    .max(250)
    .optional()
    .default("")
});

export const budgetItemTypeSchema = z.enum([
  "material",
  "labor",
  "equipment",
  "service",
  "subcontract",
  "manual"
]);

export const budgetItemMaterialSchema = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.number().positive().max(1_000_000),
  unit: z.string().trim().min(1).max(40),
  cost: z.number().min(0).max(100_000_000).optional()
});

export const createBudgetItemSchema = z.object({
  companyId: uuidSchema,

  sectionId:
    uuidSchema.nullable().optional(),

  catalogItemId:
    uuidSchema.nullable().optional(),

  platformCatalogItemId:
    uuidSchema.nullable().optional(),

  itemType:
    budgetItemTypeSchema
      .optional()
      .default("manual"),

  description: z
    .string()
    .trim()
    .min(2)
    .max(1000),

  unitName: z
    .string()
    .trim()
    .max(100)
    .optional()
    .default("unidad"),

  quantity: z.number().positive(),
  unitPrice: z.number().min(0),

  unitCost: z
    .number()
    .min(0)
    .optional()
    .default(0),

  discountPercentage: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .default(0),

  taxable: z
    .boolean()
    .optional()
    .default(true),

  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .default(""),

  materials: z
    .array(budgetItemMaterialSchema)
    .max(50)
    .nullable()
    .optional()
});

/** Nuevo presupuesto para un cliente, con su primera partida en una sola operación. */
export const createClientBudgetSchema = z.object({
  companyId: uuidSchema,
  clientId: uuidSchema,
  title: z.string().trim().min(2).max(250),
  item: createBudgetItemSchema.omit({ companyId: true })
});

/** Cambios en una partida de un borrador. Solo se cambia lo que se envía. */
export const updateBudgetItemSchema = z.object({
  companyId: uuidSchema,
  description: z.string().trim().min(2).max(1000).optional(),
  unitName: z.string().trim().min(1).max(100).optional(),
  quantity: z.number().positive().max(100_000_000).optional(),
  unitPrice: z.number().min(0).max(100_000_000).optional(),
  unitCost: z.number().min(0).max(100_000_000).optional(),
  discountPercentage: z.number().min(0).max(100).optional(),
  taxable: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional()
});

export const budgetDiscountTypeSchema = z.enum(["none", "percent", "fixed"]);

/** Datos generales de un borrador: título, descuento, ITBMS y condiciones. */
export const updateBudgetSchema = z
  .object({
    companyId: uuidSchema,
    title: z.string().trim().min(2).max(250).optional(),
    description: z.string().trim().max(3000).optional(),
    discountType: budgetDiscountTypeSchema.optional(),
    discountValue: z.number().min(0).max(100_000_000).optional(),
    taxRate: z.number().min(0).max(100).optional(),
    terms: z.string().trim().max(5000).optional(),
    notes: z.string().trim().max(5000).optional()
  })
  .refine(
    (input) => !(input.discountType === "percent" && (input.discountValue ?? 0) > 100),
    { message: "El descuento porcentual no puede pasar de 100 %.", path: ["discountValue"] }
  );

export const approveBudgetSchema = z.object({
  companyId: uuidSchema.optional()
});

export const sendBudgetSchema = z.object({
  companyId: uuidSchema,
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La vigencia debe tener formato AAAA-MM-DD.")
    .nullable()
    .optional()
});

export const reopenBudgetSchema = z.object({
  companyId: uuidSchema
});

export const rejectBudgetSchema = z.object({
  companyId: uuidSchema.optional(),
  rejectionReason: z.string().trim().min(2, "El motivo de rechazo es obligatorio.").max(2000)
});

export const convertCalculationSchema = z.object({
  companyId: uuidSchema,
  calculationId: uuidSchema.optional(),
  sectionId: uuidSchema.optional(),
  items: z.array(createBudgetItemSchema.omit({ companyId: true })).optional()
});

export const applyPriceUpdatesSchema = z.object({
  companyId: uuidSchema,
  itemIds: z.array(uuidSchema).min(1).max(500)
});
