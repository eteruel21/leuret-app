-- Restablece el permiso mínimo para crear presupuestos desde un proyecto.
-- La API autentica la solicitud y autoriza únicamente owner/admin/estimator.
-- La función sigue siendo SECURITY INVOKER y se aplican las políticas RLS.
-- Diagnóstico (2026-11-09): SQLSTATE 42501 en la llamada a
-- public.create_project_budget(...) desde el rol contractor_api.
BEGIN;

REVOKE EXECUTE ON FUNCTION public.create_project_budget(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_project_budget(uuid, uuid, text) TO contractor_api;

COMMIT;

-- Verificación después de aplicar (lectura):
-- SELECT has_function_privilege(
--   'contractor_api',
--   'public.create_project_budget(uuid, uuid, text)',
--   'EXECUTE'
-- );
--
-- Rollback, solo si se requiere:
-- REVOKE EXECUTE ON FUNCTION public.create_project_budget(uuid, uuid, text)
--   FROM contractor_api;
