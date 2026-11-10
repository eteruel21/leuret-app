-- Catálogo de insumos individuales para las calculadoras de LEURET.
-- Propuesta para aplicar tras revisión y autorización del propietario.
-- Los 1,169 conceptos de Contraloría son partidas de SERVICIO, no materiales individuales.
-- Se crean referencias genéricas SIN PRECIOS: deben cotizarse antes de presupuestar.
-- Idempotente: no altera costos ya registrados ni elimina datos existentes.
BEGIN;

INSERT INTO public.platform_catalog_items
  (code, sku, name, description, item_type, category_name, unit_name, unit_symbol,
   default_unit_cost, default_sale_price, default_waste_percentage, active)
VALUES
  ('leuret:material:cemento-portland-42_5kg', 'MAT-CEM-425',
   'Cemento Portland 42.5 kg (saco)',
   'Insumo individual. Precio pendiente: configurar según proveedor y ubicación.',
   'material', 'Cementos y morteros', 'Saco', 'saco', 0, 0, 0, true),
  ('leuret:material:arena-lavada-m3', 'MAT-ARE-M3',
   'Arena lavada para concreto (m³)',
   'Insumo individual. Precio pendiente: configurar según proveedor y ubicación.',
   'material', 'Agregados', 'Metro cúbico', 'm³', 0, 0, 0, true),
  ('leuret:material:gravilla-m3', 'MAT-GRA-M3',
   'Gravilla para concreto (m³)',
   'Insumo individual. Precio pendiente: configurar según proveedor y ubicación.',
   'material', 'Agregados', 'Metro cúbico', 'm³', 0, 0, 0, true),
  ('leuret:material:piedra-triturada-m3', 'MAT-PIE-M3',
   'Piedra triturada para concreto (m³)',
   'Insumo individual. Precio pendiente: configurar según proveedor y ubicación.',
   'material', 'Agregados', 'Metro cúbico', 'm³', 0, 0, 0, true),
  ('leuret:material:bloque-4', 'MAT-BLO-4',
   'Bloque de concreto de 4 pulgadas',
   'Insumo individual. Precio pendiente: configurar según proveedor y ubicación.',
   'material', 'Bloques y mampostería', 'Unidad', 'und.', 0, 0, 0, true),
  ('leuret:material:bloque-6', 'MAT-BLO-6',
   'Bloque de concreto de 6 pulgadas',
   'Insumo individual. Precio pendiente: configurar según proveedor y ubicación.',
   'material', 'Bloques y mampostería', 'Unidad', 'und.', 0, 0, 0, true),
  ('leuret:material:bloque-8', 'MAT-BLO-8',
   'Bloque de concreto de 8 pulgadas',
   'Insumo individual. Precio pendiente: configurar según proveedor y ubicación.',
   'material', 'Bloques y mampostería', 'Unidad', 'und.', 0, 0, 0, true),
  ('leuret:labor:concreto-m3', 'LAB-CON-M3',
   'Mano de obra de colocación de concreto (m³)',
   'Solo mano de obra; no incluye cemento ni agregados. Precio pendiente.',
   'labor', 'Mano de obra', 'Metro cúbico', 'm³', 0, 0, 0, true),
  ('leuret:labor:bloques-m2', 'LAB-BLO-M2',
   'Mano de obra de colocación de bloques (m²)',
   'Solo mano de obra. Precio pendiente.',
   'labor', 'Mano de obra', 'Metro cuadrado', 'm²', 0, 0, 0, true),
  ('leuret:labor:repello-m2', 'LAB-REP-M2',
   'Mano de obra de repello (m²)',
   'Solo mano de obra. Precio pendiente.',
   'labor', 'Mano de obra', 'Metro cuadrado', 'm²', 0, 0, 0, true)
ON CONFLICT DO NOTHING;

COMMIT;

-- Verificación de solo lectura tras aplicación:
-- SELECT item_type::text, count(*)::int FROM public.platform_catalog_items
-- WHERE code LIKE 'leuret:%' GROUP BY item_type;
