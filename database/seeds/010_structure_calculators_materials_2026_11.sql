-- Insumos de las calculadoras Excavación y relleno, Encofrado y Estructura. Se cargan sin precio (0):
-- el usuario lo agrega desde la app con lo que le cuesta (queda como su precio personal) y el
-- superadministrador aprueba los aportes antes de pasarlos al catálogo de todos (migración 040).
-- El plywood, los clavos, el cemento, la arena, la piedra, las varillas y el alambre de amarre ya
-- existen en los seeds 003 al 008. Los nombres coinciden con las palabras clave de cada campo.
-- Idempotente: solo inserta conceptos nuevos (por código).

begin;

insert into public.platform_catalog_items (
  code, sku, name, description, item_type, category_name, unit_name, unit_symbol,
  default_unit_cost, default_sale_price, default_waste_percentage, active
) values
  ('leuret:labor:excavacion-m3', 'LAB-EXC-M3', 'Mano de obra de excavación (m³)', 'Insumo de la calculadora de Excavación y relleno. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'labor', 'Mano de obra', 'Metro cúbico', 'm³', 0, 0, 0, true),
  ('leuret:labor:relleno-compactado-m3', 'LAB-REL-M3', 'Mano de obra de relleno y compactación (m³)', 'Insumo de la calculadora de Excavación y relleno. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'labor', 'Mano de obra', 'Metro cúbico', 'm³', 0, 0, 0, true),
  ('leuret:labor:acarreo-volquete-viaje', 'LAB-ACA-VIA', 'Acarreo en volquete de material de excavación (viaje)', 'Insumo de la calculadora de Excavación y relleno. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'labor', 'Mano de obra', 'Viaje', 'viaje', 0, 0, 0, true),
  ('leuret:material:relleno:material-selecto-m3', 'REL-SEL-M3', 'Material selecto para relleno (m³)', 'Insumo de la calculadora de Excavación y relleno. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Agregados', 'Metro cúbico', 'm³', 0, 0, 5, true),
  ('leuret:material:encofrado:regla-madera-2x4-12ft', 'ENC-REG-2X4', 'Regla de madera 2x4 x 12 pies para formaleta', 'Insumo de la calculadora de Encofrado. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Maderas y formaletas', 'Unidad', 'und.', 0, 0, 5, true),
  ('leuret:labor:encofrado-m2', 'LAB-ENC-M2', 'Mano de obra de armado y desarmado de encofrado (m²)', 'Insumo de la calculadora de Encofrado. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'labor', 'Mano de obra', 'Metro cuadrado', 'm²', 0, 0, 0, true),
  ('leuret:labor:colado-concreto-m3', 'LAB-COL-M3', 'Mano de obra de colado y vibrado de concreto (m³)', 'Insumo de la calculadora de Estructura. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'labor', 'Mano de obra', 'Metro cúbico', 'm³', 0, 0, 0, true)
on conflict do nothing;

commit;

-- Verificación (solo lectura):
-- select category_name, count(*) from public.platform_catalog_items
--  where sku in ('LAB-EXC-M3','LAB-REL-M3','LAB-ACA-VIA','REL-SEL-M3','ENC-REG-2X4','LAB-ENC-M2','LAB-COL-M3') group by 1;
