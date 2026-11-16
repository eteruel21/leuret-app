BEGIN;

SET ROLE contractor_owner;
SET LOCAL lock_timeout = '5s';

-- La obra sigue al presupuesto.
--
-- Hasta ahora el estado de la obra solo cambiaba a mano (salvo las peticiones
-- de trabajo) y projects.contract_value nunca se llenaba: el valor de la obra
-- en el panel admin y en la app quedaba en 0 aunque el cliente aprobara.
--
-- Este disparador cubre todos los caminos (cliente desde su portal, equipo que
-- registra la respuesta, flujo de peticiones):
--   * borrador -> enviado: la obra en «Prospecto» o «Inspección» pasa a «Cotizada».
--   * -> aprobado: contract_value = total del presupuesto aprobado; la obra en
--     «Prospecto», «Inspección» o «Cotizada» pasa a «Aprobada». Una obra ya en
--     curso, pausada o terminada conserva su estado.

CREATE OR REPLACE FUNCTION private.sync_project_from_budget()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'sent'::public.budget_status AND OLD.status = 'draft'::public.budget_status THEN
    UPDATE public.projects
    SET status = 'quoted'::public.project_status,
        updated_at = now()
    WHERE id = NEW.project_id
      AND company_id = NEW.company_id
      AND status IN ('lead'::public.project_status, 'inspection'::public.project_status);
  ELSIF NEW.status = 'approved'::public.budget_status THEN
    UPDATE public.projects
    SET contract_value = NEW.total,
        status = CASE
          WHEN status IN (
            'lead'::public.project_status,
            'inspection'::public.project_status,
            'quoted'::public.project_status
          ) THEN 'approved'::public.project_status
          ELSE status
        END,
        updated_at = now()
    WHERE id = NEW.project_id
      AND company_id = NEW.company_id;
  END IF;

  RETURN NEW;
END
$function$;

CREATE OR REPLACE TRIGGER budgets_sync_project_status
  AFTER UPDATE OF status ON public.budgets
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_project_from_budget();

REVOKE EXECUTE ON FUNCTION private.sync_project_from_budget() FROM PUBLIC;

-- Obras con presupuestos ya aprobados antes de este cambio.
UPDATE public.projects AS project
SET contract_value = approved.total,
    status = CASE
      WHEN project.status IN (
        'lead'::public.project_status,
        'inspection'::public.project_status,
        'quoted'::public.project_status
      ) THEN 'approved'::public.project_status
      ELSE project.status
    END,
    updated_at = now()
FROM (
  SELECT DISTINCT ON (budget.project_id)
    budget.project_id,
    budget.company_id,
    budget.total
  FROM public.budgets AS budget
  WHERE budget.status = 'approved'::public.budget_status
  ORDER BY budget.project_id, budget.approved_at DESC NULLS LAST, budget.updated_at DESC
) AS approved
WHERE project.id = approved.project_id
  AND project.company_id = approved.company_id
  AND project.contract_value = 0;

RESET ROLE;

COMMIT;
