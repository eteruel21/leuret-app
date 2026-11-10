BEGIN;

SET ROLE contractor_owner;

-- Desglose de materiales por partida, para la lista de compras.
-- Las calculadoras guardan aquí lo que hay que comprar:
-- [{ "name": "Cemento", "quantity": 12, "unit": "saco", "cost": 98.4 }, ...]
-- "cost" es el costo total estimado de la línea y es opcional.

ALTER TABLE public.budget_items
  ADD COLUMN IF NOT EXISTS materials jsonb;

ALTER TABLE public.budget_items
  DROP CONSTRAINT IF EXISTS budget_items_materials_shape;

ALTER TABLE public.budget_items
  ADD CONSTRAINT budget_items_materials_shape
  CHECK (
    materials IS NULL
    OR (
      jsonb_typeof(materials) = 'array'
      AND jsonb_array_length(materials) <= 50
      AND pg_column_size(materials) <= 16384
    )
  );

RESET ROLE;

COMMIT;
