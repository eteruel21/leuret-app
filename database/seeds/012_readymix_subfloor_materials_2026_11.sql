-- Insumos de las calculadoras Concreto premezclado y Contrapiso y zócalo. Se cargan sin precio (0):
-- el usuario lo agrega desde la app con lo que le cuesta (queda como su precio personal) y el
-- superadministrador aprueba los aportes antes de pasarlos al catálogo de todos (migración 040).
-- El concreto premezclado por m³, el cemento y la arena ya existen en seeds anteriores. Los nombres
-- coinciden con las palabras clave de cada campo de las calculadoras.
-- Idempotente: solo inserta conceptos nuevos (por código).

begin;

insert into public.platform_catalog_items (
  code, sku, name, description, item_type, category_name, unit_name, unit_symbol,
  default_unit_cost, default_sale_price, default_waste_percentage, active
) values
  ('leuret:material:premezclado:recargo-carga-corta', 'PRE-REC-COR', 'Recargo por carga corta de concreto premezclado (global)', 'Insumo de la calculadora de Concreto premezclado. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Concreto', 'Global', 'global', 0, 0, 0, true),
  ('leuret:material:premezclado:servicio-bomba', 'PRE-BOM-SER', 'Servicio de bomba para concreto premezclado (global)', 'Insumo de la calculadora de Concreto premezclado. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Concreto', 'Global', 'global', 0, 0, 0, true),
  ('leuret:labor:colocacion-vibrado-concreto-m3', 'LAB-VIB-M3', 'Mano de obra de colocación y vibrado de concreto premezclado (m³)', 'Insumo de la calculadora de Concreto premezclado. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'labor', 'Mano de obra', 'Metro cúbico', 'm³', 0, 0, 0, true),
  ('leuret:material:piso:zocalo-ceramico-60cm', 'PIS-ZOC-60', 'Zócalo de cerámica o porcelanato (pieza de 60 cm)', 'Insumo de la calculadora de Contrapiso y zócalo. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Pisos y revestimientos', 'Unidad', 'und.', 0, 0, 10, true),
  ('leuret:material:piso:adhesivo-zocalo-saco-5kg', 'PIS-ADH-ZOC', 'Adhesivo para zócalo y cerámica (saco de 5 kg)', 'Insumo de la calculadora de Contrapiso y zócalo. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Pisos y revestimientos', 'Saco', 'saco', 0, 0, 5, true),
  ('leuret:labor:contrapiso-m2', 'LAB-CON-M2', 'Mano de obra de contrapiso de mortero (m²)', 'Insumo de la calculadora de Contrapiso y zócalo. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'labor', 'Mano de obra', 'Metro cuadrado', 'm²', 0, 0, 0, true),
  ('leuret:labor:instalacion-zocalo-m', 'LAB-ZOC-M', 'Mano de obra de instalación de zócalo (m)', 'Insumo de la calculadora de Contrapiso y zócalo. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'labor', 'Mano de obra', 'Metro', 'm', 0, 0, 0, true)
on conflict do nothing;

commit;

-- Verificación (solo lectura):
-- select category_name, count(*) from public.platform_catalog_items
--  where sku in ('PRE-REC-COR','PRE-BOM-SER','LAB-VIB-M3','PIS-ZOC-60','PIS-ADH-ZOC','LAB-CON-M2','LAB-ZOC-M') group by 1;
