-- REVERSIÓN de 049_project_sync_from_budgets.sql
--
-- No es una migración: migrate.mjs no lee esta carpeta. Si hiciera falta
-- revertir la 049, copia este archivo como una migración nueva y aplícala con
-- el proceso normal (docs/database-change-process.md). Nunca edites la 049.
--
-- Quita el disparador y su función. Los valores de contrato y estados que el
-- disparador o el relleno inicial ya escribieron en public.projects se
-- conservan (son datos correctos del presupuesto aprobado).

BEGIN;

SET ROLE contractor_owner;
SET LOCAL lock_timeout = '5s';

DROP TRIGGER IF EXISTS budgets_sync_project_status ON public.budgets;
DROP FUNCTION IF EXISTS private.sync_project_from_budget();

RESET ROLE;

COMMIT;
