BEGIN;

SET ROLE contractor_owner;

-- Rendimiento: índices para claves foráneas sin índice que las cubra.
-- Señalados por el asesor de rendimiento de Supabase (unindexed_foreign_keys).
-- Aceleran los joins, los filtros por empresa y los ON DELETE/UPDATE en cascada.

CREATE INDEX IF NOT EXISTS activities_client_id_fk_idx ON public.activities (client_id);
CREATE INDEX IF NOT EXISTS activities_created_by_fk_idx ON public.activities (created_by);
CREATE INDEX IF NOT EXISTS admin_audit_logs_user_id_fk_idx ON public.admin_audit_logs (user_id);
CREATE INDEX IF NOT EXISTS budget_change_history_company_id_fk_idx ON public.budget_change_history (company_id);
CREATE INDEX IF NOT EXISTS budget_change_history_performed_by_fk_idx ON public.budget_change_history (performed_by);
CREATE INDEX IF NOT EXISTS budget_items_budget_id_company_id_fk_idx ON public.budget_items (budget_id, company_id);
CREATE INDEX IF NOT EXISTS budget_items_catalog_item_id_company_id_fk_idx ON public.budget_items (catalog_item_id, company_id);
CREATE INDEX IF NOT EXISTS budget_items_section_id_budget_id_company_id_fk_idx ON public.budget_items (section_id, budget_id, company_id);
CREATE INDEX IF NOT EXISTS budget_sections_budget_id_company_id_fk_idx ON public.budget_sections (budget_id, company_id);
CREATE INDEX IF NOT EXISTS budget_versions_budget_id_company_id_fk_idx ON public.budget_versions (budget_id, company_id);
CREATE INDEX IF NOT EXISTS budget_versions_created_by_fk_idx ON public.budget_versions (created_by);
CREATE INDEX IF NOT EXISTS budgets_approved_by_fk_idx ON public.budgets (approved_by);
CREATE INDEX IF NOT EXISTS budgets_client_id_company_id_fk_idx ON public.budgets (client_id, company_id);
CREATE INDEX IF NOT EXISTS budgets_created_by_fk_idx ON public.budgets (created_by);
CREATE INDEX IF NOT EXISTS budgets_project_id_company_id_fk_idx ON public.budgets (project_id, company_id);
CREATE INDEX IF NOT EXISTS calculation_formula_parameter__formula_company_fk_idx ON public.calculation_formula_parameter_history (formula_id, company_id);
CREATE INDEX IF NOT EXISTS calculation_formula_parameters_formula_id_company_id_fk_idx ON public.calculation_formula_parameters (formula_id, company_id);
CREATE INDEX IF NOT EXISTS catalog_categories_parent_id_company_id_fk_idx ON public.catalog_categories (parent_id, company_id);
CREATE INDEX IF NOT EXISTS catalog_items_category_id_company_id_fk_idx ON public.catalog_items (category_id, company_id);
CREATE INDEX IF NOT EXISTS catalog_items_unit_id_company_id_fk_idx ON public.catalog_items (unit_id, company_id);
CREATE INDEX IF NOT EXISTS catalog_price_history_changed_by_fk_idx ON public.catalog_price_history (changed_by);
CREATE INDEX IF NOT EXISTS catalog_price_history_catalog_item_id_company_id_fk_idx ON public.catalog_price_history (catalog_item_id, company_id);
CREATE INDEX IF NOT EXISTS catalog_yields_catalog_item_id_company_id_fk_idx ON public.catalog_yields (catalog_item_id, company_id);
CREATE INDEX IF NOT EXISTS catalog_yields_output_unit_id_company_id_fk_idx ON public.catalog_yields (output_unit_id, company_id);
CREATE INDEX IF NOT EXISTS client_addresses_client_id_company_id_fk_idx ON public.client_addresses (client_id, company_id);
CREATE INDEX IF NOT EXISTS client_contacts_client_id_company_id_fk_idx ON public.client_contacts (client_id, company_id);
CREATE INDEX IF NOT EXISTS clients_created_by_fk_idx ON public.clients (created_by);
CREATE INDEX IF NOT EXISTS company_invitations_invited_by_fk_idx ON public.company_invitations (invited_by);
CREATE INDEX IF NOT EXISTS invoice_credit_notes_cancelled_by_fk_idx ON public.invoice_credit_notes (cancelled_by);
CREATE INDEX IF NOT EXISTS invoice_credit_notes_issued_by_fk_idx ON public.invoice_credit_notes (issued_by);
CREATE INDEX IF NOT EXISTS invoice_history_actor_user_id_fk_idx ON public.invoice_history (actor_user_id);
CREATE INDEX IF NOT EXISTS invoice_payments_created_by_fk_idx ON public.invoice_payments (created_by);
CREATE INDEX IF NOT EXISTS invoice_payments_reversed_by_fk_idx ON public.invoice_payments (reversed_by);
CREATE INDEX IF NOT EXISTS invoices_created_by_fk_idx ON public.invoices (created_by);
CREATE INDEX IF NOT EXISTS invoices_issued_by_fk_idx ON public.invoices (issued_by);
CREATE INDEX IF NOT EXISTS notifications_company_id_fk_idx ON public.notifications (company_id);
CREATE INDEX IF NOT EXISTS platform_catalog_price_history_changed_by_fk_idx ON public.platform_catalog_price_history (changed_by);
CREATE INDEX IF NOT EXISTS profiles_approved_by_fk_idx ON public.profiles (approved_by);
CREATE INDEX IF NOT EXISTS project_members_company_id_user_id_fk_idx ON public.project_members (company_id, user_id);
CREATE INDEX IF NOT EXISTS project_members_project_id_company_id_fk_idx ON public.project_members (project_id, company_id);
CREATE INDEX IF NOT EXISTS project_photos_company_id_fk_idx ON public.project_photos (company_id);
CREATE INDEX IF NOT EXISTS project_photos_task_id_fk_idx ON public.project_photos (task_id);
CREATE INDEX IF NOT EXISTS project_progress_history_company_id_fk_idx ON public.project_progress_history (company_id);
CREATE INDEX IF NOT EXISTS project_progress_history_created_by_fk_idx ON public.project_progress_history (created_by);
CREATE INDEX IF NOT EXISTS project_tasks_company_id_fk_idx ON public.project_tasks (company_id);
CREATE INDEX IF NOT EXISTS project_tasks_created_by_fk_idx ON public.project_tasks (created_by);
CREATE INDEX IF NOT EXISTS projects_address_id_client_id_company_id_fk_idx ON public.projects (address_id, client_id, company_id);
CREATE INDEX IF NOT EXISTS projects_client_id_company_id_fk_idx ON public.projects (client_id, company_id);
CREATE INDEX IF NOT EXISTS projects_created_by_fk_idx ON public.projects (created_by);
CREATE INDEX IF NOT EXISTS saved_calculations_created_by_fk_idx ON public.saved_calculations (created_by);
CREATE INDEX IF NOT EXISTS supplier_prices_catalog_item_id_company_id_fk_idx ON public.supplier_prices (catalog_item_id, company_id);
CREATE INDEX IF NOT EXISTS supplier_prices_supplier_id_company_id_fk_idx ON public.supplier_prices (supplier_id, company_id);

-- Políticas RLS permisivas duplicadas (multiple_permissive_policies).
-- Postgres evalúa TODAS las políticas permisivas de una acción por fila, así que
-- las copias exactas o subsumidas solo cuestan rendimiento. Se eliminan únicamente
-- las que no cambian quién puede ver o editar qué:

-- Copias exactas de *_select_company_members (is_company_member(company_id)).
DROP POLICY IF EXISTS "Members can read catalog categories" ON public.catalog_categories;
DROP POLICY IF EXISTS "Members can read catalog items" ON public.catalog_items;
DROP POLICY IF EXISTS "Members can read units" ON public.units;

-- id = current_user_id() ya está cubierto por profiles_select_own_or_admin.
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "admin_web_user_reads_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own_profile" ON public.profiles;

-- La 012 creó "Admins can update clients" (owner/admin/sales) pero no quitó la
-- política original, que dejaba editar clientes a cualquier miembro. La API ya
-- exige owner/admin/sales en PUT /clients y owner/admin en desactivar, así que
-- quitarla no cambia nada para la app y cierra el hueco a nivel de base de datos.
DROP POLICY IF EXISTS "Members can update clients" ON public.clients;

RESET ROLE;

COMMIT;
