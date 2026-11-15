-- REVERSIÓN de 048_rls_and_index_optimization.sql
--
-- No es una migración: migrate.mjs no lee esta carpeta. Si hiciera falta
-- revertir la 048 en producción, copia este archivo como una migración nueva
-- (p. ej. 049_revert_rls_and_index_optimization.sql) y aplícala con el
-- proceso normal (docs/database-change-process.md). Nunca edites la 048.
--
-- Restaura exactamente las 223 políticas de la 047 (expresiones copiadas de
-- pg_policies), los 23 índices quitados, la función de recordatorios y
-- SECURITY INVOKER en is_active_platform_user(). Probado en la réplica local:
-- 047 -> 048 -> esta reversión deja la misma huella de esquema que la 047
-- (salvo RLS en private.account_deletion_records, que producción ya tenía y
-- se conserva).
--
-- Generado con database/scripts/rls/generate_rls_consolidation.py --down.

BEGIN;

SET ROLE contractor_owner;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- 1. Políticas originales ----------------------------------------------------

-- public.activities
DROP POLICY IF EXISTS activities_select_access ON public.activities;

DROP POLICY IF EXISTS activities_insert_access ON public.activities;

DROP POLICY IF EXISTS activities_update_access ON public.activities;

DROP POLICY IF EXISTS activities_delete_access ON public.activities;

CREATE POLICY activities_delete_policy ON public.activities
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'supervisor'::public.company_role]));

CREATE POLICY activities_insert_policy ON public.activities
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]));

CREATE POLICY activities_select_for_linked_client ON public.activities
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((status <> 'cancelled'::text) AND ((EXISTS ( SELECT 1
   FROM public.clients customer
  WHERE ((customer.id = activities.client_id) AND (customer.company_id = activities.company_id) AND (customer.user_id = ( SELECT app.current_user_id() AS current_user_id)) AND (customer.active = true)))) OR (EXISTS ( SELECT 1
   FROM (public.projects project
     JOIN public.clients customer ON (((customer.id = project.client_id) AND (customer.company_id = project.company_id))))
  WHERE ((project.id = activities.project_id) AND (project.company_id = activities.company_id) AND (customer.user_id = ( SELECT app.current_user_id() AS current_user_id)) AND (customer.active = true)))))));

CREATE POLICY activities_select_policy ON public.activities
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]));

CREATE POLICY activities_super_admin_select ON public.activities
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY activities_update_policy ON public.activities
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]))
  WITH CHECK (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]));

-- public.admin_audit_logs
DROP POLICY IF EXISTS admin_audit_logs_select_access ON public.admin_audit_logs;

DROP POLICY IF EXISTS admin_audit_logs_insert_access ON public.admin_audit_logs;

CREATE POLICY admin_audit_logs_insert_policy ON public.admin_audit_logs
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (public.is_company_member(company_id));

CREATE POLICY admin_audit_logs_select_policy ON public.admin_audit_logs
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (public.is_company_admin(company_id));

CREATE POLICY admin_audit_logs_super_admin_company_status_insert ON public.admin_audit_logs
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK ((( SELECT private.is_super_admin() AS is_super_admin) AND (user_id = ( SELECT app.current_user_id() AS current_user_id)) AND (action = ANY (ARRAY['COMPANY_SUSPENDED'::text, 'COMPANY_REACTIVATED'::text, 'ADMIN_SESSIONS_REVOKED'::text]))));

CREATE POLICY admin_audit_logs_super_admin_select ON public.admin_audit_logs
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

-- public.budget_change_history
ALTER POLICY budget_change_history_insert_policy ON public.budget_change_history
  WITH CHECK ((public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]) OR (EXISTS ( SELECT 1
   FROM (public.budgets b
     JOIN public.clients c ON ((c.id = b.client_id)))
  WHERE ((b.id = budget_change_history.budget_id) AND (c.user_id = app.current_user_id()))))));

ALTER POLICY budget_change_history_select_policy ON public.budget_change_history
  USING (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role]));

-- public.budget_items
DROP POLICY IF EXISTS budget_items_select_access ON public.budget_items;

DROP POLICY IF EXISTS budget_items_insert_access ON public.budget_items;

DROP POLICY IF EXISTS budget_items_update_access ON public.budget_items;

DROP POLICY IF EXISTS budget_items_delete_access ON public.budget_items;

CREATE POLICY "Members can delete budget items" ON public.budget_items
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (public.is_company_member(company_id));

CREATE POLICY "Members can insert budget items" ON public.budget_items
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (public.is_company_member(company_id));

CREATE POLICY "Members can read budget items" ON public.budget_items
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (public.is_company_member(company_id));

CREATE POLICY "Members can update budget items" ON public.budget_items
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));

CREATE POLICY budget_items_select_for_linked_client ON public.budget_items
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING ((EXISTS ( SELECT 1
   FROM (public.budgets budget
     JOIN public.clients client ON (((client.id = budget.client_id) AND (client.company_id = budget.company_id))))
  WHERE ((budget.id = budget_items.budget_id) AND (budget.company_id = budget_items.company_id) AND (budget.status = ANY (ARRAY['sent'::public.budget_status, 'viewed'::public.budget_status, 'approved'::public.budget_status, 'rejected'::public.budget_status, 'expired'::public.budget_status])) AND (client.user_id = ( SELECT app.current_user_id() AS uid)) AND (client.active = true)))));

CREATE POLICY budget_items_super_admin_select ON public.budget_items
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

-- public.budget_sections
DROP POLICY IF EXISTS budget_sections_select_access ON public.budget_sections;

DROP POLICY IF EXISTS budget_sections_insert_access ON public.budget_sections;

DROP POLICY IF EXISTS budget_sections_update_access ON public.budget_sections;

DROP POLICY IF EXISTS budget_sections_delete_access ON public.budget_sections;

CREATE POLICY "Members can delete budget sections" ON public.budget_sections
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (public.is_company_member(company_id));

CREATE POLICY "Members can insert budget sections" ON public.budget_sections
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (public.is_company_member(company_id));

CREATE POLICY "Members can read budget sections" ON public.budget_sections
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (public.is_company_member(company_id));

CREATE POLICY "Members can update budget sections" ON public.budget_sections
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));

CREATE POLICY budget_sections_select_for_linked_client ON public.budget_sections
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING ((EXISTS ( SELECT 1
   FROM (public.budgets budget
     JOIN public.clients client ON (((client.id = budget.client_id) AND (client.company_id = budget.company_id))))
  WHERE ((budget.id = budget_sections.budget_id) AND (budget.company_id = budget_sections.company_id) AND (budget.status = ANY (ARRAY['sent'::public.budget_status, 'viewed'::public.budget_status, 'approved'::public.budget_status, 'rejected'::public.budget_status, 'expired'::public.budget_status])) AND (client.user_id = ( SELECT app.current_user_id() AS uid)) AND (client.active = true)))));

CREATE POLICY budget_sections_super_admin_select ON public.budget_sections
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

-- public.budget_versions
DROP POLICY IF EXISTS budget_versions_select_access ON public.budget_versions;

DROP POLICY IF EXISTS budget_versions_insert_access ON public.budget_versions;

DROP POLICY IF EXISTS budget_versions_delete_access ON public.budget_versions;

CREATE POLICY "Admins can delete budget versions" ON public.budget_versions
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (public.is_company_admin(company_id));

CREATE POLICY "Members can insert budget versions" ON public.budget_versions
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK ((public.is_company_member(company_id) AND (created_by = app.current_user_id())));

CREATE POLICY "Members can read budget versions" ON public.budget_versions
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (public.is_company_member(company_id));

CREATE POLICY budget_versions_super_admin_select ON public.budget_versions
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

-- public.budgets
DROP POLICY IF EXISTS budgets_select_access ON public.budgets;

DROP POLICY IF EXISTS budgets_insert_access ON public.budgets;

DROP POLICY IF EXISTS budgets_update_access ON public.budgets;

DROP POLICY IF EXISTS budgets_delete_access ON public.budgets;

CREATE POLICY "Admins can delete budgets" ON public.budgets
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role]));

CREATE POLICY "Members can insert budgets" ON public.budgets
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role]));

CREATE POLICY "Members can read budgets" ON public.budgets
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (public.is_company_member(company_id));

CREATE POLICY "Members can update budgets" ON public.budgets
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'sales'::public.company_role]))
  WITH CHECK (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'sales'::public.company_role]));

CREATE POLICY budgets_select_for_linked_client ON public.budgets
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((status = ANY (ARRAY['sent'::public.budget_status, 'viewed'::public.budget_status, 'approved'::public.budget_status, 'rejected'::public.budget_status, 'expired'::public.budget_status])) AND (EXISTS ( SELECT 1
   FROM public.clients client
  WHERE ((client.id = budgets.client_id) AND (client.company_id = budgets.company_id) AND (client.user_id = ( SELECT app.current_user_id() AS uid)) AND (client.active = true))))));

CREATE POLICY budgets_super_admin_select ON public.budgets
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

-- public.calculation_formula_parameter_history
ALTER POLICY calculation_history_select_member ON public.calculation_formula_parameter_history
  USING (public.is_company_member(company_id));

-- public.calculation_formula_parameters
DROP POLICY IF EXISTS calculation_formula_parameters_select_access ON public.calculation_formula_parameters;

DROP POLICY IF EXISTS calculation_formula_parameters_insert_access ON public.calculation_formula_parameters;

DROP POLICY IF EXISTS calculation_formula_parameters_update_access ON public.calculation_formula_parameters;

DROP POLICY IF EXISTS calculation_formula_parameters_delete_access ON public.calculation_formula_parameters;

CREATE POLICY admin_web_super_admin_manages_calculation_parameters ON public.calculation_formula_parameters
  AS PERMISSIVE FOR ALL TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin))
  WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY calculation_parameters_admin_delete ON public.calculation_formula_parameters
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (public.is_company_admin(company_id));

CREATE POLICY calculation_parameters_admin_insert ON public.calculation_formula_parameters
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY calculation_parameters_admin_update ON public.calculation_formula_parameters
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY calculation_parameters_select_member ON public.calculation_formula_parameters
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (public.is_company_member(company_id));

CREATE POLICY company_members_read_calculation_parameters ON public.calculation_formula_parameters
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING ((( SELECT private.is_active_platform_user() AS is_active_platform_user) AND (( SELECT private.is_super_admin() AS is_super_admin) OR (EXISTS ( SELECT 1
   FROM public.company_members
  WHERE ((company_members.company_id = calculation_formula_parameters.company_id) AND (company_members.user_id = ( SELECT app.current_user_id() AS uid)) AND (company_members.active = true)))))));

-- public.calculation_formulas
DROP POLICY IF EXISTS calculation_formulas_select_access ON public.calculation_formulas;

DROP POLICY IF EXISTS calculation_formulas_insert_access ON public.calculation_formulas;

DROP POLICY IF EXISTS calculation_formulas_update_access ON public.calculation_formulas;

DROP POLICY IF EXISTS calculation_formulas_delete_access ON public.calculation_formulas;

CREATE POLICY admin_web_super_admin_manages_calculation_formulas ON public.calculation_formulas
  AS PERMISSIVE FOR ALL TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin))
  WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY calculation_formulas_admin_delete ON public.calculation_formulas
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (public.is_company_admin(company_id));

CREATE POLICY calculation_formulas_admin_insert ON public.calculation_formulas
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY calculation_formulas_admin_update ON public.calculation_formulas
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY calculation_formulas_select_member ON public.calculation_formulas
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (public.is_company_member(company_id));

CREATE POLICY company_members_read_calculation_formulas ON public.calculation_formulas
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING ((( SELECT private.is_active_platform_user() AS is_active_platform_user) AND (( SELECT private.is_super_admin() AS is_super_admin) OR (EXISTS ( SELECT 1
   FROM public.company_members
  WHERE ((company_members.company_id = calculation_formulas.company_id) AND (company_members.user_id = ( SELECT app.current_user_id() AS uid)) AND (company_members.active = true)))))));

-- public.catalog_categories
DROP POLICY IF EXISTS catalog_categories_select_access ON public.catalog_categories;

DROP POLICY IF EXISTS catalog_categories_insert_access ON public.catalog_categories;

DROP POLICY IF EXISTS catalog_categories_update_access ON public.catalog_categories;

DROP POLICY IF EXISTS catalog_categories_delete_access ON public.catalog_categories;

CREATE POLICY "Admins can delete catalog categories" ON public.catalog_categories
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role]));

CREATE POLICY "Admins can insert catalog categories" ON public.catalog_categories
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role]));

CREATE POLICY "Admins can update catalog categories" ON public.catalog_categories
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role]))
  WITH CHECK (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role]));

CREATE POLICY admin_web_super_admin_manages_categories ON public.catalog_categories
  AS PERMISSIVE FOR ALL TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin))
  WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY admin_web_super_admin_reads_catalog_categories ON public.catalog_categories
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY catalog_categories_manage_company_admins ON public.catalog_categories
  AS PERMISSIVE FOR ALL TO contractor_api
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY catalog_categories_select_company_members ON public.catalog_categories
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (public.is_company_member(company_id));

-- public.catalog_items
DROP POLICY IF EXISTS catalog_items_select_access ON public.catalog_items;

DROP POLICY IF EXISTS catalog_items_insert_access ON public.catalog_items;

DROP POLICY IF EXISTS catalog_items_update_access ON public.catalog_items;

DROP POLICY IF EXISTS catalog_items_delete_access ON public.catalog_items;

CREATE POLICY "Admins can delete catalog items" ON public.catalog_items
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role]));

CREATE POLICY "Admins can insert catalog items" ON public.catalog_items
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role]));

CREATE POLICY "Admins can update catalog items" ON public.catalog_items
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role]))
  WITH CHECK (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role]));

CREATE POLICY admin_web_super_admin_manages_items ON public.catalog_items
  AS PERMISSIVE FOR ALL TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin))
  WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY admin_web_super_admin_reads_catalog_items ON public.catalog_items
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY catalog_items_manage_company_admins ON public.catalog_items
  AS PERMISSIVE FOR ALL TO contractor_api
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY catalog_items_select_company_members ON public.catalog_items
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (public.is_company_member(company_id));

-- public.catalog_price_contributions
DROP POLICY IF EXISTS catalog_price_contributions_select_access ON public.catalog_price_contributions;

CREATE POLICY catalog_price_contributions_select_own ON public.catalog_price_contributions
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING ((( SELECT private.is_active_platform_user() AS is_active_platform_user) AND (user_id = ( SELECT app.current_user_id() AS current_user_id))));

CREATE POLICY catalog_price_contributions_super_admin_select ON public.catalog_price_contributions
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

-- public.catalog_price_history
DROP POLICY IF EXISTS catalog_price_history_select_access ON public.catalog_price_history;

DROP POLICY IF EXISTS catalog_price_history_insert_access ON public.catalog_price_history;

CREATE POLICY admin_web_super_admin_adds_price_history ON public.catalog_price_history
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY admin_web_super_admin_reads_price_history ON public.catalog_price_history
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY catalog_price_history_select_company_members ON public.catalog_price_history
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (public.is_company_member(company_id));

-- public.catalog_yields
DROP POLICY IF EXISTS catalog_yields_select_access ON public.catalog_yields;

DROP POLICY IF EXISTS catalog_yields_insert_access ON public.catalog_yields;

DROP POLICY IF EXISTS catalog_yields_update_access ON public.catalog_yields;

DROP POLICY IF EXISTS catalog_yields_delete_access ON public.catalog_yields;

CREATE POLICY admin_web_super_admin_manages_yields ON public.catalog_yields
  AS PERMISSIVE FOR ALL TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin))
  WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY admin_web_super_admin_reads_catalog_yields ON public.catalog_yields
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY catalog_yields_manage_company_admins ON public.catalog_yields
  AS PERMISSIVE FOR ALL TO contractor_api
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY catalog_yields_select_company_members ON public.catalog_yields
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (public.is_company_member(company_id));

-- public.client_addresses
DROP POLICY IF EXISTS client_addresses_select_access ON public.client_addresses;

DROP POLICY IF EXISTS client_addresses_insert_access ON public.client_addresses;

DROP POLICY IF EXISTS client_addresses_update_access ON public.client_addresses;

DROP POLICY IF EXISTS client_addresses_delete_access ON public.client_addresses;

CREATE POLICY "Admins can delete client addresses" ON public.client_addresses
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (public.is_company_admin(company_id));

CREATE POLICY "Members can insert client addresses" ON public.client_addresses
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (public.is_company_member(company_id));

CREATE POLICY "Members can read client addresses" ON public.client_addresses
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (public.is_company_member(company_id));

CREATE POLICY "Members can update client addresses" ON public.client_addresses
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));

CREATE POLICY client_addresses_super_admin_select ON public.client_addresses
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

-- public.client_contacts
DROP POLICY IF EXISTS client_contacts_select_access ON public.client_contacts;

DROP POLICY IF EXISTS client_contacts_insert_access ON public.client_contacts;

DROP POLICY IF EXISTS client_contacts_update_access ON public.client_contacts;

DROP POLICY IF EXISTS client_contacts_delete_access ON public.client_contacts;

CREATE POLICY "Admins can delete client contacts" ON public.client_contacts
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (public.is_company_admin(company_id));

CREATE POLICY "Members can insert client contacts" ON public.client_contacts
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (public.is_company_member(company_id));

CREATE POLICY "Members can read client contacts" ON public.client_contacts
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (public.is_company_member(company_id));

CREATE POLICY "Members can update client contacts" ON public.client_contacts
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));

CREATE POLICY client_contacts_super_admin_select ON public.client_contacts
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

-- public.clients
DROP POLICY IF EXISTS clients_select_access ON public.clients;

DROP POLICY IF EXISTS clients_insert_access ON public.clients;

DROP POLICY IF EXISTS clients_update_access ON public.clients;

DROP POLICY IF EXISTS clients_delete_access ON public.clients;

CREATE POLICY "Admins can delete clients" ON public.clients
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role]));

CREATE POLICY "Admins can update clients" ON public.clients
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'sales'::public.company_role]))
  WITH CHECK (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'sales'::public.company_role]));

CREATE POLICY "Members can insert clients" ON public.clients
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'sales'::public.company_role]));

CREATE POLICY "Members can read clients" ON public.clients
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (public.is_company_member(company_id));

CREATE POLICY admin_web_super_admin_reads_clients ON public.clients
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY clients_select_own_link ON public.clients
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((user_id = ( SELECT app.current_user_id() AS current_user_id)) AND active AND private.is_active_company(company_id)));

-- public.companies
DROP POLICY IF EXISTS companies_select_access ON public.companies;

DROP POLICY IF EXISTS companies_insert_access ON public.companies;

DROP POLICY IF EXISTS companies_update_access ON public.companies;

DROP POLICY IF EXISTS companies_delete_access ON public.companies;

CREATE POLICY "Admins can update companies" ON public.companies
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (public.is_company_admin(id))
  WITH CHECK (public.is_company_admin(id));

CREATE POLICY "Authenticated users can create companies" ON public.companies
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK ((created_by = app.current_user_id()));

CREATE POLICY "Members can read their companies" ON public.companies
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (public.is_company_member(id));

CREATE POLICY "Owners can delete companies" ON public.companies
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (public.is_company_owner(id));

CREATE POLICY admin_web_super_admin_reads_companies ON public.companies
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY admin_web_super_admin_updates_companies ON public.companies
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin))
  WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY companies_select_for_linked_client ON public.companies
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING ((EXISTS ( SELECT 1
   FROM public.clients client
  WHERE ((client.company_id = companies.id) AND (client.user_id = ( SELECT app.current_user_id() AS uid)) AND (client.active = true)))));

-- public.company_invitations
ALTER POLICY company_invitations_select_policy ON public.company_invitations
  USING ((private.is_active_platform_user() AND public.is_company_admin(company_id)));

-- public.company_members
DROP POLICY IF EXISTS company_members_select_access ON public.company_members;

DROP POLICY IF EXISTS company_members_insert_access ON public.company_members;

CREATE POLICY "Admins can add company members" ON public.company_members
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK ((private.is_active_platform_user() AND public.is_company_admin(company_id) AND (active = true) AND ((role <> 'owner'::public.company_role) OR public.is_company_owner(company_id))));

CREATE POLICY "Members can read company memberships" ON public.company_members
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (public.is_company_member(company_id));

CREATE POLICY admin_web_super_admin_reads_company_members ON public.company_members
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

-- public.company_settings
ALTER POLICY "Admins can delete company settings" ON public.company_settings
  USING (public.is_company_admin(company_id));

ALTER POLICY "Admins can insert company settings" ON public.company_settings
  WITH CHECK (public.is_company_admin(company_id));

ALTER POLICY "Admins can update company settings" ON public.company_settings
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

ALTER POLICY "Members can read company settings" ON public.company_settings
  USING (public.is_company_member(company_id));

-- public.document_sequences
ALTER POLICY "Admins can insert document sequences" ON public.document_sequences
  WITH CHECK (public.is_company_admin(company_id));

ALTER POLICY "Admins can update document sequences" ON public.document_sequences
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

ALTER POLICY "Members can read document sequences" ON public.document_sequences
  USING (public.is_company_member(company_id));

ALTER POLICY "Owners can delete document sequences" ON public.document_sequences
  USING (public.is_company_owner(company_id));

-- public.invoice_credit_notes
DROP POLICY IF EXISTS invoice_credit_notes_select_access ON public.invoice_credit_notes;

CREATE POLICY invoice_credit_notes_select_for_linked_client ON public.invoice_credit_notes
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING ((EXISTS ( SELECT 1
   FROM (public.invoices invoice
     JOIN public.clients customer ON (((customer.id = invoice.client_id) AND (customer.company_id = invoice.company_id))))
  WHERE ((invoice.id = invoice_credit_notes.invoice_id) AND (invoice.company_id = invoice_credit_notes.company_id) AND (invoice.status <> 'draft'::public.invoice_status) AND (customer.user_id = ( SELECT app.current_user_id() AS current_user_id)) AND (customer.active = true)))));

CREATE POLICY invoice_credit_notes_select_policy ON public.invoice_credit_notes
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING ((EXISTS ( SELECT 1
   FROM public.invoices invoice
  WHERE ((invoice.id = invoice_credit_notes.invoice_id) AND (invoice.company_id = invoice_credit_notes.company_id)))));

CREATE POLICY invoice_credit_notes_super_admin_select ON public.invoice_credit_notes
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

-- public.invoice_history
DROP POLICY IF EXISTS invoice_history_select_access ON public.invoice_history;

CREATE POLICY invoice_history_select_policy ON public.invoice_history
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING ((EXISTS ( SELECT 1
   FROM public.invoices invoice
  WHERE ((invoice.id = invoice_history.invoice_id) AND (invoice.company_id = invoice_history.company_id)))));

CREATE POLICY invoice_history_super_admin_select ON public.invoice_history
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

-- public.invoice_payment_reminders
ALTER POLICY invoice_payment_reminders_select_policy ON public.invoice_payment_reminders
  USING (public.is_company_member(company_id));

-- public.invoice_payments
DROP POLICY IF EXISTS invoice_payments_select_access ON public.invoice_payments;

CREATE POLICY invoice_payments_select_for_linked_client ON public.invoice_payments
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING ((EXISTS ( SELECT 1
   FROM (public.invoices invoice
     JOIN public.clients customer ON (((customer.id = invoice.client_id) AND (customer.company_id = invoice.company_id))))
  WHERE ((invoice.id = invoice_payments.invoice_id) AND (invoice.company_id = invoice_payments.company_id) AND (invoice.status <> 'draft'::public.invoice_status) AND (customer.user_id = ( SELECT app.current_user_id() AS current_user_id)) AND (customer.active = true)))));

CREATE POLICY invoice_payments_select_policy ON public.invoice_payments
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING ((EXISTS ( SELECT 1
   FROM public.invoices invoice
  WHERE ((invoice.id = invoice_payments.invoice_id) AND (invoice.company_id = invoice_payments.company_id)))));

CREATE POLICY invoice_payments_super_admin_select ON public.invoice_payments
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

-- public.invoice_requests
ALTER POLICY invoice_requests_select ON public.invoice_requests
  USING ((( SELECT private.is_super_admin() AS is_super_admin) OR public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'sales'::public.company_role]) OR (( SELECT private.is_active_platform_user() AS is_active_platform_user) AND private.is_active_company(company_id) AND (EXISTS ( SELECT 1
   FROM public.clients customer
  WHERE ((customer.id = invoice_requests.client_id) AND (customer.company_id = invoice_requests.company_id) AND (customer.user_id = ( SELECT app.current_user_id() AS current_user_id)) AND customer.active))))));

-- public.invoices
DROP POLICY IF EXISTS invoices_select_access ON public.invoices;

DROP POLICY IF EXISTS invoices_insert_access ON public.invoices;

DROP POLICY IF EXISTS invoices_update_access ON public.invoices;

DROP POLICY IF EXISTS invoices_delete_access ON public.invoices;

CREATE POLICY invoices_delete_policy ON public.invoices
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING ((EXISTS ( SELECT 1
   FROM (public.company_members membership
     JOIN public.profiles p ON ((p.id = membership.user_id)))
  WHERE ((membership.company_id = invoices.company_id) AND (membership.user_id = app.current_user_id()) AND (membership.active = true) AND (p.active = true) AND (p.approved_at IS NOT NULL)))));

CREATE POLICY invoices_insert_policy ON public.invoices
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.company_members membership
     JOIN public.profiles p ON ((p.id = membership.user_id)))
  WHERE ((membership.company_id = invoices.company_id) AND (membership.user_id = app.current_user_id()) AND (membership.active = true) AND (p.active = true) AND (p.approved_at IS NOT NULL)))));

CREATE POLICY invoices_select_for_linked_client ON public.invoices
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((status <> 'draft'::public.invoice_status) AND (EXISTS ( SELECT 1
   FROM public.clients customer
  WHERE ((customer.id = invoices.client_id) AND (customer.company_id = invoices.company_id) AND (customer.user_id = ( SELECT app.current_user_id() AS current_user_id)) AND (customer.active = true))))));

CREATE POLICY invoices_select_policy ON public.invoices
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'sales'::public.company_role, 'supervisor'::public.company_role, 'member'::public.company_role]));

CREATE POLICY invoices_super_admin_select ON public.invoices
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY invoices_update_policy ON public.invoices
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING ((EXISTS ( SELECT 1
   FROM (public.company_members membership
     JOIN public.profiles p ON ((p.id = membership.user_id)))
  WHERE ((membership.company_id = invoices.company_id) AND (membership.user_id = app.current_user_id()) AND (membership.active = true) AND (p.active = true) AND (p.approved_at IS NOT NULL)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.company_members membership
     JOIN public.profiles p ON ((p.id = membership.user_id)))
  WHERE ((membership.company_id = invoices.company_id) AND (membership.user_id = app.current_user_id()) AND (membership.active = true) AND (p.active = true) AND (p.approved_at IS NOT NULL)))));

-- public.job_request_messages
ALTER POLICY job_request_messages_select ON public.job_request_messages
  USING ((private.can_manage_job_requests(company_id) OR private.is_job_request_owner(request_id) OR ( SELECT private.is_super_admin() AS is_super_admin)));

-- public.job_request_quotes
ALTER POLICY job_request_quotes_select ON public.job_request_quotes
  USING ((private.can_manage_job_requests(company_id) OR ((sent_at IS NOT NULL) AND private.is_job_request_owner(request_id)) OR ( SELECT private.is_super_admin() AS is_super_admin)));

-- public.job_request_threads
ALTER POLICY job_request_threads_select ON public.job_request_threads
  USING ((private.can_manage_job_requests(company_id) OR private.is_job_request_owner(request_id) OR ( SELECT private.is_super_admin() AS is_super_admin)));

-- public.job_requests
DROP POLICY IF EXISTS job_requests_select_access ON public.job_requests;

CREATE POLICY job_requests_select_engaged_company ON public.job_requests
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (private.has_job_request_engagement(id));

CREATE POLICY job_requests_select_open_for_contractors ON public.job_requests
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((status = 'open'::text) AND (expires_at > now()) AND (quotes_sent_count < max_quotes) AND ( SELECT private.is_active_contractor() AS is_active_contractor)));

CREATE POLICY job_requests_select_own ON public.job_requests
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING ((requester_id = ( SELECT app.current_user_id() AS current_user_id)));

CREATE POLICY job_requests_super_admin_select ON public.job_requests
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

-- public.notifications
DROP POLICY IF EXISTS notifications_select_access ON public.notifications;

DROP POLICY IF EXISTS notifications_insert_access ON public.notifications;

DROP POLICY IF EXISTS notifications_update_access ON public.notifications;

CREATE POLICY notifications_insert_own ON public.notifications
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK ((user_id = app.current_user_id()));

CREATE POLICY notifications_insert_policy ON public.notifications
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]));

CREATE POLICY notifications_select_policy ON public.notifications
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING ((user_id = app.current_user_id()));

CREATE POLICY notifications_update_policy ON public.notifications
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING ((user_id = app.current_user_id()))
  WITH CHECK ((user_id = app.current_user_id()));

-- public.platform_catalog_items
DROP POLICY IF EXISTS platform_catalog_items_select_access ON public.platform_catalog_items;

DROP POLICY IF EXISTS platform_catalog_items_insert_access ON public.platform_catalog_items;

DROP POLICY IF EXISTS platform_catalog_items_update_access ON public.platform_catalog_items;

DROP POLICY IF EXISTS platform_catalog_items_delete_access ON public.platform_catalog_items;

CREATE POLICY active_users_read_platform_catalog ON public.platform_catalog_items
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING ((( SELECT private.is_active_platform_user() AS is_active_platform_user) AND ((active = true) OR ( SELECT private.is_super_admin() AS is_super_admin))));

CREATE POLICY super_admin_manages_platform_catalog ON public.platform_catalog_items
  AS PERMISSIVE FOR ALL TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin))
  WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

-- public.profiles
DROP POLICY IF EXISTS profiles_select_access ON public.profiles;

DROP POLICY IF EXISTS profiles_insert_access ON public.profiles;

DROP POLICY IF EXISTS profiles_update_access ON public.profiles;

DROP POLICY IF EXISTS profiles_delete_access ON public.profiles;

CREATE POLICY "Company members can read related profiles" ON public.profiles
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING ((EXISTS ( SELECT 1
   FROM (public.company_members my_membership
     JOIN public.company_members related_membership ON ((related_membership.company_id = my_membership.company_id)))
  WHERE ((my_membership.user_id = app.current_user_id()) AND (my_membership.active = true) AND (related_membership.user_id = profiles.id) AND (related_membership.active = true)))));

CREATE POLICY "Users can update own profile" ON public.profiles
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING ((id = app.current_user_id()))
  WITH CHECK ((id = app.current_user_id()));

CREATE POLICY admin_web_super_admin_reads_profiles ON public.profiles
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY admin_web_super_admin_updates_profiles ON public.profiles
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin))
  WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY profiles_admin_delete ON public.profiles
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (public.is_admin());

CREATE POLICY profiles_admin_insert ON public.profiles
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (public.is_admin());

CREATE POLICY profiles_admin_update ON public.profiles
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY profiles_select_own_or_admin ON public.profiles
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((id = app.current_user_id()) OR public.is_admin()));

-- public.project_members
DROP POLICY IF EXISTS project_members_select_access ON public.project_members;

DROP POLICY IF EXISTS project_members_insert_access ON public.project_members;

DROP POLICY IF EXISTS project_members_update_access ON public.project_members;

DROP POLICY IF EXISTS project_members_delete_access ON public.project_members;

CREATE POLICY "Admins can delete project members" ON public.project_members
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (public.is_company_admin(company_id));

CREATE POLICY "Admins can insert project members" ON public.project_members
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY "Admins can update project members" ON public.project_members
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY "Members can read project members" ON public.project_members
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (public.is_company_member(company_id));

CREATE POLICY project_members_super_admin_select ON public.project_members
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

-- public.project_photos
DROP POLICY IF EXISTS project_photos_select_access ON public.project_photos;

DROP POLICY IF EXISTS project_photos_insert_access ON public.project_photos;

DROP POLICY IF EXISTS project_photos_update_access ON public.project_photos;

DROP POLICY IF EXISTS project_photos_delete_access ON public.project_photos;

CREATE POLICY project_photos_delete_policy ON public.project_photos
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'supervisor'::public.company_role]));

CREATE POLICY project_photos_insert_policy ON public.project_photos
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]));

CREATE POLICY project_photos_select_for_linked_client ON public.project_photos
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((is_private = false) AND (EXISTS ( SELECT 1
   FROM (public.projects project
     JOIN public.clients customer ON (((customer.id = project.client_id) AND (customer.company_id = project.company_id))))
  WHERE ((project.id = project_photos.project_id) AND (project.company_id = project_photos.company_id) AND (customer.user_id = ( SELECT app.current_user_id() AS current_user_id)) AND (customer.active = true))))));

CREATE POLICY project_photos_select_policy ON public.project_photos
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]));

CREATE POLICY project_photos_super_admin_select ON public.project_photos
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY project_photos_update_policy ON public.project_photos
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]))
  WITH CHECK (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]));

-- public.project_progress_history
DROP POLICY IF EXISTS project_progress_history_select_access ON public.project_progress_history;

DROP POLICY IF EXISTS project_progress_history_insert_access ON public.project_progress_history;

CREATE POLICY project_progress_history_insert_policy ON public.project_progress_history
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]));

CREATE POLICY project_progress_history_select_for_linked_client ON public.project_progress_history
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING ((EXISTS ( SELECT 1
   FROM (public.projects project
     JOIN public.clients customer ON (((customer.id = project.client_id) AND (customer.company_id = project.company_id))))
  WHERE ((project.id = project_progress_history.project_id) AND (project.company_id = project_progress_history.company_id) AND (customer.user_id = ( SELECT app.current_user_id() AS current_user_id)) AND (customer.active = true)))));

CREATE POLICY project_progress_history_select_policy ON public.project_progress_history
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]));

CREATE POLICY project_progress_history_super_admin_select ON public.project_progress_history
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

-- public.project_tasks
DROP POLICY IF EXISTS project_tasks_select_access ON public.project_tasks;

DROP POLICY IF EXISTS project_tasks_insert_access ON public.project_tasks;

DROP POLICY IF EXISTS project_tasks_update_access ON public.project_tasks;

DROP POLICY IF EXISTS project_tasks_delete_access ON public.project_tasks;

CREATE POLICY project_tasks_delete_policy ON public.project_tasks
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'supervisor'::public.company_role]));

CREATE POLICY project_tasks_insert_policy ON public.project_tasks
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]));

CREATE POLICY project_tasks_select_policy ON public.project_tasks
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]));

CREATE POLICY project_tasks_super_admin_select ON public.project_tasks
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY project_tasks_update_policy ON public.project_tasks
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]))
  WITH CHECK (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]));

-- public.projects
DROP POLICY IF EXISTS projects_select_access ON public.projects;

DROP POLICY IF EXISTS projects_insert_access ON public.projects;

DROP POLICY IF EXISTS projects_update_access ON public.projects;

DROP POLICY IF EXISTS projects_delete_access ON public.projects;

CREATE POLICY "Admins can delete projects" ON public.projects
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role]));

CREATE POLICY "Members can insert projects" ON public.projects
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]));

CREATE POLICY "Members can read projects" ON public.projects
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (public.is_company_member(company_id));

CREATE POLICY "Members can update projects" ON public.projects
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]))
  WITH CHECK (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]));

CREATE POLICY admin_web_super_admin_reads_projects ON public.projects
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY projects_select_for_linked_client ON public.projects
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING ((EXISTS ( SELECT 1
   FROM public.clients client
  WHERE ((client.id = projects.client_id) AND (client.company_id = projects.company_id) AND (client.user_id = ( SELECT app.current_user_id() AS uid)) AND (client.active = true)))));

-- public.saved_calculations
ALTER POLICY saved_calculations_delete_policy ON public.saved_calculations
  USING (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role]));

ALTER POLICY saved_calculations_insert_policy ON public.saved_calculations
  WITH CHECK (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]));

ALTER POLICY saved_calculations_select_policy ON public.saved_calculations
  USING (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role]));

ALTER POLICY saved_calculations_update_policy ON public.saved_calculations
  USING (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'sales'::public.company_role]))
  WITH CHECK (public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'sales'::public.company_role]));

-- public.supplier_prices
ALTER POLICY "Admins can delete supplier prices" ON public.supplier_prices
  USING (public.is_company_admin(company_id));

ALTER POLICY "Admins can insert supplier prices" ON public.supplier_prices
  WITH CHECK (public.is_company_admin(company_id));

ALTER POLICY "Admins can update supplier prices" ON public.supplier_prices
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

ALTER POLICY "Members can read supplier prices" ON public.supplier_prices
  USING (public.is_company_member(company_id));

-- public.suppliers
ALTER POLICY "Admins can delete suppliers" ON public.suppliers
  USING (public.is_company_admin(company_id));

ALTER POLICY "Admins can insert suppliers" ON public.suppliers
  WITH CHECK (public.is_company_admin(company_id));

ALTER POLICY "Admins can update suppliers" ON public.suppliers
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

ALTER POLICY "Members can read suppliers" ON public.suppliers
  USING (public.is_company_member(company_id));

-- public.units
DROP POLICY IF EXISTS units_select_access ON public.units;

DROP POLICY IF EXISTS units_insert_access ON public.units;

DROP POLICY IF EXISTS units_update_access ON public.units;

DROP POLICY IF EXISTS units_delete_access ON public.units;

CREATE POLICY "Admins can delete units" ON public.units
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING (public.is_company_admin(company_id));

CREATE POLICY "Admins can insert units" ON public.units
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY "Admins can update units" ON public.units
  AS PERMISSIVE FOR UPDATE TO contractor_api
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY admin_web_super_admin_manages_units ON public.units
  AS PERMISSIVE FOR ALL TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin))
  WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY admin_web_super_admin_reads_units ON public.units
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY units_manage_company_admins ON public.units
  AS PERMISSIVE FOR ALL TO contractor_api
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY units_select_company_members ON public.units
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (public.is_company_member(company_id));

-- public.user_app_settings
ALTER POLICY user_app_settings_delete ON public.user_app_settings
  USING ((user_id = app.current_user_id()));

ALTER POLICY user_app_settings_insert ON public.user_app_settings
  WITH CHECK ((user_id = app.current_user_id()));

ALTER POLICY user_app_settings_select ON public.user_app_settings
  USING ((user_id = app.current_user_id()));

ALTER POLICY user_app_settings_update ON public.user_app_settings
  USING ((user_id = app.current_user_id()))
  WITH CHECK ((user_id = app.current_user_id()));

-- public.user_push_tokens
ALTER POLICY user_push_tokens_owner_policy ON public.user_push_tokens
  USING ((user_id = app.current_user_id()))
  WITH CHECK ((user_id = app.current_user_id()));

-- 2. Índices -----------------------------------------------------------------

DROP INDEX IF EXISTS public.invoices_open_due_date_idx;
DROP INDEX IF EXISTS private.client_connection_requests_requested_by_fk_idx;

CREATE INDEX IF NOT EXISTS app_auth_identities_provider_idx ON app_auth.identities USING btree (provider);
CREATE INDEX IF NOT EXISTS budget_items_budget_idx ON public.budget_items USING btree (budget_id);
CREATE INDEX IF NOT EXISTS budget_items_section_idx ON public.budget_items USING btree (section_id);
CREATE INDEX IF NOT EXISTS budget_sections_budget_idx ON public.budget_sections USING btree (budget_id);
CREATE INDEX IF NOT EXISTS budget_versions_budget_idx ON public.budget_versions USING btree (budget_id);
CREATE INDEX IF NOT EXISTS budgets_client_idx ON public.budgets USING btree (client_id);
CREATE INDEX IF NOT EXISTS budgets_company_idx ON public.budgets USING btree (company_id);
CREATE INDEX IF NOT EXISTS budgets_project_idx ON public.budgets USING btree (project_id);
CREATE INDEX IF NOT EXISTS catalog_categories_company_idx ON public.catalog_categories USING btree (company_id);
CREATE INDEX IF NOT EXISTS catalog_items_company_idx ON public.catalog_items USING btree (company_id);
CREATE INDEX IF NOT EXISTS catalog_items_type_idx ON public.catalog_items USING btree (company_id, item_type);
CREATE INDEX IF NOT EXISTS client_addresses_client_idx ON public.client_addresses USING btree (client_id);
CREATE INDEX IF NOT EXISTS client_contacts_client_idx ON public.client_contacts USING btree (client_id);
CREATE INDEX IF NOT EXISTS clients_company_idx ON public.clients USING btree (company_id);
CREATE INDEX IF NOT EXISTS company_members_company_idx ON public.company_members USING btree (company_id);
CREATE INDEX IF NOT EXISTS project_members_company_idx ON public.project_members USING btree (company_id);
CREATE INDEX IF NOT EXISTS project_members_project_idx ON public.project_members USING btree (project_id);
CREATE INDEX IF NOT EXISTS projects_client_idx ON public.projects USING btree (client_id);
CREATE INDEX IF NOT EXISTS projects_company_idx ON public.projects USING btree (company_id);
CREATE INDEX IF NOT EXISTS supplier_prices_company_idx ON public.supplier_prices USING btree (company_id);
CREATE INDEX IF NOT EXISTS suppliers_company_idx ON public.suppliers USING btree (company_id);
CREATE INDEX IF NOT EXISTS units_active_idx ON public.units USING btree (company_id, active);
CREATE INDEX IF NOT EXISTS units_company_idx ON public.units USING btree (company_id);

-- 3. Recordatorios de pago (versión de la 033) -------------------------------

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

-- 4. Funciones auxiliares ------------------------------------------------------

ALTER FUNCTION private.is_active_platform_user() SECURITY INVOKER;

DROP FUNCTION private.active_role_company_ids(public.company_role[]);
DROP FUNCTION private.member_company_ids(public.company_role[]);
DROP FUNCTION private.member_company_ids();

ALTER TABLE private.account_deletion_storage_queue DISABLE ROW LEVEL SECURITY;

RESET ROLE;

COMMIT;
