-- Insumos de las calculadoras Muro de retención, Cisterna, Enchape de paredes y Estructura metálica
-- (la Escalera usa solo concreto, acero y encofrado que ya existen). Se cargan sin precio (0): el
-- usuario lo agrega desde la app con lo que le cuesta (queda como su precio personal) y el
-- superadministrador aprueba los aportes antes de pasarlos al catálogo de todos (migración 040).
-- Azulejo, pegamento, boquilla, crucetas, varillas, formaleta, clavos y mano de obra de armado,
-- colado e impermeabilización ya existen en seeds anteriores.
-- Idempotente: solo inserta conceptos nuevos (por código).

begin;

insert into public.platform_catalog_items (
  code, sku, name, description, item_type, category_name, unit_name, unit_symbol,
  default_unit_cost, default_sale_price, default_waste_percentage, active
) values
  ('leuret:material:muro:tubo-pvc-2-barbacana-3m', 'MUR-BAR-3M', 'Tubo PVC de 2" para barbacana de muro (pieza de 3 m)', 'Insumo de la calculadora de Muro de retención. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Plomería', 'Unidad', 'und.', 0, 0, 5, true),
  ('leuret:material:muro:grava-drenaje-m3', 'MUR-GRA-M3', 'Grava de drenaje para trasdós de muro (m³)', 'Insumo de la calculadora de Muro de retención. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Agregados', 'Metro cúbico', 'm³', 0, 0, 5, true),
  ('leuret:material:cisterna:aditivo-impermeabilizante-kg', 'CIS-ADI-KG', 'Aditivo impermeabilizante integral para concreto (kg)', 'Insumo de la calculadora de Cisterna. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Concreto', 'Kilogramo', 'kg', 0, 0, 0, true),
  ('leuret:material:enchape:esquinero-enchape-2_5m', 'ENC-ESQ-25', 'Esquinero o guardacanto para enchape (pieza de 2.5 m)', 'Insumo de la calculadora de Enchape de paredes. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Pisos y revestimientos', 'Unidad', 'und.', 0, 0, 5, true),
  ('leuret:material:metalica:tubo-estructural-columna-6m', 'MET-TUB-COL', 'Tubo estructural para columna metálica (pieza de 6.1 m)', 'Insumo de la calculadora de Estructura metálica. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Acero y metal', 'Unidad', 'und.', 0, 0, 5, true),
  ('leuret:material:metalica:perfil-viga-metalica-6m', 'MET-PER-VIG', 'Perfil de viga metálica (pieza de 6.1 m)', 'Insumo de la calculadora de Estructura metálica. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Acero y metal', 'Unidad', 'und.', 0, 0, 5, true),
  ('leuret:material:metalica:correa-perfil-c-6m', 'MET-COR-C', 'Correa metálica perfil C (pieza de 6.1 m)', 'Insumo de la calculadora de Estructura metálica. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Acero y metal', 'Unidad', 'und.', 0, 0, 5, true),
  ('leuret:material:metalica:placa-base-columna', 'MET-PLA-BAS', 'Placa base de acero para columna metálica (pieza)', 'Insumo de la calculadora de Estructura metálica. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Acero y metal', 'Unidad', 'und.', 0, 0, 0, true),
  ('leuret:material:metalica:electrodo-soldadura-kg', 'MET-ELE-KG', 'Electrodo de soldadura E6011 / E7018 (kg)', 'Insumo de la calculadora de Estructura metálica. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Acero y metal', 'Kilogramo', 'kg', 0, 0, 5, true),
  ('leuret:material:metalica:pintura-anticorrosiva-galon', 'MET-PIN-GAL', 'Pintura anticorrosiva para estructura metálica (galón)', 'Insumo de la calculadora de Estructura metálica. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Pinturas', 'Galón', 'gal.', 0, 0, 5, true),
  ('leuret:labor:estructura-metalica-fabricacion-montaje-kg', 'LAB-MET-KG', 'Mano de obra de fabricación y montaje de estructura metálica (kg)', 'Insumo de la calculadora de Estructura metálica. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'labor', 'Mano de obra', 'Kilogramo', 'kg', 0, 0, 0, true)
on conflict do nothing;

commit;

-- Verificación (solo lectura):
-- select category_name, count(*) from public.platform_catalog_items
--  where sku in ('MUR-BAR-3M','MUR-GRA-M3','CIS-ADI-KG','ENC-ESQ-25','MET-TUB-COL','MET-PER-VIG','MET-COR-C','MET-PLA-BAS','MET-ELE-KG','MET-PIN-GAL','LAB-MET-KG') group by 1;
