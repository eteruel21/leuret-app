BEGIN;

SET ROLE contractor_owner;
SET LOCAL lock_timeout = '5s';

-- Un presupuesto puede cotizar trabajo para un cliente antes de abrir una obra.
-- La clave foránea existente sigue validando los presupuestos que sí tienen obra.
ALTER TABLE public.budgets ALTER COLUMN project_id DROP NOT NULL;

COMMENT ON TABLE public.budgets IS
  'Presupuestos de una empresa y cliente, asociados opcionalmente a una obra.';

RESET ROLE;

COMMIT;
