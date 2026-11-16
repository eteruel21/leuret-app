import { withUserTransaction } from "../db/with-user-transaction.js";
import type { z } from "zod";
import type { createProjectSchema, updateProjectSchema } from "./schemas.js";

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export async function findClientProjectsRepo(userId: string) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(`
      SELECT
        project.id, project.company_id, project.client_id, project.project_code, project.name,
        project.description, project.status, project.start_date, project.estimated_end_date,
        project.actual_end_date, project.progress_percentage, project.created_at, project.updated_at,
        jsonb_build_object('name', company.name) AS company
      FROM public.projects AS project
      JOIN public.clients AS customer ON customer.id = project.client_id AND customer.company_id = project.company_id
      JOIN public.companies AS company ON company.id = project.company_id
      WHERE customer.user_id = app.current_user_id()
        AND customer.active = true
        AND company.active = true
      ORDER BY project.created_at DESC
    `);
    return result.rows;
  });
}

export async function findCompanyProjectsRepo(userId: string, companyId: string, clientId?: string) {
  return withUserTransaction(userId, async (client) => {
    if (clientId) {
      const result = await client.query(
        `
          SELECT *
          FROM public.projects
          WHERE company_id = $1 AND client_id = $2 AND public.is_company_member($1)
          ORDER BY created_at DESC
        `,
        [companyId, clientId]
      );
      return result.rows;
    }

    const result = await client.query(
      `
        SELECT
          project.*,
          CASE
            WHEN customer.id IS NULL THEN NULL
            ELSE jsonb_build_object(
              'id', customer.id,
              'client_type', customer.client_type,
              'first_name', customer.first_name,
              'last_name', customer.last_name,
              'business_name', customer.business_name
            )
          END AS client
        FROM public.projects AS project
        LEFT JOIN public.clients AS customer ON customer.id = project.client_id
        WHERE project.company_id = $1 AND public.is_company_member($1)
        ORDER BY project.created_at DESC
      `,
      [companyId]
    );
    return result.rows;
  });
}

export async function createProjectRepo(userId: string, input: CreateProjectInput) {
  return withUserTransaction(userId, async (client) => {
    const sequenceResult = await client.query<{ project_code: string | null }>(
      `
        SELECT public.next_document_number($1, 'project') AS project_code
      `,
      [input.companyId]
    );

    const projectCode = sequenceResult.rows[0]?.project_code ?? null;

    const result = await client.query(
      `
        INSERT INTO public.projects (
          company_id, client_id, address_id, project_code, name, description, status, budget_estimate, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'lead', $7, app.current_user_id())
        RETURNING *
      `,
      [
        input.companyId,
        input.clientId,
        input.addressId ?? null,
        projectCode,
        input.name,
        input.description || null,
        input.budgetEstimate
      ]
    );
    return result.rows[0] ?? null;
  });
}

export async function getProjectByIdRepo(userId: string, projectId: string, companyId: string) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(
      `
        SELECT
          project.*,
          CASE WHEN customer.id IS NULL THEN NULL ELSE to_jsonb(customer) END AS client,
          CASE WHEN address.id IS NULL THEN NULL ELSE to_jsonb(address) END AS address
        FROM public.projects AS project
        LEFT JOIN public.clients AS customer ON customer.id = project.client_id
        LEFT JOIN public.client_addresses AS address ON address.id = project.address_id
        WHERE project.id = $1 AND project.company_id = $2 AND public.is_company_member($2)
        LIMIT 1
      `,
      [projectId, companyId]
    );
    return result.rows[0] ?? null;
  });
}

/**
 * Cambia el estado de la obra. Al empezar fija la fecha de inicio si faltaba,
 * y al terminar fija la fecha de fin real (en la zona horaria de la empresa).
 */
export async function updateProjectStatusRepo(userId: string, projectId: string, companyId: string, status: string) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(
      `
        UPDATE public.projects AS project
        SET status = $1::public.project_status,
            start_date = CASE
              WHEN $1 IN ('in_progress', 'completed') AND project.start_date IS NULL
                THEN (now() AT TIME ZONE COALESCE(company.timezone, 'America/Panama'))::date
              ELSE project.start_date
            END,
            actual_end_date = CASE
              WHEN $1 = 'completed'
                THEN COALESCE(project.actual_end_date, (now() AT TIME ZONE COALESCE(company.timezone, 'America/Panama'))::date)
              WHEN $1 IN ('in_progress', 'paused') THEN NULL
              ELSE project.actual_end_date
            END,
            progress_percentage = CASE WHEN $1 = 'completed' THEN 100 ELSE project.progress_percentage END,
            updated_at = now()
        FROM public.companies AS company
        WHERE project.id = $2 AND project.company_id = $3 AND company.id = project.company_id
      `,
      [status, projectId, companyId]
    );
    return result.rowCount === 1;
  });
}

/** Corrige los datos generales de la obra. Devuelve la obra o null. */
export async function updateProjectRepo(userId: string, projectId: string, input: UpdateProjectInput) {
  return withUserTransaction(userId, async (client) => {
    if (input.addressId) {
      const address = await client.query(
        `
          SELECT 1
          FROM public.client_addresses AS address
          JOIN public.projects AS project ON project.client_id = address.client_id AND project.company_id = address.company_id
          WHERE address.id = $1 AND project.id = $2 AND project.company_id = $3
        `,
        [input.addressId, projectId, input.companyId]
      );
      if ((address.rowCount ?? 0) === 0) {
        throw new ProjectUpdateError("La dirección no pertenece al cliente de la obra.");
      }
    }

    const result = await client.query(
      `
        UPDATE public.projects
        SET
          name = COALESCE($3, name),
          description = CASE WHEN $4::text IS NULL THEN description ELSE NULLIF($4::text, '') END,
          address_id = CASE WHEN $5::boolean THEN $6::uuid ELSE address_id END,
          start_date = CASE WHEN $7::boolean THEN $8::date ELSE start_date END,
          estimated_end_date = CASE WHEN $9::boolean THEN $10::date ELSE estimated_end_date END,
          budget_estimate = COALESCE($11::numeric, budget_estimate),
          updated_at = now()
        WHERE id = $1 AND company_id = $2
        RETURNING id
      `,
      [
        projectId,
        input.companyId,
        input.name ?? null,
        input.description ?? null,
        input.addressId !== undefined,
        input.addressId ?? null,
        input.startDate !== undefined,
        input.startDate ?? null,
        input.estimatedEndDate !== undefined,
        input.estimatedEndDate ?? null,
        input.budgetEstimate ?? null
      ]
    );
    return (result.rowCount ?? 0) > 0;
  });
}

export class ProjectUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectUpdateError";
  }
}

export async function updateProjectProgressRepo(userId: string, projectId: string, companyId: string, progressPercentage: number) {
  return withUserTransaction(userId, async (client) => {
    await client.query(
      `
        UPDATE public.projects
        SET progress_percentage = $1, updated_at = now()
        WHERE id = $2 AND company_id = $3
      `,
      [progressPercentage, projectId, companyId]
    );
  });
}

export async function findCompanyRoleRepo(userId: string, companyId: string): Promise<string | null> {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query<{ role: string }>(
      `
        SELECT role::text AS role
        FROM public.company_members
        WHERE company_id = $1
          AND user_id = app.current_user_id()
          AND active = true
        LIMIT 1
      `,
      [companyId]
    );
    return result.rows[0]?.role ?? null;
  });
}
