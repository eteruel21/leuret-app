import type {
  FastifyInstance
} from "fastify";
import { z } from "zod";

import {
  authenticateRequest
} from "../auth/authenticate.js";
import {
  withUserTransaction
} from "../db/with-user-transaction.js";
import { getUserProfileDetails } from "./details.js";

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(150),

  phone: z
    .string()
    .trim()
    .max(30)
    .nullable(),
  notificationsOptIn: z.boolean().optional()
});

const updateAvatarSchema = z.object({
  avatarUrl: z.string().trim().max(1000).nullable()
});

/**
 * La foto de perfil solo puede apuntar a la imagen que el propio usuario
 * subió con POST /profile/media (ruta pública servida por esta API).
 */
export function isOwnAvatarUrl(value: string, userId: string): boolean {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return false;
  }

  return parsed.pathname === `/storage/public/profile-media/${userId}/avatar`;
}

const updateContractorSchema = z.object({
  businessName: z.string().trim().max(180).nullable(),
  idDocument: z.string().trim().max(100),
  taxId: z.string().trim().max(100).nullable(),
  taxDv: z.string().trim().max(30).nullable(),
  primaryCategory: z.string().trim().max(150).nullable(),

  specialties: z
    .array(z.string().trim().max(150))
    .nullable(),

  experienceYears: z
    .number()
    .int()
    .min(0)
    .max(80)
    .nullable(),

  workAreas: z
    .array(z.string().trim().max(150))
    .nullable(),

  professionalDescription: z
    .string()
    .trim()
    .max(3000)
    .nullable(),

  avatarUrl: z.string().trim().max(1000).nullable(),
  companyLogoUrl: z.string().trim().max(1000).nullable(),

  portfolioUrls: z
    .array(z.string().trim().max(1000))
    .nullable(),

  certifications: z
    .array(z.string().trim().max(300))
    .nullable(),

  availability: z.string().trim().max(300).nullable(),

  preferredContactMethod: z
    .string()
    .trim()
    .max(100)
    .nullable(),

  emitsInvoice: z.boolean(),
  hasTransport: z.boolean(),

  workMode: z.string().trim().max(150).nullable(),
  docIdUrl: z.string().trim().max(1000).nullable(),

  docOperationNoticeUrl: z
    .string()
    .trim()
    .max(1000)
    .nullable(),

  docTechnicalCertsUrls: z
    .array(z.string().trim().max(1000))
    .nullable(),

  docReferencesUrl: z
    .string()
    .trim()
    .max(1000)
    .nullable(),

  docAddressProofUrl: z
    .string()
    .trim()
    .max(1000)
    .nullable()
});

export async function registerProfileRoutes(
  app: FastifyInstance
): Promise<void> {
  app.get(
    "/profile/details",
    {
      preHandler: authenticateRequest
    },
    async (request, reply) => {
      const userId = request.authenticatedUser?.id;

      if (!userId) {
        return reply.status(401).send({
          message: "Se requiere autenticación."
        });
      }

      const profile = await getUserProfileDetails(userId, userId);

      if (!profile) {
        return reply.status(404).send({
          message: "No se encontró el perfil."
        });
      }

      reply.header("Cache-Control", "private, no-store");
      return profile;
    }
  );

  app.patch(
    "/profile",
    {
      preHandler: authenticateRequest
    },
    async (request, reply) => {
      const userId =
        request.authenticatedUser?.id;

      if (!userId) {
        return reply.status(401).send({
          message: "Se requiere autenticación."
        });
      }

      const parsedBody =
        updateProfileSchema.safeParse(request.body);

      if (!parsedBody.success) {
        return reply.status(400).send({
          message:
            "Los datos del perfil no son válidos.",
          fields:
            parsedBody.error.flatten().fieldErrors
        });
      }

      const { fullName, phone, notificationsOptIn } =
        parsedBody.data;

      const updated = await withUserTransaction(
        userId,
        async (client) => {
          const result = await client.query<{
            id: string;
          }>(
            `
              UPDATE public.profiles
              SET
                full_name = $1,
                phone = $2,
                notifications_opt_in = COALESCE($3, notifications_opt_in),
                updated_at = now()
              WHERE id = app.current_user_id()
              RETURNING id
            `,
            [
              fullName,
              phone,
              notificationsOptIn ?? null
            ]
          );

          return result.rows[0] ?? null;
        }
      );

      if (!updated) {
        return reply.status(404).send({
          message: "No se encontró el perfil."
        });
      }

      return {
        success: true
      };
    }
  );

  app.patch(
    "/profile/avatar",
    {
      preHandler: authenticateRequest
    },
    async (request, reply) => {
      const userId =
        request.authenticatedUser?.id;

      if (!userId) {
        return reply.status(401).send({
          message: "Se requiere autenticación."
        });
      }

      const parsedBody =
        updateAvatarSchema.safeParse(request.body);

      const avatarUrl = parsedBody.success
        ? parsedBody.data.avatarUrl || null
        : null;

      if (
        !parsedBody.success ||
        (avatarUrl !== null && !isOwnAvatarUrl(avatarUrl, userId))
      ) {
        return reply.status(400).send({
          message: "La foto de perfil no es válida."
        });
      }

      const updated = await withUserTransaction(
        userId,
        async (client) => {
          const result = await client.query<{
            id: string;
          }>(
            `
              UPDATE public.profiles
              SET
                avatar_url = $1,
                updated_at = now()
              WHERE id = app.current_user_id()
              RETURNING id
            `,
            [avatarUrl]
          );

          return result.rows[0] ?? null;
        }
      );

      if (!updated) {
        return reply.status(404).send({
          message: "No se encontró el perfil."
        });
      }

      return {
        success: true,
        avatarUrl
      };
    }
  );

  app.patch(
    "/profile/contractor",
    {
      preHandler: authenticateRequest
    },
    async (request, reply) => {
      const userId =
        request.authenticatedUser?.id;

      if (!userId) {
        return reply.status(401).send({
          message: "Se requiere autenticación."
        });
      }

      const parsedBody =
        updateContractorSchema.safeParse(
          request.body
        );

      if (!parsedBody.success) {
        return reply.status(400).send({
          message:
            "Los datos profesionales no son válidos.",
          fields:
            parsedBody.error.flatten().fieldErrors
        });
      }

      const input = parsedBody.data;

      const updated = await withUserTransaction(
        userId,
        async (client) => {
          const result = await client.query<{
            id: string;
          }>(
            `
              UPDATE public.profiles
              SET
                business_name = $1,
                id_document = $2,
                tax_id = $3,
                tax_dv = $4,
                primary_category = $5,
                specialties = $6,
                experience_years = $7,
                work_areas = $8,
                professional_description = $9,
                avatar_url = $10,
                company_logo_url = $11,
                portfolio_urls = $12,
                certifications = $13,
                availability = $14,
                preferred_contact_method = $15,
                emits_invoice = $16,
                has_transport = $17,
                work_mode = $18,
                doc_id_url = $19,
                doc_operation_notice_url = $20,
                doc_technical_certs_urls = $21,
                doc_references_url = $22,
                doc_address_proof_url = $23,
                contractor_requested_at = CASE
                  WHEN active AND contractor_approved_at IS NULL
                    AND NULLIF($2, '') IS NOT NULL AND NULLIF($5, '') IS NOT NULL
                    THEN COALESCE(contractor_requested_at, now())
                  ELSE contractor_requested_at
                END,
                updated_at = now()
              WHERE id = app.current_user_id()
                AND (
                  role = 'contractor'
                  OR (role = 'client' AND active AND (
                    contractor_approved_at IS NOT NULL OR EXISTS (
                      SELECT 1
                      FROM public.company_members AS member
                      JOIN public.companies AS company ON company.id = member.company_id AND company.active
                      WHERE member.user_id = app.current_user_id() AND member.active
                    )
                  ))
                )
              RETURNING id
            `,
            [
              input.businessName,
              input.idDocument,
              input.taxId,
              input.taxDv,
              input.primaryCategory,
              input.specialties,
              input.experienceYears,
              input.workAreas,
              input.professionalDescription,
              input.avatarUrl,
              input.companyLogoUrl,
              input.portfolioUrls,
              input.certifications,
              input.availability,
              input.preferredContactMethod,
              input.emitsInvoice,
              input.hasTransport,
              input.workMode,
              input.docIdUrl,
              input.docOperationNoticeUrl,
              input.docTechnicalCertsUrls,
              input.docReferencesUrl,
              input.docAddressProofUrl
            ]
          );

          return result.rows[0] ?? null;
        }
      );

      if (!updated) {
        return reply.status(404).send({
          message:
            "No se encontró un perfil de contratista."
        });
      }

      return {
        success: true
      };
    }
  );
}
