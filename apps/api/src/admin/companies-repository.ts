import { withUserTransaction } from "../db/with-user-transaction.js";

/**
 * Vista de empresas para el super administrador. Solo lee tablas con
 * política de lectura para super admin (companies, company_members,
 * profiles, projects, clients), así que respeta RLS.
 */
export async function listAdminCompaniesRepo(userId: string) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(`
      SELECT
        company.id,
        company.name,
        company.legal_name,
        company.tax_id,
        company.email,
        company.phone,
        company.active,
        company.created_at,
        owner_info.owner_name,
        owner_info.owner_email,
        COALESCE(member_stats.member_count, 0)::integer AS member_count,
        COALESCE(member_stats.active_member_count, 0)::integer AS active_member_count,
        COALESCE(project_stats.project_count, 0)::integer AS project_count,
        COALESCE(project_stats.active_project_count, 0)::integer AS active_project_count,
        COALESCE(client_stats.client_count, 0)::integer AS client_count,
        GREATEST(company.updated_at, project_stats.last_project_update, client_stats.last_client_update) AS last_activity_at
      FROM public.companies AS company
      LEFT JOIN LATERAL (
        SELECT
          count(*) AS member_count,
          count(*) FILTER (WHERE member.active) AS active_member_count
        FROM public.company_members AS member
        WHERE member.company_id = company.id
      ) AS member_stats ON true
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(NULLIF(trim(profile.full_name), ''), auth_user.email) AS owner_name,
          auth_user.email AS owner_email
        FROM public.company_members AS member
        JOIN app_auth.users AS auth_user ON auth_user.id = member.user_id
        LEFT JOIN public.profiles AS profile ON profile.id = member.user_id
        WHERE member.company_id = company.id
          AND member.role = 'owner'
        ORDER BY member.active DESC, member.created_at ASC
        LIMIT 1
      ) AS owner_info ON true
      LEFT JOIN LATERAL (
        SELECT
          count(*) AS project_count,
          count(*) FILTER (WHERE project.status IN ('approved', 'in_progress')) AS active_project_count,
          max(project.updated_at) AS last_project_update
        FROM public.projects AS project
        WHERE project.company_id = company.id
      ) AS project_stats ON true
      LEFT JOIN LATERAL (
        SELECT
          count(*) AS client_count,
          max(customer.updated_at) AS last_client_update
        FROM public.clients AS customer
        WHERE customer.company_id = company.id
      ) AS client_stats ON true
      ORDER BY company.created_at DESC
    `);
    return result.rows;
  });
}

export async function findAdminCompanyDetailRepo(userId: string, companyId: string) {
  return withUserTransaction(userId, async (client) => {
    const company = await client.query(
      `
        SELECT
          id, name, legal_name, tax_id, email, phone, address, active,
          currency_code, timezone, created_at, updated_at
        FROM public.companies
        WHERE id = $1
      `,
      [companyId]
    );

    if (!company.rows[0]) return null;

    const members = await client.query(
      `
        SELECT
          member.id,
          member.user_id,
          member.role,
          member.active,
          member.created_at,
          auth_user.email,
          COALESCE(NULLIF(trim(profile.full_name), ''), auth_user.email) AS full_name,
          profile.phone,
          profile.active AS profile_active
        FROM public.company_members AS member
        JOIN app_auth.users AS auth_user ON auth_user.id = member.user_id
        LEFT JOIN public.profiles AS profile ON profile.id = member.user_id
        WHERE member.company_id = $1
        ORDER BY member.active DESC, member.created_at ASC
      `,
      [companyId]
    );

    const projects = await client.query(
      `
        SELECT id, name, project_code, status, progress_percentage::double precision AS progress_percentage, updated_at
        FROM public.projects
        WHERE company_id = $1
        ORDER BY updated_at DESC
        LIMIT 5
      `,
      [companyId]
    );

    return {
      company: company.rows[0],
      members: members.rows,
      recentProjects: projects.rows
    };
  });
}
