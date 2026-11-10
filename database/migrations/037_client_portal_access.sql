BEGIN;

SET ROLE contractor_owner;

-- Portal del cliente: lectura de facturas, avance de obra, fotos compartidas
-- y visitas para el cliente vinculado (clients.user_id = usuario actual).
--
-- Mismo patrón que budgets_select_for_linked_client: políticas SELECT
-- adicionales (permisivas, se suman con OR a las del equipo). El cliente no
-- recibe ningún permiso de escritura nuevo.
--
-- Reglas de visibilidad:
--   * Facturas: solo emitidas (nunca borradores). Pagos y notas de crédito
--     siguen a su factura.
--   * Avance: todo el historial del proyecto del cliente.
--   * Fotos: solo las que el equipo marcó como compartidas (is_private = false).
--     Hasta hoy todas se suben como privadas, así que nada cambia sin acción
--     explícita del contratista.
--   * Agenda: actividades del cliente o de sus proyectos. La API solo expone
--     columnas de cara al cliente (no las notas internas).

DROP POLICY IF EXISTS invoices_select_for_linked_client ON public.invoices;
CREATE POLICY invoices_select_for_linked_client ON public.invoices
  FOR SELECT TO contractor_api
  USING (
    status <> 'draft'::public.invoice_status
    AND EXISTS (
      SELECT 1
      FROM public.clients AS customer
      WHERE customer.id = invoices.client_id
        AND customer.company_id = invoices.company_id
        AND customer.user_id = (SELECT app.current_user_id())
        AND customer.active = true
    )
  );

DROP POLICY IF EXISTS invoice_payments_select_for_linked_client ON public.invoice_payments;
CREATE POLICY invoice_payments_select_for_linked_client ON public.invoice_payments
  FOR SELECT TO contractor_api
  USING (
    EXISTS (
      SELECT 1
      FROM public.invoices AS invoice
      JOIN public.clients AS customer
        ON customer.id = invoice.client_id
       AND customer.company_id = invoice.company_id
      WHERE invoice.id = invoice_payments.invoice_id
        AND invoice.company_id = invoice_payments.company_id
        AND invoice.status <> 'draft'::public.invoice_status
        AND customer.user_id = (SELECT app.current_user_id())
        AND customer.active = true
    )
  );

DROP POLICY IF EXISTS invoice_credit_notes_select_for_linked_client ON public.invoice_credit_notes;
CREATE POLICY invoice_credit_notes_select_for_linked_client ON public.invoice_credit_notes
  FOR SELECT TO contractor_api
  USING (
    EXISTS (
      SELECT 1
      FROM public.invoices AS invoice
      JOIN public.clients AS customer
        ON customer.id = invoice.client_id
       AND customer.company_id = invoice.company_id
      WHERE invoice.id = invoice_credit_notes.invoice_id
        AND invoice.company_id = invoice_credit_notes.company_id
        AND invoice.status <> 'draft'::public.invoice_status
        AND customer.user_id = (SELECT app.current_user_id())
        AND customer.active = true
    )
  );

DROP POLICY IF EXISTS project_progress_history_select_for_linked_client ON public.project_progress_history;
CREATE POLICY project_progress_history_select_for_linked_client ON public.project_progress_history
  FOR SELECT TO contractor_api
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects AS project
      JOIN public.clients AS customer
        ON customer.id = project.client_id
       AND customer.company_id = project.company_id
      WHERE project.id = project_progress_history.project_id
        AND project.company_id = project_progress_history.company_id
        AND customer.user_id = (SELECT app.current_user_id())
        AND customer.active = true
    )
  );

DROP POLICY IF EXISTS project_photos_select_for_linked_client ON public.project_photos;
CREATE POLICY project_photos_select_for_linked_client ON public.project_photos
  FOR SELECT TO contractor_api
  USING (
    is_private = false
    AND EXISTS (
      SELECT 1
      FROM public.projects AS project
      JOIN public.clients AS customer
        ON customer.id = project.client_id
       AND customer.company_id = project.company_id
      WHERE project.id = project_photos.project_id
        AND project.company_id = project_photos.company_id
        AND customer.user_id = (SELECT app.current_user_id())
        AND customer.active = true
    )
  );

DROP POLICY IF EXISTS activities_select_for_linked_client ON public.activities;
CREATE POLICY activities_select_for_linked_client ON public.activities
  FOR SELECT TO contractor_api
  USING (
    status <> 'cancelled'
    AND (
      EXISTS (
        SELECT 1
        FROM public.clients AS customer
        WHERE customer.id = activities.client_id
          AND customer.company_id = activities.company_id
          AND customer.user_id = (SELECT app.current_user_id())
          AND customer.active = true
      )
      OR EXISTS (
        SELECT 1
        FROM public.projects AS project
        JOIN public.clients AS customer
          ON customer.id = project.client_id
         AND customer.company_id = project.company_id
        WHERE project.id = activities.project_id
          AND project.company_id = activities.company_id
          AND customer.user_id = (SELECT app.current_user_id())
          AND customer.active = true
      )
    )
  );

-- El equipo decide qué fotos ve el cliente. Solo se puede cambiar la
-- visibilidad y la descripción; la ruta del archivo sigue inmutable.
DROP POLICY IF EXISTS project_photos_update_policy ON public.project_photos;
CREATE POLICY project_photos_update_policy ON public.project_photos
  FOR UPDATE TO contractor_api
  USING (
    public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role])
  )
  WITH CHECK (
    public.has_company_role(company_id, ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'member'::public.company_role, 'supervisor'::public.company_role, 'sales'::public.company_role])
  );

GRANT UPDATE (is_private, caption) ON public.project_photos TO contractor_api;

CREATE INDEX IF NOT EXISTS idx_activities_client
  ON public.activities(client_id)
  WHERE client_id IS NOT NULL;

RESET ROLE;

COMMIT;
