BEGIN;

SET ROLE contractor_owner;

-- El super administrador puede suspender o reactivar empresas desde el panel
-- (política admin_web_super_admin_updates_companies). Para que quede
-- constancia de quién lo hizo y por qué, se le permite escribir y leer
-- únicamente registros de esas dos acciones en el historial de la empresa.

DROP POLICY IF EXISTS admin_audit_logs_super_admin_company_status_insert ON public.admin_audit_logs;
CREATE POLICY admin_audit_logs_super_admin_company_status_insert
ON public.admin_audit_logs
FOR INSERT TO contractor_api
WITH CHECK (
  (SELECT private.is_super_admin())
  AND user_id = (SELECT app.current_user_id())
  AND action IN ('COMPANY_SUSPENDED', 'COMPANY_REACTIVATED')
);

DROP POLICY IF EXISTS admin_audit_logs_super_admin_company_status_select ON public.admin_audit_logs;
CREATE POLICY admin_audit_logs_super_admin_company_status_select
ON public.admin_audit_logs
FOR SELECT TO contractor_api
USING (
  (SELECT private.is_super_admin())
  AND action IN ('COMPANY_SUSPENDED', 'COMPANY_REACTIVATED')
);

RESET ROLE;

COMMIT;
