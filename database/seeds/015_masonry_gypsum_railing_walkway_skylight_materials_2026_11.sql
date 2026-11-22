-- Insumos de las calculadoras Paredes de gypsum completas, Barandas y pasamanos, Aceras y pisos
-- exteriores y Tragaluces y claraboyas (el Muro de bloques reforzado usa bloques, cemento, arena,
-- piedra y varillas que ya existen). Se cargan sin precio (0): el usuario lo agrega desde la app con
-- lo que le cuesta (queda como su precio personal) y el superadministrador aprueba los aportes antes
-- de pasarlos al catálogo de todos (migración 040).
-- Idempotente: solo inserta conceptos nuevos (por código).

begin;

insert into public.platform_catalog_items (
  code, sku, name, description, item_type, category_name, unit_name, unit_symbol,
  default_unit_cost, default_sale_price, default_waste_percentage, active
) values
  ('leuret:material:liviano:aislante-fibra-vidrio-pared-rollo', 'LIV-AIS-ROL', 'Aislante de fibra de vidrio para paredes de gypsum (rollo de 10 m²)', 'Insumo de la calculadora de Paredes de gypsum completas. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Construcción liviana', 'Rollo', 'rollo', 0, 0, 5, true),
  ('leuret:material:baranda:tubo-poste-1_1_2-6m', 'BAR-POS-6M', 'Tubo cuadrado de 1-1/2" para poste de baranda (pieza de 6 m)', 'Insumo de la calculadora de Barandas y pasamanos. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Acero y metal', 'Unidad', 'und.', 0, 0, 5, true),
  ('leuret:material:baranda:tubo-riel-pasamano-6m', 'BAR-RIE-6M', 'Tubo para riel y pasamanos de baranda (pieza de 6 m)', 'Insumo de la calculadora de Barandas y pasamanos. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Acero y metal', 'Unidad', 'und.', 0, 0, 5, true),
  ('leuret:material:baranda:tubo-barrote-3_4-6m', 'BAR-BAR-6M', 'Tubo cuadrado de 3/4" para barrote de baranda (pieza de 6 m)', 'Insumo de la calculadora de Barandas y pasamanos. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Acero y metal', 'Unidad', 'und.', 0, 0, 5, true),
  ('leuret:labor:baranda-metalica-m', 'LAB-BAR-M', 'Mano de obra de fabricación e instalación de baranda metálica (m)', 'Insumo de la calculadora de Barandas y pasamanos. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'labor', 'Mano de obra', 'Metro', 'm', 0, 0, 0, true),
  ('leuret:labor:acera-concreto-m2', 'LAB-ACE-M2', 'Mano de obra de colado y acabado de acera de concreto (m²)', 'Insumo de la calculadora de Aceras y pisos exteriores. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'labor', 'Mano de obra', 'Metro cuadrado', 'm²', 0, 0, 0, true),
  ('leuret:material:tragaluz:policarbonato-alveolar-m2', 'TRA-POL-M2', 'Panel de policarbonato alveolar para tragaluz (m²)', 'Insumo de la calculadora de Tragaluces y claraboyas. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Techos y cubiertas', 'Metro cuadrado', 'm²', 0, 0, 10, true),
  ('leuret:material:tragaluz:perfil-aluminio-marco-6m', 'TRA-PER-6M', 'Perfil de aluminio para marco de tragaluz (pieza de 6 m)', 'Insumo de la calculadora de Tragaluces y claraboyas. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Techos y cubiertas', 'Unidad', 'und.', 0, 0, 5, true),
  ('leuret:material:tragaluz:botaguas-galvanizado-3m', 'TRA-BOT-3M', 'Botaguas galvanizado para tragaluz (pieza de 3 m)', 'Insumo de la calculadora de Tragaluces y claraboyas. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Techos y cubiertas', 'Unidad', 'und.', 0, 0, 5, true),
  ('leuret:labor:tragaluz-instalacion-und', 'LAB-TRA-UND', 'Mano de obra de instalación de tragaluz (unidad)', 'Insumo de la calculadora de Tragaluces y claraboyas. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'labor', 'Mano de obra', 'Unidad', 'und.', 0, 0, 0, true)
on conflict do nothing;

commit;

-- Verificación (solo lectura):
-- select category_name, count(*) from public.platform_catalog_items
--  where sku in ('LIV-AIS-ROL','BAR-POS-6M','BAR-RIE-6M','BAR-BAR-6M','LAB-BAR-M','LAB-ACE-M2','TRA-POL-M2','TRA-PER-6M','TRA-BOT-3M','LAB-TRA-UND') group by 1;
