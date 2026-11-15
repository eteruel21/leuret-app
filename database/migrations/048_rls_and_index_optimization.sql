BEGIN;

SET ROLE contractor_owner;

-- Optimización de PostgreSQL / Supabase (nov-2026).
--
-- Diagnóstico (producción y réplica local con 50 empresas, 10 000
-- presupuestos y 100 000 partidas):
--   * Las políticas RLS llamaban a is_company_member(company_id),
--     is_company_admin(...) y has_company_role(...) UNA VEZ POR FILA. Contar
--     2 000 partidas de una empresa tardaba 52,7 ms con RLS frente a 0,26 ms
--     sin RLS; un listado sin filtro de empresa (100 000 filas), 5,2 s.
--   * 53 tablas tenían varias políticas permisivas para la misma acción
--     (asesor multiple_permissive_policies): todas se evalúan en cada fila.
--   * 23 índices redundantes (otro índice empieza por las mismas columnas) y
--     una FK sin índice (client_connection_requests.requested_by).
--   * El recordatorio de pagos recorría todas las facturas abiertas cada
--     5 minutos.
--
-- Cambios (sin cambiar quién ve ni quién modifica cada fila):
--   1. Funciones que devuelven las empresas del usuario como arreglo. Las
--      políticas las usan como (SELECT …)::uuid[]: se calculan una vez por
--      consulta (InitPlan) y permiten usar índices.
--   2. Políticas reescritas y fusionadas: una permisiva por tabla y acción.
--      Generado con database/scripts/rls/generate_rls_consolidation.py y
--      comprobado con database/scripts/rls/verify_rls_equivalence.sql:
--      0 diferencias en 3,5 millones de evaluaciones (186 expresiones,
--      17 perfiles de usuario: cada rol, membresía/perfil/empresa inactivos,
--      clientes vinculados, superadministrador y sin sesión).
--   3. Índices: se agrega el de la FK y se quitan los redundantes.
--   4. Recordatorios de pago: prefiltro de fecha con índice parcial.
--   5. RLS activado en las tablas privadas de eliminación de cuenta
--      (producción ya lo tenía en account_deletion_records; solo las usan
--      funciones SECURITY DEFINER, contractor_api no tiene permisos).
--
-- Bloqueos: DROP/CREATE POLICY toma un bloqueo exclusivo breve de cada
-- tabla. lock_timeout hace que la migración falle rápido (y se pueda
-- reintentar) en lugar de dejar en espera a la API.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- 1. Funciones auxiliares para RLS ------------------------------------------
--
-- Devuelven el arreglo de empresas del usuario actual. Las políticas las
-- llaman como (SELECT ...), así PostgreSQL las ejecuta una sola vez por
-- consulta (InitPlan) en lugar de una vez por fila.

CREATE OR REPLACE FUNCTION private.member_company_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- Mismo criterio que public.is_company_member(): membresía activa.
  SELECT COALESCE(pg_catalog.array_agg(member.company_id), '{}'::uuid[])
  FROM public.company_members AS member
  WHERE member.user_id = (SELECT app.current_user_id())
    AND member.active = true;
$$;

CREATE OR REPLACE FUNCTION private.member_company_ids(
  p_roles public.company_role[]
)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- Mismo criterio que public.is_company_admin() / is_company_owner().
  SELECT COALESCE(pg_catalog.array_agg(member.company_id), '{}'::uuid[])
  FROM public.company_members AS member
  WHERE member.user_id = (SELECT app.current_user_id())
    AND member.active = true
    AND member.role = ANY (p_roles);
$$;

CREATE OR REPLACE FUNCTION private.active_role_company_ids(
  p_roles public.company_role[]
)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- Mismo criterio que public.has_company_role(): usuario de la plataforma
  -- activo, empresa activa y membresía activa con uno de los roles.
  SELECT COALESCE(pg_catalog.array_agg(member.company_id), '{}'::uuid[])
  FROM public.company_members AS member
  JOIN public.companies AS company
    ON company.id = member.company_id
   AND company.active = true
  WHERE member.user_id = (SELECT app.current_user_id())
    AND member.active = true
    AND member.role = ANY (p_roles)
    AND (SELECT private.is_active_platform_user());
$$;

REVOKE ALL ON FUNCTION private.member_company_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.member_company_ids(public.company_role[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.active_role_company_ids(public.company_role[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.member_company_ids() TO contractor_api;
GRANT EXECUTE ON FUNCTION private.member_company_ids(public.company_role[]) TO contractor_api;
GRANT EXECUTE ON FUNCTION private.active_role_company_ids(public.company_role[]) TO contractor_api;

-- is_active_platform_user() solo lee el perfil y el usuario propios. Como
-- SECURITY DEFINER evita evaluar las políticas de profiles dentro de cada
-- política restrictiva; el resultado es el mismo (cada usuario siempre ve
-- su propio perfil).
ALTER FUNCTION private.is_active_platform_user() SECURITY DEFINER;

-- 2. Políticas RLS -----------------------------------------------------------
--
-- Las políticas restrictivas (approved_platform_users_only, etc.) se
-- conservan; solo cambian las llamadas por fila dentro de ellas.

-- public.activities
DROP POLICY activities_delete_policy ON public.activities;

DROP POLICY activities_insert_policy ON public.activities;

DROP POLICY activities_select_for_linked_client ON public.activities;

DROP POLICY activities_select_policy ON public.activities;

DROP POLICY activities_super_admin_select ON public.activities;

DROP POLICY activities_update_policy ON public.activities;

-- Reemplaza: activities_select_for_linked_client, activities_select_policy, activities_super_admin_select
CREATE POLICY activities_select_access ON public.activities
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[]))) OR (((status <> 'cancelled'::text) AND ((EXISTS ( SELECT 1
   FROM public.clients customer
  WHERE ((customer.id = activities.client_id) AND (customer.company_id = activities.company_id) AND (customer.user_id = ( SELECT app.current_user_id() AS current_user_id)) AND (customer.active = true)))) OR (EXISTS ( SELECT 1
   FROM (public.projects project
     JOIN public.clients customer ON (((customer.id = project.client_id) AND (customer.company_id = project.company_id))))
  WHERE ((project.id = activities.project_id) AND (project.company_id = activities.company_id) AND (customer.user_id = ( SELECT app.current_user_id() AS current_user_id)) AND (customer.active = true)))))))));

-- Reemplaza: activities_insert_policy
CREATE POLICY activities_insert_access ON public.activities
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])));

-- Reemplaza: activities_update_policy
CREATE POLICY activities_update_access ON public.activities
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])))
  WITH CHECK ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])));

-- Reemplaza: activities_delete_policy
CREATE POLICY activities_delete_access ON public.activities
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'supervisor'::public.company_role]) AS active_role_company_ids)::uuid[])));

-- public.admin_audit_logs
DROP POLICY admin_audit_logs_insert_policy ON public.admin_audit_logs;

DROP POLICY admin_audit_logs_select_policy ON public.admin_audit_logs;

DROP POLICY admin_audit_logs_super_admin_company_status_insert ON public.admin_audit_logs;

DROP POLICY admin_audit_logs_super_admin_select ON public.admin_audit_logs;

-- Reemplaza: admin_audit_logs_select_policy, admin_audit_logs_super_admin_select
CREATE POLICY admin_audit_logs_select_access ON public.admin_audit_logs
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))));

-- Reemplaza: admin_audit_logs_insert_policy, admin_audit_logs_super_admin_company_status_insert
CREATE POLICY admin_audit_logs_insert_access ON public.admin_audit_logs
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK ((((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[]))) OR ((( SELECT private.is_super_admin() AS is_super_admin) AND (user_id = ( SELECT app.current_user_id() AS current_user_id)) AND (action = ANY (ARRAY['COMPANY_SUSPENDED'::text, 'COMPANY_REACTIVATED'::text, 'ADMIN_SESSIONS_REVOKED'::text]))))));

-- public.budget_change_history
ALTER POLICY budget_change_history_insert_policy ON public.budget_change_history
  WITH CHECK (((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])) OR (EXISTS ( SELECT 1
   FROM (public.budgets b
     JOIN public.clients c ON ((c.id = b.client_id)))
  WHERE ((b.id = budget_change_history.budget_id) AND (c.user_id = ( SELECT app.current_user_id() AS current_user_id)))))));

ALTER POLICY budget_change_history_select_policy ON public.budget_change_history
  USING ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role]) AS active_role_company_ids)::uuid[])));

-- public.budget_items
DROP POLICY "Members can delete budget items" ON public.budget_items;

DROP POLICY "Members can insert budget items" ON public.budget_items;

DROP POLICY "Members can read budget items" ON public.budget_items;

DROP POLICY "Members can update budget items" ON public.budget_items;

DROP POLICY budget_items_select_for_linked_client ON public.budget_items;

DROP POLICY budget_items_super_admin_select ON public.budget_items;

-- Reemplaza: Members can read budget items, budget_items_select_for_linked_client, budget_items_super_admin_select
CREATE POLICY budget_items_select_access ON public.budget_items
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[]))) OR ((EXISTS ( SELECT 1
   FROM (public.budgets budget
     JOIN public.clients client ON (((client.id = budget.client_id) AND (client.company_id = budget.company_id))))
  WHERE ((budget.id = budget_items.budget_id) AND (budget.company_id = budget_items.company_id) AND (budget.status = ANY (ARRAY['sent'::public.budget_status, 'viewed'::public.budget_status, 'approved'::public.budget_status, 'rejected'::public.budget_status, 'expired'::public.budget_status])) AND (client.user_id = ( SELECT app.current_user_id() AS uid)) AND (client.active = true)))))));

-- Reemplaza: Members can insert budget items
CREATE POLICY budget_items_insert_access ON public.budget_items
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])));

-- Reemplaza: Members can update budget items
CREATE POLICY budget_items_update_access ON public.budget_items
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])))
  WITH CHECK ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])));

-- Reemplaza: Members can delete budget items
CREATE POLICY budget_items_delete_access ON public.budget_items
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])));

-- public.budget_sections
DROP POLICY "Members can delete budget sections" ON public.budget_sections;

DROP POLICY "Members can insert budget sections" ON public.budget_sections;

DROP POLICY "Members can read budget sections" ON public.budget_sections;

DROP POLICY "Members can update budget sections" ON public.budget_sections;

DROP POLICY budget_sections_select_for_linked_client ON public.budget_sections;

DROP POLICY budget_sections_super_admin_select ON public.budget_sections;

-- Reemplaza: Members can read budget sections, budget_sections_select_for_linked_client, budget_sections_super_admin_select
CREATE POLICY budget_sections_select_access ON public.budget_sections
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[]))) OR ((EXISTS ( SELECT 1
   FROM (public.budgets budget
     JOIN public.clients client ON (((client.id = budget.client_id) AND (client.company_id = budget.company_id))))
  WHERE ((budget.id = budget_sections.budget_id) AND (budget.company_id = budget_sections.company_id) AND (budget.status = ANY (ARRAY['sent'::public.budget_status, 'viewed'::public.budget_status, 'approved'::public.budget_status, 'rejected'::public.budget_status, 'expired'::public.budget_status])) AND (client.user_id = ( SELECT app.current_user_id() AS uid)) AND (client.active = true)))))));

-- Reemplaza: Members can insert budget sections
CREATE POLICY budget_sections_insert_access ON public.budget_sections
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])));

-- Reemplaza: Members can update budget sections
CREATE POLICY budget_sections_update_access ON public.budget_sections
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])))
  WITH CHECK ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])));

-- Reemplaza: Members can delete budget sections
CREATE POLICY budget_sections_delete_access ON public.budget_sections
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])));

-- public.budget_versions
DROP POLICY "Admins can delete budget versions" ON public.budget_versions;

DROP POLICY "Members can insert budget versions" ON public.budget_versions;

DROP POLICY "Members can read budget versions" ON public.budget_versions;

DROP POLICY budget_versions_super_admin_select ON public.budget_versions;

-- Reemplaza: Members can read budget versions, budget_versions_super_admin_select
CREATE POLICY budget_versions_select_access ON public.budget_versions
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])))));

-- Reemplaza: Members can insert budget versions
CREATE POLICY budget_versions_insert_access ON public.budget_versions
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])) AND (created_by = ( SELECT app.current_user_id() AS current_user_id))));

-- Reemplaza: Admins can delete budget versions
CREATE POLICY budget_versions_delete_access ON public.budget_versions
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])));

-- public.budgets
DROP POLICY "Admins can delete budgets" ON public.budgets;

DROP POLICY "Members can insert budgets" ON public.budgets;

DROP POLICY "Members can read budgets" ON public.budgets;

DROP POLICY "Members can update budgets" ON public.budgets;

DROP POLICY budgets_select_for_linked_client ON public.budgets;

DROP POLICY budgets_super_admin_select ON public.budgets;

-- Reemplaza: Members can read budgets, budgets_select_for_linked_client, budgets_super_admin_select
CREATE POLICY budgets_select_access ON public.budgets
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[]))) OR (((status = ANY (ARRAY['sent'::public.budget_status, 'viewed'::public.budget_status, 'approved'::public.budget_status, 'rejected'::public.budget_status, 'expired'::public.budget_status])) AND (EXISTS ( SELECT 1
   FROM public.clients client
  WHERE ((client.id = budgets.client_id) AND (client.company_id = budgets.company_id) AND (client.user_id = ( SELECT app.current_user_id() AS uid)) AND (client.active = true))))))));

-- Reemplaza: Members can insert budgets
CREATE POLICY budgets_insert_access ON public.budgets
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role]) AS active_role_company_ids)::uuid[])));

-- Reemplaza: Members can update budgets
CREATE POLICY budgets_update_access ON public.budgets
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])))
  WITH CHECK ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])));

-- Reemplaza: Admins can delete budgets
CREATE POLICY budgets_delete_access ON public.budgets
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS active_role_company_ids)::uuid[])));

-- public.calculation_formula_parameter_history
ALTER POLICY calculation_history_select_member ON public.calculation_formula_parameter_history
  USING ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])));

-- public.calculation_formula_parameters
DROP POLICY admin_web_super_admin_manages_calculation_parameters ON public.calculation_formula_parameters;

DROP POLICY calculation_parameters_admin_delete ON public.calculation_formula_parameters;

DROP POLICY calculation_parameters_admin_insert ON public.calculation_formula_parameters;

DROP POLICY calculation_parameters_admin_update ON public.calculation_formula_parameters;

DROP POLICY calculation_parameters_select_member ON public.calculation_formula_parameters;

DROP POLICY company_members_read_calculation_parameters ON public.calculation_formula_parameters;

-- Reemplaza: admin_web_super_admin_manages_calculation_parameters, calculation_parameters_select_member, company_members_read_calculation_parameters
CREATE POLICY calculation_formula_parameters_select_access ON public.calculation_formula_parameters
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[]))) OR ((( SELECT private.is_active_platform_user() AS is_active_platform_user) AND (( SELECT private.is_super_admin() AS is_super_admin) OR (EXISTS ( SELECT 1
   FROM public.company_members
  WHERE ((company_members.company_id = calculation_formula_parameters.company_id) AND (company_members.user_id = ( SELECT app.current_user_id() AS uid)) AND (company_members.active = true)))))))));

-- Reemplaza: admin_web_super_admin_manages_calculation_parameters, calculation_parameters_admin_insert
CREATE POLICY calculation_formula_parameters_insert_access ON public.calculation_formula_parameters
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))));

-- Reemplaza: admin_web_super_admin_manages_calculation_parameters, calculation_parameters_admin_update
CREATE POLICY calculation_formula_parameters_update_access ON public.calculation_formula_parameters
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))))
  WITH CHECK (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))));

-- Reemplaza: admin_web_super_admin_manages_calculation_parameters, calculation_parameters_admin_delete
CREATE POLICY calculation_formula_parameters_delete_access ON public.calculation_formula_parameters
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))));

-- public.calculation_formulas
DROP POLICY admin_web_super_admin_manages_calculation_formulas ON public.calculation_formulas;

DROP POLICY calculation_formulas_admin_delete ON public.calculation_formulas;

DROP POLICY calculation_formulas_admin_insert ON public.calculation_formulas;

DROP POLICY calculation_formulas_admin_update ON public.calculation_formulas;

DROP POLICY calculation_formulas_select_member ON public.calculation_formulas;

DROP POLICY company_members_read_calculation_formulas ON public.calculation_formulas;

-- Reemplaza: admin_web_super_admin_manages_calculation_formulas, calculation_formulas_select_member, company_members_read_calculation_formulas
CREATE POLICY calculation_formulas_select_access ON public.calculation_formulas
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[]))) OR ((( SELECT private.is_active_platform_user() AS is_active_platform_user) AND (( SELECT private.is_super_admin() AS is_super_admin) OR (EXISTS ( SELECT 1
   FROM public.company_members
  WHERE ((company_members.company_id = calculation_formulas.company_id) AND (company_members.user_id = ( SELECT app.current_user_id() AS uid)) AND (company_members.active = true)))))))));

-- Reemplaza: admin_web_super_admin_manages_calculation_formulas, calculation_formulas_admin_insert
CREATE POLICY calculation_formulas_insert_access ON public.calculation_formulas
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))));

-- Reemplaza: admin_web_super_admin_manages_calculation_formulas, calculation_formulas_admin_update
CREATE POLICY calculation_formulas_update_access ON public.calculation_formulas
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))))
  WITH CHECK (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))));

-- Reemplaza: admin_web_super_admin_manages_calculation_formulas, calculation_formulas_admin_delete
CREATE POLICY calculation_formulas_delete_access ON public.calculation_formulas
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))));

-- public.catalog_categories
DROP POLICY "Admins can delete catalog categories" ON public.catalog_categories;

DROP POLICY "Admins can insert catalog categories" ON public.catalog_categories;

DROP POLICY "Admins can update catalog categories" ON public.catalog_categories;

DROP POLICY admin_web_super_admin_manages_categories ON public.catalog_categories;

DROP POLICY admin_web_super_admin_reads_catalog_categories ON public.catalog_categories;

DROP POLICY catalog_categories_manage_company_admins ON public.catalog_categories;

DROP POLICY catalog_categories_select_company_members ON public.catalog_categories;

-- Reemplaza: admin_web_super_admin_manages_categories, admin_web_super_admin_reads_catalog_categories, catalog_categories_manage_company_admins, catalog_categories_select_company_members
CREATE POLICY catalog_categories_select_access ON public.catalog_categories
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[]))) OR ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])))));

-- Reemplaza: Admins can insert catalog categories, admin_web_super_admin_manages_categories, catalog_categories_manage_company_admins
CREATE POLICY catalog_categories_insert_access ON public.catalog_categories
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS active_role_company_ids)::uuid[]))) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))));

-- Reemplaza: Admins can update catalog categories, admin_web_super_admin_manages_categories, catalog_categories_manage_company_admins
CREATE POLICY catalog_categories_update_access ON public.catalog_categories
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS active_role_company_ids)::uuid[]))) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))))
  WITH CHECK (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS active_role_company_ids)::uuid[]))) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))));

-- Reemplaza: Admins can delete catalog categories, admin_web_super_admin_manages_categories, catalog_categories_manage_company_admins
CREATE POLICY catalog_categories_delete_access ON public.catalog_categories
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS active_role_company_ids)::uuid[]))) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))));

-- public.catalog_items
DROP POLICY "Admins can delete catalog items" ON public.catalog_items;

DROP POLICY "Admins can insert catalog items" ON public.catalog_items;

DROP POLICY "Admins can update catalog items" ON public.catalog_items;

DROP POLICY admin_web_super_admin_manages_items ON public.catalog_items;

DROP POLICY admin_web_super_admin_reads_catalog_items ON public.catalog_items;

DROP POLICY catalog_items_manage_company_admins ON public.catalog_items;

DROP POLICY catalog_items_select_company_members ON public.catalog_items;

-- Reemplaza: admin_web_super_admin_manages_items, admin_web_super_admin_reads_catalog_items, catalog_items_manage_company_admins, catalog_items_select_company_members
CREATE POLICY catalog_items_select_access ON public.catalog_items
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[]))) OR ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])))));

-- Reemplaza: Admins can insert catalog items, admin_web_super_admin_manages_items, catalog_items_manage_company_admins
CREATE POLICY catalog_items_insert_access ON public.catalog_items
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS active_role_company_ids)::uuid[]))) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))));

-- Reemplaza: Admins can update catalog items, admin_web_super_admin_manages_items, catalog_items_manage_company_admins
CREATE POLICY catalog_items_update_access ON public.catalog_items
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS active_role_company_ids)::uuid[]))) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))))
  WITH CHECK (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS active_role_company_ids)::uuid[]))) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))));

-- Reemplaza: Admins can delete catalog items, admin_web_super_admin_manages_items, catalog_items_manage_company_admins
CREATE POLICY catalog_items_delete_access ON public.catalog_items
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS active_role_company_ids)::uuid[]))) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))));

-- public.catalog_price_contributions
DROP POLICY catalog_price_contributions_select_own ON public.catalog_price_contributions;

DROP POLICY catalog_price_contributions_super_admin_select ON public.catalog_price_contributions;

-- Reemplaza: catalog_price_contributions_select_own, catalog_price_contributions_super_admin_select
CREATE POLICY catalog_price_contributions_select_access ON public.catalog_price_contributions
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((( SELECT private.is_active_platform_user() AS is_active_platform_user) AND (user_id = ( SELECT app.current_user_id() AS current_user_id))))));

-- public.catalog_price_history
DROP POLICY admin_web_super_admin_adds_price_history ON public.catalog_price_history;

DROP POLICY admin_web_super_admin_reads_price_history ON public.catalog_price_history;

DROP POLICY catalog_price_history_select_company_members ON public.catalog_price_history;

-- Reemplaza: admin_web_super_admin_reads_price_history, catalog_price_history_select_company_members
CREATE POLICY catalog_price_history_select_access ON public.catalog_price_history
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])))));

-- Reemplaza: admin_web_super_admin_adds_price_history
CREATE POLICY catalog_price_history_insert_access ON public.catalog_price_history
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

-- public.catalog_yields
DROP POLICY admin_web_super_admin_manages_yields ON public.catalog_yields;

DROP POLICY admin_web_super_admin_reads_catalog_yields ON public.catalog_yields;

DROP POLICY catalog_yields_manage_company_admins ON public.catalog_yields;

DROP POLICY catalog_yields_select_company_members ON public.catalog_yields;

-- Reemplaza: admin_web_super_admin_manages_yields, admin_web_super_admin_reads_catalog_yields, catalog_yields_manage_company_admins, catalog_yields_select_company_members
CREATE POLICY catalog_yields_select_access ON public.catalog_yields
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[]))) OR ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])))));

-- Reemplaza: admin_web_super_admin_manages_yields, catalog_yields_manage_company_admins
CREATE POLICY catalog_yields_insert_access ON public.catalog_yields
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))));

-- Reemplaza: admin_web_super_admin_manages_yields, catalog_yields_manage_company_admins
CREATE POLICY catalog_yields_update_access ON public.catalog_yields
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))))
  WITH CHECK (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))));

-- Reemplaza: admin_web_super_admin_manages_yields, catalog_yields_manage_company_admins
CREATE POLICY catalog_yields_delete_access ON public.catalog_yields
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))));

-- public.client_addresses
DROP POLICY "Admins can delete client addresses" ON public.client_addresses;

DROP POLICY "Members can insert client addresses" ON public.client_addresses;

DROP POLICY "Members can read client addresses" ON public.client_addresses;

DROP POLICY "Members can update client addresses" ON public.client_addresses;

DROP POLICY client_addresses_super_admin_select ON public.client_addresses;

-- Reemplaza: Members can read client addresses, client_addresses_super_admin_select
CREATE POLICY client_addresses_select_access ON public.client_addresses
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])))));

-- Reemplaza: Members can insert client addresses
CREATE POLICY client_addresses_insert_access ON public.client_addresses
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])));

-- Reemplaza: Members can update client addresses
CREATE POLICY client_addresses_update_access ON public.client_addresses
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])))
  WITH CHECK ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])));

-- Reemplaza: Admins can delete client addresses
CREATE POLICY client_addresses_delete_access ON public.client_addresses
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])));

-- public.client_contacts
DROP POLICY "Admins can delete client contacts" ON public.client_contacts;

DROP POLICY "Members can insert client contacts" ON public.client_contacts;

DROP POLICY "Members can read client contacts" ON public.client_contacts;

DROP POLICY "Members can update client contacts" ON public.client_contacts;

DROP POLICY client_contacts_super_admin_select ON public.client_contacts;

-- Reemplaza: Members can read client contacts, client_contacts_super_admin_select
CREATE POLICY client_contacts_select_access ON public.client_contacts
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])))));

-- Reemplaza: Members can insert client contacts
CREATE POLICY client_contacts_insert_access ON public.client_contacts
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])));

-- Reemplaza: Members can update client contacts
CREATE POLICY client_contacts_update_access ON public.client_contacts
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])))
  WITH CHECK ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])));

-- Reemplaza: Admins can delete client contacts
CREATE POLICY client_contacts_delete_access ON public.client_contacts
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])));

-- public.clients
DROP POLICY "Admins can delete clients" ON public.clients;

DROP POLICY "Admins can update clients" ON public.clients;

DROP POLICY "Members can insert clients" ON public.clients;

DROP POLICY "Members can read clients" ON public.clients;

DROP POLICY admin_web_super_admin_reads_clients ON public.clients;

DROP POLICY clients_select_own_link ON public.clients;

-- Reemplaza: Members can read clients, admin_web_super_admin_reads_clients, clients_select_own_link
CREATE POLICY clients_select_access ON public.clients
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[]))) OR (((user_id = ( SELECT app.current_user_id() AS current_user_id)) AND active AND private.is_active_company(company_id)))));

-- Reemplaza: Members can insert clients
CREATE POLICY clients_insert_access ON public.clients
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])));

-- Reemplaza: Admins can update clients
CREATE POLICY clients_update_access ON public.clients
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])))
  WITH CHECK ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])));

-- Reemplaza: Admins can delete clients
CREATE POLICY clients_delete_access ON public.clients
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS active_role_company_ids)::uuid[])));

-- public.companies
DROP POLICY "Admins can update companies" ON public.companies;

DROP POLICY "Authenticated users can create companies" ON public.companies;

DROP POLICY "Members can read their companies" ON public.companies;

DROP POLICY "Owners can delete companies" ON public.companies;

DROP POLICY admin_web_super_admin_reads_companies ON public.companies;

DROP POLICY admin_web_super_admin_updates_companies ON public.companies;

DROP POLICY companies_select_for_linked_client ON public.companies;

-- Reemplaza: Members can read their companies, admin_web_super_admin_reads_companies, companies_select_for_linked_client
CREATE POLICY companies_select_access ON public.companies
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[]))) OR ((EXISTS ( SELECT 1
   FROM public.clients client
  WHERE ((client.company_id = companies.id) AND (client.user_id = ( SELECT app.current_user_id() AS uid)) AND (client.active = true)))))));

-- Reemplaza: Authenticated users can create companies
CREATE POLICY companies_insert_access ON public.companies
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK ((created_by = ( SELECT app.current_user_id() AS current_user_id)));

-- Reemplaza: Admins can update companies, admin_web_super_admin_updates_companies
CREATE POLICY companies_update_access ON public.companies
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))))
  WITH CHECK (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))));

-- Reemplaza: Owners can delete companies
CREATE POLICY companies_delete_access ON public.companies
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING ((id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role]) AS member_company_ids)::uuid[])));

-- public.company_invitations
ALTER POLICY company_invitations_select_policy ON public.company_invitations
  USING ((private.is_active_platform_user() AND (company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[]))));

-- public.company_members
DROP POLICY "Admins can add company members" ON public.company_members;

DROP POLICY "Members can read company memberships" ON public.company_members;

DROP POLICY admin_web_super_admin_reads_company_members ON public.company_members;

-- Reemplaza: Members can read company memberships, admin_web_super_admin_reads_company_members
CREATE POLICY company_members_select_access ON public.company_members
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])))));

-- Reemplaza: Admins can add company members
CREATE POLICY company_members_insert_access ON public.company_members
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK ((private.is_active_platform_user() AND (company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])) AND (active = true) AND ((role <> 'owner'::public.company_role) OR (company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role]) AS member_company_ids)::uuid[])))));

-- public.company_settings
ALTER POLICY "Admins can delete company settings" ON public.company_settings
  USING ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])));

ALTER POLICY "Admins can insert company settings" ON public.company_settings
  WITH CHECK ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])));

ALTER POLICY "Admins can update company settings" ON public.company_settings
  USING ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))
  WITH CHECK ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])));

ALTER POLICY "Members can read company settings" ON public.company_settings
  USING ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])));

-- public.document_sequences
ALTER POLICY "Admins can insert document sequences" ON public.document_sequences
  WITH CHECK ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])));

ALTER POLICY "Admins can update document sequences" ON public.document_sequences
  USING ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))
  WITH CHECK ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])));

ALTER POLICY "Members can read document sequences" ON public.document_sequences
  USING ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])));

ALTER POLICY "Owners can delete document sequences" ON public.document_sequences
  USING ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role]) AS member_company_ids)::uuid[])));

-- public.invoice_credit_notes
DROP POLICY invoice_credit_notes_select_for_linked_client ON public.invoice_credit_notes;

DROP POLICY invoice_credit_notes_select_policy ON public.invoice_credit_notes;

DROP POLICY invoice_credit_notes_super_admin_select ON public.invoice_credit_notes;

-- Reemplaza: invoice_credit_notes_select_for_linked_client, invoice_credit_notes_select_policy, invoice_credit_notes_super_admin_select
CREATE POLICY invoice_credit_notes_select_access ON public.invoice_credit_notes
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((EXISTS ( SELECT 1
   FROM (public.invoices invoice
     JOIN public.clients customer ON (((customer.id = invoice.client_id) AND (customer.company_id = invoice.company_id))))
  WHERE ((invoice.id = invoice_credit_notes.invoice_id) AND (invoice.company_id = invoice_credit_notes.company_id) AND (invoice.status <> 'draft'::public.invoice_status) AND (customer.user_id = ( SELECT app.current_user_id() AS current_user_id)) AND (customer.active = true))))) OR ((EXISTS ( SELECT 1
   FROM public.invoices invoice
  WHERE ((invoice.id = invoice_credit_notes.invoice_id) AND (invoice.company_id = invoice_credit_notes.company_id)))))));

-- public.invoice_history
DROP POLICY invoice_history_select_policy ON public.invoice_history;

DROP POLICY invoice_history_super_admin_select ON public.invoice_history;

-- Reemplaza: invoice_history_select_policy, invoice_history_super_admin_select
CREATE POLICY invoice_history_select_access ON public.invoice_history
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((EXISTS ( SELECT 1
   FROM public.invoices invoice
  WHERE ((invoice.id = invoice_history.invoice_id) AND (invoice.company_id = invoice_history.company_id)))))));

-- public.invoice_payment_reminders
ALTER POLICY invoice_payment_reminders_select_policy ON public.invoice_payment_reminders
  USING ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])));

-- public.invoice_payments
DROP POLICY invoice_payments_select_for_linked_client ON public.invoice_payments;

DROP POLICY invoice_payments_select_policy ON public.invoice_payments;

DROP POLICY invoice_payments_super_admin_select ON public.invoice_payments;

-- Reemplaza: invoice_payments_select_for_linked_client, invoice_payments_select_policy, invoice_payments_super_admin_select
CREATE POLICY invoice_payments_select_access ON public.invoice_payments
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((EXISTS ( SELECT 1
   FROM (public.invoices invoice
     JOIN public.clients customer ON (((customer.id = invoice.client_id) AND (customer.company_id = invoice.company_id))))
  WHERE ((invoice.id = invoice_payments.invoice_id) AND (invoice.company_id = invoice_payments.company_id) AND (invoice.status <> 'draft'::public.invoice_status) AND (customer.user_id = ( SELECT app.current_user_id() AS current_user_id)) AND (customer.active = true))))) OR ((EXISTS ( SELECT 1
   FROM public.invoices invoice
  WHERE ((invoice.id = invoice_payments.invoice_id) AND (invoice.company_id = invoice_payments.company_id)))))));

-- public.invoice_requests
ALTER POLICY invoice_requests_select ON public.invoice_requests
  USING ((( SELECT private.is_super_admin() AS is_super_admin) OR (company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])) OR (( SELECT private.is_active_platform_user() AS is_active_platform_user) AND private.is_active_company(company_id) AND (EXISTS ( SELECT 1
   FROM public.clients customer
  WHERE ((customer.id = invoice_requests.client_id) AND (customer.company_id = invoice_requests.company_id) AND (customer.user_id = ( SELECT app.current_user_id() AS current_user_id)) AND customer.active))))));

-- public.invoices
DROP POLICY invoices_delete_policy ON public.invoices;

DROP POLICY invoices_insert_policy ON public.invoices;

DROP POLICY invoices_select_for_linked_client ON public.invoices;

DROP POLICY invoices_select_policy ON public.invoices;

DROP POLICY invoices_super_admin_select ON public.invoices;

DROP POLICY invoices_update_policy ON public.invoices;

-- Reemplaza: invoices_select_for_linked_client, invoices_select_policy, invoices_super_admin_select
CREATE POLICY invoices_select_access ON public.invoices
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'sales'::public.company_role, 'supervisor'::public.company_role, 'member'::public.company_role]) AS active_role_company_ids)::uuid[]))) OR (((status <> 'draft'::public.invoice_status) AND (EXISTS ( SELECT 1
   FROM public.clients customer
  WHERE ((customer.id = invoices.client_id) AND (customer.company_id = invoices.company_id) AND (customer.user_id = ( SELECT app.current_user_id() AS current_user_id)) AND (customer.active = true))))))));

-- Reemplaza: invoices_insert_policy
CREATE POLICY invoices_insert_access ON public.invoices
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.company_members membership
     JOIN public.profiles p ON ((p.id = membership.user_id)))
  WHERE ((membership.company_id = invoices.company_id) AND (membership.user_id = ( SELECT app.current_user_id() AS current_user_id)) AND (membership.active = true) AND (p.active = true) AND (p.approved_at IS NOT NULL)))));

-- Reemplaza: invoices_update_policy
CREATE POLICY invoices_update_access ON public.invoices
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING ((EXISTS ( SELECT 1
   FROM (public.company_members membership
     JOIN public.profiles p ON ((p.id = membership.user_id)))
  WHERE ((membership.company_id = invoices.company_id) AND (membership.user_id = ( SELECT app.current_user_id() AS current_user_id)) AND (membership.active = true) AND (p.active = true) AND (p.approved_at IS NOT NULL)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.company_members membership
     JOIN public.profiles p ON ((p.id = membership.user_id)))
  WHERE ((membership.company_id = invoices.company_id) AND (membership.user_id = ( SELECT app.current_user_id() AS current_user_id)) AND (membership.active = true) AND (p.active = true) AND (p.approved_at IS NOT NULL)))));

-- Reemplaza: invoices_delete_policy
CREATE POLICY invoices_delete_access ON public.invoices
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING ((EXISTS ( SELECT 1
   FROM (public.company_members membership
     JOIN public.profiles p ON ((p.id = membership.user_id)))
  WHERE ((membership.company_id = invoices.company_id) AND (membership.user_id = ( SELECT app.current_user_id() AS current_user_id)) AND (membership.active = true) AND (p.active = true) AND (p.approved_at IS NOT NULL)))));

-- public.job_request_messages
ALTER POLICY job_request_messages_select ON public.job_request_messages
  USING (((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])) OR private.is_job_request_owner(request_id) OR ( SELECT private.is_super_admin() AS is_super_admin)));

-- public.job_request_quotes
ALTER POLICY job_request_quotes_select ON public.job_request_quotes
  USING (((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])) OR ((sent_at IS NOT NULL) AND private.is_job_request_owner(request_id)) OR ( SELECT private.is_super_admin() AS is_super_admin)));

-- public.job_request_threads
ALTER POLICY job_request_threads_select ON public.job_request_threads
  USING (((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])) OR private.is_job_request_owner(request_id) OR ( SELECT private.is_super_admin() AS is_super_admin)));

-- public.job_requests
DROP POLICY job_requests_select_engaged_company ON public.job_requests;

DROP POLICY job_requests_select_open_for_contractors ON public.job_requests;

DROP POLICY job_requests_select_own ON public.job_requests;

DROP POLICY job_requests_super_admin_select ON public.job_requests;

-- Reemplaza: job_requests_select_engaged_company, job_requests_select_open_for_contractors, job_requests_select_own, job_requests_super_admin_select
CREATE POLICY job_requests_select_access ON public.job_requests
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR (private.has_job_request_engagement(id)) OR (((status = 'open'::text) AND (expires_at > now()) AND (quotes_sent_count < max_quotes) AND ( SELECT private.is_active_contractor() AS is_active_contractor))) OR ((requester_id = ( SELECT app.current_user_id() AS current_user_id)))));

-- public.notifications
DROP POLICY notifications_insert_own ON public.notifications;

DROP POLICY notifications_insert_policy ON public.notifications;

DROP POLICY notifications_select_policy ON public.notifications;

DROP POLICY notifications_update_policy ON public.notifications;

-- Reemplaza: notifications_select_policy
CREATE POLICY notifications_select_access ON public.notifications
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING ((user_id = ( SELECT app.current_user_id() AS current_user_id)));

-- Reemplaza: notifications_insert_own, notifications_insert_policy
CREATE POLICY notifications_insert_access ON public.notifications
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK ((((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[]))) OR ((user_id = ( SELECT app.current_user_id() AS current_user_id)))));

-- Reemplaza: notifications_update_policy
CREATE POLICY notifications_update_access ON public.notifications
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING ((user_id = ( SELECT app.current_user_id() AS current_user_id)))
  WITH CHECK ((user_id = ( SELECT app.current_user_id() AS current_user_id)));

-- public.platform_catalog_items
DROP POLICY active_users_read_platform_catalog ON public.platform_catalog_items;

DROP POLICY super_admin_manages_platform_catalog ON public.platform_catalog_items;

-- Reemplaza: active_users_read_platform_catalog, super_admin_manages_platform_catalog
CREATE POLICY platform_catalog_items_select_access ON public.platform_catalog_items
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((( SELECT private.is_active_platform_user() AS is_active_platform_user) AND ((active = true) OR ( SELECT private.is_super_admin() AS is_super_admin))))));

-- Reemplaza: super_admin_manages_platform_catalog
CREATE POLICY platform_catalog_items_insert_access ON public.platform_catalog_items
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

-- Reemplaza: super_admin_manages_platform_catalog
CREATE POLICY platform_catalog_items_update_access ON public.platform_catalog_items
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin))
  WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

-- Reemplaza: super_admin_manages_platform_catalog
CREATE POLICY platform_catalog_items_delete_access ON public.platform_catalog_items
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

-- public.profiles
DROP POLICY "Company members can read related profiles" ON public.profiles;

DROP POLICY "Users can update own profile" ON public.profiles;

DROP POLICY admin_web_super_admin_reads_profiles ON public.profiles;

DROP POLICY admin_web_super_admin_updates_profiles ON public.profiles;

DROP POLICY profiles_admin_delete ON public.profiles;

DROP POLICY profiles_admin_insert ON public.profiles;

DROP POLICY profiles_admin_update ON public.profiles;

DROP POLICY profiles_select_own_or_admin ON public.profiles;

-- Reemplaza: Company members can read related profiles, admin_web_super_admin_reads_profiles, profiles_select_own_or_admin
CREATE POLICY profiles_select_access ON public.profiles
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR (((id = ( SELECT app.current_user_id() AS current_user_id)) OR ( SELECT private.is_super_admin() AS is_super_admin))) OR ((EXISTS ( SELECT 1
   FROM (public.company_members my_membership
     JOIN public.company_members related_membership ON ((related_membership.company_id = my_membership.company_id)))
  WHERE ((my_membership.user_id = ( SELECT app.current_user_id() AS current_user_id)) AND (my_membership.active = true) AND (related_membership.user_id = profiles.id) AND (related_membership.active = true)))))));

-- Reemplaza: profiles_admin_insert
CREATE POLICY profiles_insert_access ON public.profiles
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

-- Reemplaza: Users can update own profile, admin_web_super_admin_updates_profiles, profiles_admin_update
CREATE POLICY profiles_update_access ON public.profiles
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((id = ( SELECT app.current_user_id() AS current_user_id)))))
  WITH CHECK (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((id = ( SELECT app.current_user_id() AS current_user_id)))));

-- Reemplaza: profiles_admin_delete
CREATE POLICY profiles_delete_access ON public.profiles
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

-- public.project_members
DROP POLICY "Admins can delete project members" ON public.project_members;

DROP POLICY "Admins can insert project members" ON public.project_members;

DROP POLICY "Admins can update project members" ON public.project_members;

DROP POLICY "Members can read project members" ON public.project_members;

DROP POLICY project_members_super_admin_select ON public.project_members;

-- Reemplaza: Members can read project members, project_members_super_admin_select
CREATE POLICY project_members_select_access ON public.project_members
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])))));

-- Reemplaza: Admins can insert project members
CREATE POLICY project_members_insert_access ON public.project_members
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])));

-- Reemplaza: Admins can update project members
CREATE POLICY project_members_update_access ON public.project_members
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))
  WITH CHECK ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])));

-- Reemplaza: Admins can delete project members
CREATE POLICY project_members_delete_access ON public.project_members
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])));

-- public.project_photos
DROP POLICY project_photos_delete_policy ON public.project_photos;

DROP POLICY project_photos_insert_policy ON public.project_photos;

DROP POLICY project_photos_select_for_linked_client ON public.project_photos;

DROP POLICY project_photos_select_policy ON public.project_photos;

DROP POLICY project_photos_super_admin_select ON public.project_photos;

DROP POLICY project_photos_update_policy ON public.project_photos;

-- Reemplaza: project_photos_select_for_linked_client, project_photos_select_policy, project_photos_super_admin_select
CREATE POLICY project_photos_select_access ON public.project_photos
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[]))) OR (((is_private = false) AND (EXISTS ( SELECT 1
   FROM (public.projects project
     JOIN public.clients customer ON (((customer.id = project.client_id) AND (customer.company_id = project.company_id))))
  WHERE ((project.id = project_photos.project_id) AND (project.company_id = project_photos.company_id) AND (customer.user_id = ( SELECT app.current_user_id() AS current_user_id)) AND (customer.active = true))))))));

-- Reemplaza: project_photos_insert_policy
CREATE POLICY project_photos_insert_access ON public.project_photos
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])));

-- Reemplaza: project_photos_update_policy
CREATE POLICY project_photos_update_access ON public.project_photos
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])))
  WITH CHECK ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])));

-- Reemplaza: project_photos_delete_policy
CREATE POLICY project_photos_delete_access ON public.project_photos
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'supervisor'::public.company_role]) AS active_role_company_ids)::uuid[])));

-- public.project_progress_history
DROP POLICY project_progress_history_insert_policy ON public.project_progress_history;

DROP POLICY project_progress_history_select_for_linked_client ON public.project_progress_history;

DROP POLICY project_progress_history_select_policy ON public.project_progress_history;

DROP POLICY project_progress_history_super_admin_select ON public.project_progress_history;

-- Reemplaza: project_progress_history_select_for_linked_client, project_progress_history_select_policy, project_progress_history_super_admin_select
CREATE POLICY project_progress_history_select_access ON public.project_progress_history
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[]))) OR ((EXISTS ( SELECT 1
   FROM (public.projects project
     JOIN public.clients customer ON (((customer.id = project.client_id) AND (customer.company_id = project.company_id))))
  WHERE ((project.id = project_progress_history.project_id) AND (project.company_id = project_progress_history.company_id) AND (customer.user_id = ( SELECT app.current_user_id() AS current_user_id)) AND (customer.active = true)))))));

-- Reemplaza: project_progress_history_insert_policy
CREATE POLICY project_progress_history_insert_access ON public.project_progress_history
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])));

-- public.project_tasks
DROP POLICY project_tasks_delete_policy ON public.project_tasks;

DROP POLICY project_tasks_insert_policy ON public.project_tasks;

DROP POLICY project_tasks_select_policy ON public.project_tasks;

DROP POLICY project_tasks_super_admin_select ON public.project_tasks;

DROP POLICY project_tasks_update_policy ON public.project_tasks;

-- Reemplaza: project_tasks_select_policy, project_tasks_super_admin_select
CREATE POLICY project_tasks_select_access ON public.project_tasks
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])))));

-- Reemplaza: project_tasks_insert_policy
CREATE POLICY project_tasks_insert_access ON public.project_tasks
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])));

-- Reemplaza: project_tasks_update_policy
CREATE POLICY project_tasks_update_access ON public.project_tasks
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])))
  WITH CHECK ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])));

-- Reemplaza: project_tasks_delete_policy
CREATE POLICY project_tasks_delete_access ON public.project_tasks
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'supervisor'::public.company_role]) AS active_role_company_ids)::uuid[])));

-- public.projects
DROP POLICY "Admins can delete projects" ON public.projects;

DROP POLICY "Members can insert projects" ON public.projects;

DROP POLICY "Members can read projects" ON public.projects;

DROP POLICY "Members can update projects" ON public.projects;

DROP POLICY admin_web_super_admin_reads_projects ON public.projects;

DROP POLICY projects_select_for_linked_client ON public.projects;

-- Reemplaza: Members can read projects, admin_web_super_admin_reads_projects, projects_select_for_linked_client
CREATE POLICY projects_select_access ON public.projects
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[]))) OR ((EXISTS ( SELECT 1
   FROM public.clients client
  WHERE ((client.id = projects.client_id) AND (client.company_id = projects.company_id) AND (client.user_id = ( SELECT app.current_user_id() AS uid)) AND (client.active = true)))))));

-- Reemplaza: Members can insert projects
CREATE POLICY projects_insert_access ON public.projects
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])));

-- Reemplaza: Members can update projects
CREATE POLICY projects_update_access ON public.projects
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])))
  WITH CHECK ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])));

-- Reemplaza: Admins can delete projects
CREATE POLICY projects_delete_access ON public.projects
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS active_role_company_ids)::uuid[])));

-- public.saved_calculations
ALTER POLICY saved_calculations_delete_policy ON public.saved_calculations
  USING ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role]) AS active_role_company_ids)::uuid[])));

ALTER POLICY saved_calculations_insert_policy ON public.saved_calculations
  WITH CHECK ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])));

ALTER POLICY saved_calculations_select_policy ON public.saved_calculations
  USING ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])));

ALTER POLICY saved_calculations_update_policy ON public.saved_calculations
  USING ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])))
  WITH CHECK ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'sales'::public.company_role]) AS active_role_company_ids)::uuid[])));

-- public.supplier_prices
ALTER POLICY "Admins can delete supplier prices" ON public.supplier_prices
  USING ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])));

ALTER POLICY "Admins can insert supplier prices" ON public.supplier_prices
  WITH CHECK ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])));

ALTER POLICY "Admins can update supplier prices" ON public.supplier_prices
  USING ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))
  WITH CHECK ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])));

ALTER POLICY "Members can read supplier prices" ON public.supplier_prices
  USING ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])));

-- public.suppliers
ALTER POLICY "Admins can delete suppliers" ON public.suppliers
  USING ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])));

ALTER POLICY "Admins can insert suppliers" ON public.suppliers
  WITH CHECK ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])));

ALTER POLICY "Admins can update suppliers" ON public.suppliers
  USING ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))
  WITH CHECK ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])));

ALTER POLICY "Members can read suppliers" ON public.suppliers
  USING ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])));

-- public.units
DROP POLICY "Admins can delete units" ON public.units;

DROP POLICY "Admins can insert units" ON public.units;

DROP POLICY "Admins can update units" ON public.units;

DROP POLICY admin_web_super_admin_manages_units ON public.units;

DROP POLICY admin_web_super_admin_reads_units ON public.units;

DROP POLICY units_manage_company_admins ON public.units;

DROP POLICY units_select_company_members ON public.units;

-- Reemplaza: admin_web_super_admin_manages_units, admin_web_super_admin_reads_units, units_manage_company_admins, units_select_company_members
CREATE POLICY units_select_access ON public.units
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[]))) OR ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])))));

-- Reemplaza: Admins can insert units, admin_web_super_admin_manages_units, units_manage_company_admins
CREATE POLICY units_insert_access ON public.units
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))));

-- Reemplaza: Admins can update units, admin_web_super_admin_manages_units, units_manage_company_admins
CREATE POLICY units_update_access ON public.units
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))))
  WITH CHECK (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))));

-- Reemplaza: Admins can delete units, admin_web_super_admin_manages_units, units_manage_company_admins
CREATE POLICY units_delete_access ON public.units
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.member_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role]) AS member_company_ids)::uuid[])))));

-- public.user_app_settings
ALTER POLICY user_app_settings_delete ON public.user_app_settings
  USING ((user_id = ( SELECT app.current_user_id() AS current_user_id)));

ALTER POLICY user_app_settings_insert ON public.user_app_settings
  WITH CHECK ((user_id = ( SELECT app.current_user_id() AS current_user_id)));

ALTER POLICY user_app_settings_select ON public.user_app_settings
  USING ((user_id = ( SELECT app.current_user_id() AS current_user_id)));

ALTER POLICY user_app_settings_update ON public.user_app_settings
  USING ((user_id = ( SELECT app.current_user_id() AS current_user_id)))
  WITH CHECK ((user_id = ( SELECT app.current_user_id() AS current_user_id)));

-- public.user_push_tokens
ALTER POLICY user_push_tokens_owner_policy ON public.user_push_tokens
  USING ((user_id = ( SELECT app.current_user_id() AS current_user_id)))
  WITH CHECK ((user_id = ( SELECT app.current_user_id() AS current_user_id)));

-- 3. Índices -----------------------------------------------------------------

-- FK sin índice (asesor unindexed_foreign_keys).
CREATE INDEX IF NOT EXISTS client_connection_requests_requested_by_fk_idx
  ON private.client_connection_requests (requested_by);

-- Índices redundantes: otro índice con las mismas primeras columnas ya
-- resuelve las mismas búsquedas y la misma FK. Quitarlos reduce el costo de
-- cada INSERT/UPDATE y el espacio.
DROP INDEX IF EXISTS app_auth.app_auth_identities_provider_idx;  -- cubierto por app_auth_identities_provider_unique (provider, provider_user_id)
DROP INDEX IF EXISTS public.budget_items_budget_idx;  -- cubierto por budget_items_sort_idx (budget_id, section_id, sort_order)
DROP INDEX IF EXISTS public.budget_items_section_idx;  -- cubierto por budget_items_section_id_budget_id_company_id_fk_idx
DROP INDEX IF EXISTS public.budget_sections_budget_idx;  -- cubierto por budget_sections_sort_idx (budget_id, sort_order)
DROP INDEX IF EXISTS public.budget_versions_budget_idx;  -- cubierto por budget_versions_unique (budget_id, version)
DROP INDEX IF EXISTS public.budgets_client_idx;  -- cubierto por budgets_client_id_company_id_fk_idx
DROP INDEX IF EXISTS public.budgets_company_idx;  -- cubierto por budgets_number_unique / budgets_created_at_idx / budgets_status_idx
DROP INDEX IF EXISTS public.budgets_project_idx;  -- cubierto por budgets_project_id_company_id_fk_idx
DROP INDEX IF EXISTS public.catalog_categories_company_idx;  -- cubierto por catalog_categories_active_idx / catalog_categories_parent_idx
DROP INDEX IF EXISTS public.catalog_items_company_idx;  -- cubierto por catalog_items_company_sku_unique y otros (company_id, …)
DROP INDEX IF EXISTS public.catalog_items_type_idx;  -- cubierto por catalog_items_company_type_idx (company_id, item_type, active)
DROP INDEX IF EXISTS public.client_addresses_client_idx;  -- cubierto por client_addresses_client_id_company_id_fk_idx
DROP INDEX IF EXISTS public.client_contacts_client_idx;  -- cubierto por client_contacts_client_id_company_id_fk_idx
DROP INDEX IF EXISTS public.clients_company_idx;  -- cubierto por clients_active_idx / clients_search_idx
DROP INDEX IF EXISTS public.company_members_company_idx;  -- cubierto por company_members_unique (company_id, user_id)
DROP INDEX IF EXISTS public.project_members_company_idx;  -- cubierto por project_members_company_id_user_id_fk_idx
DROP INDEX IF EXISTS public.project_members_project_idx;  -- cubierto por project_members_unique (project_id, user_id)
DROP INDEX IF EXISTS public.projects_client_idx;  -- cubierto por projects_client_id_company_id_fk_idx
DROP INDEX IF EXISTS public.projects_company_idx;  -- cubierto por projects_status_idx (company_id, status)
DROP INDEX IF EXISTS public.supplier_prices_company_idx;  -- cubierto por supplier_prices_effective_idx y otros (company_id, …)
DROP INDEX IF EXISTS public.suppliers_company_idx;  -- cubierto por suppliers_active_idx / suppliers_name_idx
DROP INDEX IF EXISTS public.units_active_idx;  -- cubierto por units_company_active_type_idx (company_id, active, unit_type)
DROP INDEX IF EXISTS public.units_company_idx;  -- cubierto por units_company_code_unique (company_id, code)

-- Facturas abiertas por fecha de vencimiento (recordatorios de pago).
CREATE INDEX IF NOT EXISTS invoices_open_due_date_idx
  ON public.invoices (due_date)
  WHERE status IN ('issued', 'partially_paid', 'overdue')
    AND due_date IS NOT NULL;

-- 4. Recordatorios de pago ---------------------------------------------------

CREATE OR REPLACE FUNCTION private.claim_invoice_payment_reminders(p_limit integer DEFAULT 25)
 RETURNS TABLE(reminder_id uuid, invoice_id uuid, kind text, client_email text, client_name text, company_name text, company_email text, company_phone text, invoice_number text, due_date date, balance_due numeric, currency_code text, payment_instructions text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT
      invoice.id AS invoice_id,
      invoice.company_id,
      invoice.invoice_number,
      invoice.due_date,
      company.name AS company_name,
      company.email AS company_email,
      company.phone AS company_phone,
      company.payment_instructions,
      COALESCE(invoice.snapshot_data ->> 'currency', company.currency_code) AS currency_code,
      lower(btrim(COALESCE(NULLIF(customer.email, ''), invoice.snapshot_data #>> '{client,email}'))) AS client_email,
      COALESCE(
        NULLIF(btrim(concat_ws(' ', customer.first_name, customer.last_name)), ''),
        customer.business_name
      ) AS client_name,
      (now() AT TIME ZONE company.timezone)::date AS today,
      extract(hour FROM now() AT TIME ZONE company.timezone) AS local_hour,
      GREATEST(
        COALESCE((invoice.snapshot_data #>> '{totals,total}')::numeric, 0)
          - COALESCE((
            SELECT sum(credit_note.amount)
            FROM public.invoice_credit_notes AS credit_note
            WHERE credit_note.invoice_id = invoice.id
              AND credit_note.status = 'issued'::public.invoice_credit_note_status
          ), 0)
          - COALESCE((
            SELECT sum(payment.amount)
            FROM public.invoice_payments AS payment
            WHERE payment.invoice_id = invoice.id
              AND payment.status = 'confirmed'::public.invoice_payment_status
          ), 0),
        0
      ) AS balance_due
    FROM public.invoices AS invoice
    JOIN public.companies AS company ON company.id = invoice.company_id
    LEFT JOIN public.clients AS customer ON customer.id = invoice.client_id
    WHERE invoice.status IN ('issued', 'partially_paid', 'overdue')
      AND invoice.due_date IS NOT NULL
      AND company.active = true
      AND company.payment_reminders_enabled = true
      -- Prefiltro por fecha (usa invoices_open_due_date_idx). La ventana de
      -- recordatorios va de hoy - 30 a hoy + 3 en la zona de la empresa; con
      -- un día de margen a cada lado cubre cualquier zona horaria (UTC±14).
      AND invoice.due_date BETWEEN (now() AT TIME ZONE 'UTC')::date - 31
                               AND (now() AT TIME ZONE 'UTC')::date + 4
  ),
  due AS (
    SELECT
      candidate.*,
      CASE
        WHEN candidate.due_date BETWEEN candidate.today AND candidate.today + 3 THEN 'due_soon'
        WHEN candidate.due_date BETWEEN candidate.today - 6 AND candidate.today - 1 THEN 'overdue'
        WHEN candidate.due_date BETWEEN candidate.today - 30 AND candidate.today - 7 THEN 'overdue_week'
      END AS reminder_kind
    FROM candidates AS candidate
    WHERE candidate.balance_due > 0
      AND candidate.client_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
      -- Solo en horario de oficina de la empresa.
      AND candidate.local_hour BETWEEN 8 AND 17
  ),
  claimed AS (
    INSERT INTO public.invoice_payment_reminders (company_id, invoice_id, kind, sent_to)
    SELECT due.company_id, due.invoice_id, due.reminder_kind, due.client_email
    FROM due
    WHERE due.reminder_kind IS NOT NULL
    ORDER BY due.due_date ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 100))
    ON CONFLICT ON CONSTRAINT invoice_payment_reminders_unique DO NOTHING
    RETURNING public.invoice_payment_reminders.id, public.invoice_payment_reminders.invoice_id, public.invoice_payment_reminders.kind
  )
  SELECT
    claimed.id,
    claimed.invoice_id,
    claimed.kind,
    due.client_email,
    due.client_name,
    due.company_name,
    due.company_email,
    due.company_phone,
    due.invoice_number,
    due.due_date,
    due.balance_due,
    due.currency_code,
    due.payment_instructions
  FROM claimed
  JOIN due ON due.invoice_id = claimed.invoice_id AND due.reminder_kind = claimed.kind;
END;
$function$;

-- 5. RLS en tablas privadas --------------------------------------------------

ALTER TABLE private.account_deletion_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.account_deletion_storage_queue ENABLE ROW LEVEL SECURITY;

RESET ROLE;

COMMIT;
