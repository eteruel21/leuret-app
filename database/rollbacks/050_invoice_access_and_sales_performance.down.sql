-- REVERSIÓN de 050_invoice_access_and_sales_performance.sql
--
-- No es una migración: migrate.mjs no lee esta carpeta. Si hiciera falta
-- revertir la 050, copia este archivo como una migración nueva y aplícala con
-- el proceso normal (docs/database-change-process.md). Nunca edites la 050.
--
-- Vuelve a dejar las facturas visibles para todo el equipo (políticas de la 048)
-- y quita el disparador de propiedad de ventas.

BEGIN;

SET ROLE contractor_owner;
SET LOCAL lock_timeout = '5s';

DROP FUNCTION IF EXISTS public.company_sales_performance(uuid, integer, uuid);
DROP INDEX IF EXISTS public.budget_change_history_company_sent_idx;
DROP TRIGGER IF EXISTS invoices_enforce_sales_ownership ON public.invoices;
DROP TRIGGER IF EXISTS invoice_payments_enforce_sales_ownership ON public.invoice_payments;
DROP TRIGGER IF EXISTS invoice_credit_notes_enforce_sales_ownership ON public.invoice_credit_notes;
DROP FUNCTION IF EXISTS private.enforce_sales_invoice_ownership();

DROP POLICY IF EXISTS invoices_select_access ON public.invoices;
CREATE POLICY invoices_select_access ON public.invoices
  AS PERMISSIVE FOR SELECT TO contractor_api
  USING (((( SELECT private.is_super_admin() AS is_super_admin)) OR ((company_id = ANY (( SELECT private.active_role_company_ids(ARRAY['owner'::public.company_role, 'admin'::public.company_role, 'estimator'::public.company_role, 'sales'::public.company_role, 'supervisor'::public.company_role, 'member'::public.company_role]) AS active_role_company_ids)::uuid[]))) OR (((status <> 'draft'::public.invoice_status) AND (EXISTS ( SELECT 1
   FROM public.clients customer
  WHERE ((customer.id = invoices.client_id) AND (customer.company_id = invoices.company_id) AND (customer.user_id = ( SELECT app.current_user_id() AS current_user_id)) AND (customer.active = true))))))));
-- Reemplaza: invoices_insert_policy
DROP POLICY IF EXISTS invoices_insert_access ON public.invoices;
CREATE POLICY invoices_insert_access ON public.invoices
  AS PERMISSIVE FOR INSERT TO contractor_api
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.company_members membership
     JOIN public.profiles p ON ((p.id = membership.user_id)))
  WHERE ((membership.company_id = invoices.company_id) AND (membership.user_id = ( SELECT app.current_user_id() AS current_user_id)) AND (membership.active = true) AND (p.active = true) AND (p.approved_at IS NOT NULL)))));

-- Reemplaza: invoices_update_policy
DROP POLICY IF EXISTS invoices_update_access ON public.invoices;
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
DROP POLICY IF EXISTS invoices_delete_access ON public.invoices;
CREATE POLICY invoices_delete_access ON public.invoices
  AS PERMISSIVE FOR DELETE TO contractor_api
  USING ((EXISTS ( SELECT 1
   FROM (public.company_members membership
     JOIN public.profiles p ON ((p.id = membership.user_id)))
  WHERE ((membership.company_id = invoices.company_id) AND (membership.user_id = ( SELECT app.current_user_id() AS current_user_id)) AND (membership.active = true) AND (p.active = true) AND (p.approved_at IS NOT NULL)))));

ALTER POLICY invoice_payment_reminders_select_policy ON public.invoice_payment_reminders
  USING ((company_id = ANY (( SELECT private.member_company_ids() AS member_company_ids)::uuid[])));

RESET ROLE;

COMMIT;
