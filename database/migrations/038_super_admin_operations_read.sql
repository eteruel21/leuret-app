BEGIN;

SET ROLE contractor_owner;

-- Centro de control del panel admin: el superadministrador activo puede LEER
-- obras, tareas, presupuestos, facturación, clientes y agenda de todas las
-- empresas para dar soporte. Son políticas permisivas adicionales de solo
-- lectura; las políticas por membresía de empresa no cambian y las escrituras
-- no se amplían.

DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'project_tasks',
    'project_progress_history',
    'project_members',
    'budgets',
    'budget_versions',
    'budget_sections',
    'budget_items',
    'invoices',
    'invoice_payments',
    'invoice_credit_notes',
    'invoice_history',
    'client_contacts',
    'client_addresses',
    'activities'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target || '_super_admin_select', target);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO contractor_api USING ((SELECT private.is_super_admin()))',
      target || '_super_admin_select',
      target
    );
  END LOOP;
END
$$;

-- Bitácora de auditoría: el superadministrador lee todas las acciones, no
-- solo las de suspensión de empresas (política de 031, que se reemplaza).
DROP POLICY IF EXISTS admin_audit_logs_super_admin_company_status_select ON public.admin_audit_logs;
DROP POLICY IF EXISTS admin_audit_logs_super_admin_select ON public.admin_audit_logs;
CREATE POLICY admin_audit_logs_super_admin_select
ON public.admin_audit_logs
FOR SELECT TO contractor_api
USING ((SELECT private.is_super_admin()));

-- Las acciones del panel que no pertenecen a una empresa (por ejemplo, cerrar
-- las sesiones de un usuario) se registran sin company_id. Las políticas
-- por empresa siguen comparando company_id, así que una fila sin empresa
-- solo la ve el superadministrador.
ALTER TABLE public.admin_audit_logs ALTER COLUMN company_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
ON public.admin_audit_logs (created_at DESC);

DROP POLICY IF EXISTS admin_audit_logs_super_admin_company_status_insert ON public.admin_audit_logs;
CREATE POLICY admin_audit_logs_super_admin_company_status_insert
ON public.admin_audit_logs
FOR INSERT TO contractor_api
WITH CHECK (
  (SELECT private.is_super_admin())
  AND user_id = (SELECT app.current_user_id())
  AND action IN ('COMPANY_SUSPENDED', 'COMPANY_REACTIVATED', 'ADMIN_SESSIONS_REVOKED')
);

RESET ROLE;

COMMIT;
