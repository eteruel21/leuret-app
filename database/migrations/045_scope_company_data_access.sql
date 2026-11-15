BEGIN;

SET ROLE contractor_owner;

CREATE FUNCTION private.is_active_company(requested_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies AS company
    WHERE company.id = requested_company_id AND company.active
  );
$$;

REVOKE ALL ON FUNCTION private.is_active_company(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_active_company(uuid) TO contractor_api, contractor_migrator;

CREATE OR REPLACE FUNCTION public.has_company_role(requested_company_id uuid, allowed_roles public.company_role[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.is_active_platform_user()
    AND private.is_active_company(requested_company_id)
    AND EXISTS (
      SELECT 1 FROM public.company_members AS member
      WHERE member.company_id = requested_company_id
        AND member.user_id = app.current_user_id()
        AND member.active
        AND member.role = ANY(allowed_roles)
    );
$$;

DROP POLICY clients_select_own_link ON public.clients;
CREATE POLICY clients_select_own_link ON public.clients
  FOR SELECT TO contractor_api
  USING (user_id = (SELECT app.current_user_id()) AND active AND private.is_active_company(company_id));

-- La política separada del portal solo permite facturas publicadas al cliente vinculado.
DROP POLICY invoices_select_policy ON public.invoices;
CREATE POLICY invoices_select_policy ON public.invoices
  FOR SELECT TO contractor_api
  USING (
    public.has_company_role(company_id, ARRAY['owner', 'admin', 'estimator', 'sales', 'supervisor', 'member']::public.company_role[])
  );

ALTER POLICY invoice_requests_select ON public.invoice_requests
  USING (
    (SELECT private.is_super_admin())
    OR public.has_company_role(company_id, ARRAY['owner', 'admin', 'sales']::public.company_role[])
    OR (
      (SELECT private.is_active_platform_user())
      AND private.is_active_company(company_id)
      AND EXISTS (
        SELECT 1 FROM public.clients AS customer
        WHERE customer.id = invoice_requests.client_id
          AND customer.company_id = invoice_requests.company_id
          AND customer.user_id = (SELECT app.current_user_id())
          AND customer.active
      )
    )
  );

-- El historial incluye copias de costos y notas internas.
DROP POLICY budget_change_history_select_policy ON public.budget_change_history;
CREATE POLICY budget_change_history_select_policy ON public.budget_change_history
  FOR SELECT TO contractor_api
  USING (public.has_company_role(company_id, ARRAY['owner', 'admin', 'estimator']::public.company_role[]));

CREATE FUNCTION private.can_manage_job_requests(requested_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT public.has_company_role(
    requested_company_id, ARRAY['owner', 'admin', 'estimator', 'sales']::public.company_role[]
  );
$$;

REVOKE ALL ON FUNCTION private.can_manage_job_requests(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_manage_job_requests(uuid) TO contractor_api, contractor_migrator;

CREATE OR REPLACE FUNCTION private.has_job_request_engagement(requested_request_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.job_request_threads AS thread
    WHERE thread.request_id = requested_request_id AND private.can_manage_job_requests(thread.company_id)
  ) OR EXISTS (
    SELECT 1 FROM public.job_request_quotes AS quote
    WHERE quote.request_id = requested_request_id AND private.can_manage_job_requests(quote.company_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.job_request_contact_revealed(requested_request_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.job_request_quotes AS quote
    WHERE quote.request_id = requested_request_id
      AND quote.sent_at IS NOT NULL
      AND private.can_manage_job_requests(quote.company_id)
  );
$$;

ALTER POLICY job_request_threads_select ON public.job_request_threads
  USING (
    private.can_manage_job_requests(company_id)
    OR private.is_job_request_owner(request_id)
    OR (SELECT private.is_super_admin())
  );

ALTER POLICY job_request_messages_select ON public.job_request_messages
  USING (
    private.can_manage_job_requests(company_id)
    OR private.is_job_request_owner(request_id)
    OR (SELECT private.is_super_admin())
  );

ALTER POLICY job_request_quotes_select ON public.job_request_quotes
  USING (
    private.can_manage_job_requests(company_id)
    OR (sent_at IS NOT NULL AND private.is_job_request_owner(request_id))
    OR (SELECT private.is_super_admin())
  );

CREATE OR REPLACE FUNCTION public.mark_job_request_thread_read(requested_request_id uuid, requested_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_active_platform_user() THEN
    RETURN false;
  END IF;

  IF private.is_job_request_owner(requested_request_id) THEN
    UPDATE public.job_request_threads SET client_last_read_at = now()
    WHERE request_id = requested_request_id AND company_id = requested_company_id;
  ELSIF private.can_manage_job_requests(requested_company_id) THEN
    UPDATE public.job_request_threads SET company_last_read_at = now()
    WHERE request_id = requested_request_id AND company_id = requested_company_id;
  ELSE
    RETURN false;
  END IF;

  RETURN FOUND;
END;
$$;

RESET ROLE;

COMMIT;
